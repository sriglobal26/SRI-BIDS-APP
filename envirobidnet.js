const axios = require('axios');
const cheerio = require('cheerio');

const TIMEOUT = 25000;
const DAYS = 30;

const EBN_USER = process.env.ENVIROBIDNET_USER || 'divyasrigl';
const EBN_PASS = process.env.ENVIROBIDNET_PASS || 'Sriglobal23*';

// Updated categories matching exact EnviroBidNet selection
const CATEGORIES = [
  { slug: 'civil-engineering',                        label: 'Civil Engineering' },
  { slug: 'consulting-engineering',                   label: 'Consulting/Engineering' },
  { slug: 'environmental-engineering-and-consulting', label: 'Environmental Engineering' },
  { slug: 'scada-and-environmental-technology',       label: 'SCADA & Environmental Technology' },
  { slug: 'water-wastewater',                         label: 'Water/Wastewater Treatment' },
];

// Search keywords
const KEYWORDS = ['Engineering or Professional', 'Professional Engineering', 'Architectural Engineering'];

const RELEVANT = [
  'engineering','professional','architectural','architect','scada',
  'instrumentation','electrical','controls','e&i','water','wastewater',
  'wtp','wwtp','lift station','pump station','generator','plc','design',
  'consultant','treatment','infrastructure'
];

async function scrapeEnviroBidNet() {
  const bids = [];
  const seen = new Set();
  let sessionCookie = '';

  // ── Step 1: Login ─────────────────────────────────────────
  try {
    console.log('[EnviroBidNet] Fetching login page...');
    const loginPage = await axios.get('https://envirobidnet.com/login', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      timeout: TIMEOUT, maxRedirects: 5
    });

    const $lp = cheerio.load(loginPage.data);
    const initCookies = (loginPage.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');

    // Read ALL form fields
    const formData = {};
    $lp('form input, form select').each((i, el) => {
      const name = $lp(el).attr('name');
      const val  = $lp(el).attr('value') || '';
      const type = ($lp(el).attr('type') || 'text').toLowerCase();
      if (!name) return;
      if (type === 'hidden') formData[name] = val;
    });

    // Log what fields exist on the form
    const allInputs = [];
    $lp('form input').each((i, el) => {
      allInputs.push($lp(el).attr('name') + ':' + ($lp(el).attr('type') || 'text'));
    });
    console.log('[EnviroBidNet] Form inputs found:', allInputs.join(', ') || 'NONE');

    // Set credentials — try all common field name patterns
    formData['email']    = EBN_USER;
    formData['username'] = EBN_USER;
    formData['password'] = EBN_PASS;
    formData['pass']     = EBN_PASS;
    formData['remember'] = '1';

    const formAction = $lp('form').attr('action') || '/login';
    const postUrl = formAction.startsWith('http') ? formAction : 'https://envirobidnet.com' + (formAction.startsWith('/') ? formAction : '/' + formAction);
    console.log('[EnviroBidNet] Posting login to:', postUrl);
    console.log('[EnviroBidNet] Form data keys:', Object.keys(formData).join(', '));

    const loginRes = await axios.post(postUrl,
      new URLSearchParams(formData).toString(),
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://envirobidnet.com/login',
          'Origin': 'https://envirobidnet.com',
          'Cookie': initCookies,
          'Accept': 'text/html,application/xhtml+xml',
        },
        timeout: TIMEOUT, maxRedirects: 10, validateStatus: s => s < 500
      }
    );

    const respCookies = (loginRes.headers['set-cookie'] || []).map(c => c.split(';')[0]);
    sessionCookie = [...initCookies.split('; '), ...respCookies].filter(c => c && c.includes('=')).join('; ');

    const body = typeof loginRes.data === 'string' ? loginRes.data : '';
    console.log('[EnviroBidNet] Login response status:', loginRes.status);
    console.log('[EnviroBidNet] Login redirect to:', loginRes.request?.path || 'none');
    console.log('[EnviroBidNet] Response contains logout link:', body.includes('logout') || body.includes('Logout'));
    console.log('[EnviroBidNet] Response contains error:', body.toLowerCase().includes('invalid') || body.toLowerCase().includes('incorrect'));
    // Log first 300 chars of response to debug
    console.log('[EnviroBidNet] Response preview:', body.slice(0, 300).replace(/\n/g, ' '));

  } catch(err) {
    console.error('[EnviroBidNet] Login error:', err.message);
    return { bids: [], source: 'EnviroBidNet' };
  }

  // ── Step 2: Try multiple URL patterns to find bids ────────
  // EnviroBidNet URL patterns vary — try all known ones
  const urlPatterns = [];

  for (const keyword of KEYWORDS) {
    for (const cat of CATEGORIES) {
      // Pattern A: category slug with query
      urlPatterns.push(`https://envirobidnet.com/bids/${cat.slug}/all?state=TX&days=${DAYS}&q=${encodeURIComponent(keyword)}`);
      // Pattern B: search endpoint
      urlPatterns.push(`https://envirobidnet.com/search?category=${encodeURIComponent(cat.label)}&state=TX&q=${encodeURIComponent(keyword)}&days=${DAYS}`);
    }
    // Pattern C: broad TX search with keyword
    urlPatterns.push(`https://envirobidnet.com/bids/all?state=TX&days=${DAYS}&q=${encodeURIComponent(keyword)}`);
    // Pattern D: search page
    urlPatterns.push(`https://envirobidnet.com/bids?state=TX&days=${DAYS}&q=${encodeURIComponent(keyword)}`);
  }

  for (const url of urlPatterns) {
    try {
      const res = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Referer': 'https://envirobidnet.com',
          'Cookie': sessionCookie,
        },
        timeout: TIMEOUT, maxRedirects: 5, validateStatus: s => s < 500
      });

      if (res.status !== 200) continue;

      const $ = cheerio.load(res.data);
      const before = bids.length;

      // Log page title + row count for debugging
      const pageTitle = $('title').text().trim();
      const tableRows = $('table tbody tr').length;
      const allRows = $('tr').length;
      if (tableRows > 1 || allRows > 5) {
        console.log(`[EnviroBidNet] URL: ${url.slice(0, 80)}`);
        console.log(`[EnviroBidNet] Page: "${pageTitle}" | tbody rows: ${tableRows} | all rows: ${allRows}`);
      }

      // Try all selector patterns
      const selectors = [
        'table.bids-table tbody tr',
        'table tbody tr',
        '.bid-listing tr',
        'tr.bid-row',
        '.listing-row',
        '[class*="bid-item"]',
        '[class*="bid-card"]',
        '.result-row',
        'table tr',
      ];

      for (const sel of selectors) {
        const rows = $(sel);
        if (rows.length < 2) continue;

        let parsed = 0;
        rows.each((i, el) => {
          try {
            const cells = $(el).find('td');
            if (cells.length < 2) return;

            const name = $(el).find('[class*="title"],[class*="name"],a').first().text().trim()
              || $(cells[0]).text().trim();
            const agency = $(el).find('[class*="agency"],[class*="owner"]').first().text().trim()
              || $(cells[1]).text().trim();
            const stateCell = $(cells).filter((j, c) => /^[A-Z]{2}$/.test($(c).text().trim())).first().text().trim();
            const due = $(el).find('[class*="due"],[class*="date"],[class*="close"]').first().text().trim()
              || $(cells[cells.length - 2]).text().trim()
              || $(cells[cells.length - 1]).text().trim();
            const link = $(el).find('a').first().attr('href') || '';

            if (!name || name.length < 5) return;
            if (/^(title|bid|project|agency|due|date|state|category|description|no\.)$/i.test(name.trim())) return;
            if (stateCell && stateCell.length === 2 && stateCell.toUpperCase() !== 'TX') return;

            const key = name.slice(0, 50).toLowerCase();
            if (seen.has(key)) return;

            const text = (name + ' ' + agency).toLowerCase();
            if (!RELEVANT.some(k => text.includes(k))) return;

            seen.add(key);
            parsed++;
            bids.push({
              id: 'ebn-' + Buffer.from(name + agency).toString('base64').slice(0, 14),
              source: 'EnviroBidNet', name,
              agency: agency || 'Texas Agency',
              city: 'Texas', region: detectRegion(agency + ' ' + name),
              scope: `Engineering/Professional Services — TX (${DAYS} days)`,
              due: cleanDate(due) || 'See link', value: 'TBD',
              status: detectStatus(due),
              url: link.startsWith('http') ? link : link ? 'https://envirobidnet.com' + link : url,
              scrapedAt: new Date().toISOString()
            });
          } catch(e) {}
        });

        if (parsed > 0) {
          console.log(`[EnviroBidNet] ✅ Found ${parsed} bids using selector: ${sel}`);
          break;
        }
      }

      await sleep(1000);
    } catch(err) {
      // Skip quietly — too many URLs to log all failures
    }
  }

  console.log('[EnviroBidNet] Total:', bids.length, 'bids');
  return { bids, source: 'EnviroBidNet' };
}

function cleanDate(str) {
  if (!str) return '';
  const match = str.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\w+\s+\d{1,2},?\s+\d{4}/i);
  return match ? match[0] : str.replace(/due|close|date|:/gi, '').trim().slice(0, 30);
}

function detectRegion(text = '') {
  const t = text.toLowerCase();
  if (['houston','pearland','baytown','pasadena','katy','sugar land','league city','conroe','galveston'].some(h => t.includes(h))) return 'houston';
  if (['dallas','plano','fort worth','arlington','denton','frisco'].some(h => t.includes(h))) return 'dfw';
  if (t.includes('austin')) return 'austin';
  if (t.includes('san antonio')) return 'sa';
  return 'statewide';
}

function detectStatus(due = '') {
  try {
    const d = new Date(due);
    const diff = (d - Date.now()) / 86400000;
    if (isNaN(diff)) return 'active';
    if (diff <= 7) return 'closing';
    return diff <= 30 ? 'active' : 'prebid';
  } catch { return 'active'; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { scrapeEnviroBidNet };
