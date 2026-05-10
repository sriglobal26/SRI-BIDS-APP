const axios = require('axios');
const cheerio = require('cheerio');

const TIMEOUT = 20000;

// CivCast credentials — stored in Railway env vars
const CC_USER = process.env.CIVCAST_USER || 'Water';
const CC_PASS = process.env.CIVCAST_PASS || 'Sriglobal24*';

// Primary search keyword — "Engineering Services" as requested
const SEARCHES = [
  { kw: 'Engineering Services',    label: 'Engineering Services' },
  { kw: 'Professional Engineering', label: 'Professional Engineering' },
  { kw: 'scada water',             label: 'SCADA Water' },
  { kw: 'electrical water',        label: 'Electrical Water' },
  { kw: 'wastewater engineering',  label: 'Wastewater Engineering' },
];

// Relevance filter
const RELEVANT = [
  'engineering','professional','scada','instrumentation','electrical',
  'controls','e&i','water','wastewater','wtp','wwtp','lift station',
  'pump station','generator','plc','vfd','design','consultant',
  'treatment','infrastructure','architectural'
];

async function scrapeCivCast() {
  const bids = [];
  const seen = new Set();
  let sessionCookie = '';

  // Step 1: Login
  try {
    console.log('[CivCast] Logging in...');
    const loginPage = await axios.get('https://www.civcastusa.com/login', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: TIMEOUT, maxRedirects: 5
    });

    const $lp = cheerio.load(loginPage.data);
    const csrf = $lp('input[name="_token"]').val()
      || $lp('input[name="csrf_token"]').val()
      || $lp('input[name="__RequestVerificationToken"]').val() || '';
    const initCookies = (loginPage.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');

    const loginRes = await axios.post('https://www.civcastusa.com/login',
      new URLSearchParams({ username: CC_USER, email: CC_USER, password: CC_PASS, _token: csrf, remember: '1' }).toString(),
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://www.civcastusa.com/login',
          'Cookie': initCookies,
          'Accept': 'text/html,application/xhtml+xml',
          'Origin': 'https://www.civcastusa.com',
        },
        timeout: TIMEOUT, maxRedirects: 5, validateStatus: s => s < 500
      }
    );

    const respCookies = (loginRes.headers['set-cookie'] || []).map(c => c.split(';')[0]);
    sessionCookie = [...initCookies.split('; '), ...respCookies].filter(Boolean).join('; ');
    const body = typeof loginRes.data === 'string' ? loginRes.data.toLowerCase() : '';
    console.log('[CivCast] Login:', body.includes('invalid') || body.includes('incorrect') ? 'may have failed' : 'OK');
  } catch(err) {
    console.warn('[CivCast] Login error:', err.message, '— continuing without session');
  }

  // Step 2: Search with each keyword
  for (const { kw, label } of SEARCHES) {
    try {
      const url = `https://www.civcastusa.com/bids?keywords=${encodeURIComponent(kw)}&state=TX&timeInfo=0`;
      console.log(`[CivCast] Searching: "${kw}"`);

      const res = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Referer': 'https://www.civcastusa.com',
          'Cookie': sessionCookie,
        },
        timeout: TIMEOUT, maxRedirects: 5
      });

      const $ = cheerio.load(res.data);
      const before = bids.length;

      // Try card selectors first
      const selectors = ['.bid-list-item','.bid-card','[class*="bid-item"]','[class*="BidItem"]','[class*="project-item"]','.search-result','.result-item','tr.bid-row'];
      let found = false;

      for (const sel of selectors) {
        const items = $(sel);
        if (items.length === 0) continue;
        found = true;
        items.each((i, el) => {
          try {
            const name = $(el).find('[class*="title"],[class*="name"],h2,h3,h4').first().text().trim() || $(el).find('a').first().text().trim();
            const agency = $(el).find('[class*="agency"],[class*="owner"],[class*="entity"]').first().text().trim();
            const due = $(el).find('[class*="due"],[class*="date"],[class*="close"],[class*="deadline"]').first().text().trim();
            const city = $(el).find('[class*="city"],[class*="location"],[class*="county"]').first().text().trim();
            const link = $(el).find('a[href*="bid"]').first().attr('href') || $(el).find('a').first().attr('href') || '';
            const bidId = $(el).attr('data-bid-id') || $(el).attr('id') || null;
            if (!name || name.length < 5) return;
            const key = name.slice(0, 40).toLowerCase();
            if (seen.has(key)) return;
            const text = (name + ' ' + agency + ' ' + kw).toLowerCase();
            if (!RELEVANT.some(k => text.includes(k))) return;
            seen.add(key);
            bids.push({
              id: 'civcast-' + (bidId || Buffer.from(name + agency).toString('base64').slice(0, 12)),
              source: 'CivCast', name, agency: agency || 'Texas Agency',
              city: city || 'Texas', region: detectRegion(city),
              scope: extractScope($, el) || 'Engineering Services — See CivCast for full scope',
              due: cleanDate(due) || 'See link', value: extractValue($, el) || 'TBD',
              status: detectStatus(due),
              url: link.startsWith('http') ? link : link ? 'https://www.civcastusa.com' + link : url,
              scrapedAt: new Date().toISOString()
            });
          } catch(e) {}
        });
        break;
      }

      // Fallback table rows
      if (!found) {
        $('table tbody tr').each((i, el) => {
          try {
            const cells = $(el).find('td');
            if (cells.length < 2) return;
            const name = $(cells[0]).text().trim() || $(cells[1]).text().trim();
            const agency = $(cells[1]).text().trim();
            const due = $(cells[cells.length - 1]).text().trim();
            const link = $(el).find('a').first().attr('href') || '';
            if (!name || name.length < 5) return;
            if (/^(title|bid|name|agency|due|date)$/i.test(name.trim())) return;
            const key = name.slice(0, 40).toLowerCase();
            if (seen.has(key)) return;
            const text = (name + ' ' + agency + ' ' + kw).toLowerCase();
            if (!RELEVANT.some(k => text.includes(k))) return;
            seen.add(key);
            bids.push({
              id: 'civcast-' + Buffer.from(name + agency).toString('base64').slice(0, 12),
              source: 'CivCast', name, agency: agency || 'Texas Agency',
              city: 'Texas', region: 'statewide',
              scope: 'Engineering Services — See CivCast for full scope',
              due: cleanDate(due) || 'See link', value: 'TBD',
              status: detectStatus(due),
              url: link.startsWith('http') ? link : 'https://www.civcastusa.com' + link,
              scrapedAt: new Date().toISOString()
            });
          } catch(e) {}
        });
      }

      console.log(`[CivCast] "${label}": +${bids.length - before} bids`);
      await sleep(2000);
    } catch(err) {
      console.warn(`[CivCast] "${label}" failed:`, err.message);
    }
  }

  console.log('[CivCast] Total:', bids.length, 'bids');
  return { bids, source: 'CivCast' };
}

function extractScope($, el) {
  return $(el).find('[class*="desc"],[class*="scope"],[class*="summary"],p').first().text().trim().slice(0, 200);
}

function extractValue($, el) {
  const txt = $(el).find('[class*="value"],[class*="amount"],[class*="cost"],[class*="estimate"]').first().text().trim();
  if (txt && /\$/.test(txt)) return txt;
  const match = $(el).text().match(/\$[\d,]+(?:\.\d+)?(?:\s*(?:M|K|million|thousand))?/i);
  return match ? match[0] : null;
}

function cleanDate(str) {
  if (!str) return '';
  const match = str.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\w+\s+\d{1,2},?\s+\d{4}/i);
  return match ? match[0] : str.replace(/due|close|date|:/gi, '').trim().slice(0, 30);
}

function detectRegion(city = '') {
  const c = city.toLowerCase();
  if (['houston','pearland','baytown','pasadena','katy','sugar land','league city','conroe','galveston'].some(h => c.includes(h))) return 'houston';
  if (['dallas','plano','fort worth','arlington','denton','frisco'].some(h => c.includes(h))) return 'dfw';
  if (c.includes('austin')) return 'austin';
  if (c.includes('san antonio')) return 'sa';
  return 'statewide';
}

function detectStatus(due = '') {
  try {
    const d = new Date(due);
    const diff = (d - Date.now()) / 86400000;
    if (isNaN(diff)) return 'active';
    if (diff < 0) return 'active';
    if (diff <= 7) return 'closing';
    return diff <= 30 ? 'active' : 'prebid';
  } catch { return 'active'; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { scrapeCivCast };
