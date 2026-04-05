const axios = require('axios');
const cheerio = require('cheerio');

const TIMEOUT = 20000;
const DAYS = 30;

const EBN_USER = process.env.ENVIROBIDNET_USER || 'divyasrigl';
const EBN_PASS = process.env.ENVIROBIDNET_PASS || 'Sriglobal23*';

const CATEGORIES = [
  { slug: 'civil-engineering',                        label: 'Civil Engineering - all services' },
  { slug: 'consulting-engineering',                   label: 'Consulting/Engineering' },
  { slug: 'environmental-engineering-and-consulting', label: 'Environmental Engineering and Consulting' },
  { slug: 'scada-and-environmental-technology',       label: 'SCADA & Environmental Technology' },
  { slug: 'water-wastewater',                         label: 'Water, Wastewater Treatment' },
];

const KEYWORDS = [
  'Engineering or Professional',
  'Professional Engineering',
  'Architectural Engineering',
];

const RELEVANT = [
  'engineering','professional','architectural','architect',
  'scada','instrumentation','electrical','controls','e&i',
  'water','wastewater','wtp','wwtp','lift station','pump station',
  'generator','plc','design','consultant','treatment','infrastructure'
];

async function scrapeEnviroBidNet() {
  const bids = [];
  const seen = new Set();
  let sessionCookie = '';

  // ── Step 1: Inspect login form to get exact field names ───
  try {
    console.log('[EnviroBidNet] Fetching login page...');
    const loginPage = await axios.get('https://envirobidnet.com/login', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: TIMEOUT,
      maxRedirects: 5
    });

    const $lp = cheerio.load(loginPage.data);
    const initCookies = (loginPage.headers['set-cookie'] || []).map(c => c.split(';')[0]).join('; ');

    // Get ALL form fields dynamically — don't assume field names
    const formData = {};
    $lp('form input, form select').each((i, el) => {
      const name = $lp(el).attr('name');
      const val  = $lp(el).attr('value') || '';
      const type = $lp(el).attr('type') || 'text';
      if (!name) return;
      if (type === 'hidden' || type === 'submit') {
        formData[name] = val; // Keep hidden fields (CSRF etc)
      }
    });

    // Set credentials using common field name patterns
    const emailFields  = ['email','username','user','login','user_email','Email','Username'];
    const passFields   = ['password','pass','passwd','Password','Pass'];

    for (const f of emailFields) {
      if ($lp(`input[name="${f}"]`).length > 0) { formData[f] = EBN_USER; break; }
    }
    for (const f of passFields) {
      if ($lp(`input[name="${f}"]`).length > 0) { formData[f] = EBN_PASS; break; }
    }

    // Fallback — set both common names just in case
    if (!Object.keys(formData).some(k => emailFields.includes(k))) {
      formData['email']    = EBN_USER;
      formData['username'] = EBN_USER;
    }
    if (!Object.keys(formData).some(k => passFields.includes(k))) {
      formData['password'] = EBN_PASS;
    }

    // Get form action URL
    const formAction = $lp('form').attr('action') || '/login';
    const postUrl = formAction.startsWith('http') ? formAction : 'https://envirobidnet.com' + formAction;

    console.log('[EnviroBidNet] Login form fields:', Object.keys(formData).join(', '));
    console.log('[EnviroBidNet] Posting to:', postUrl);
    console.log('[EnviroBidNet] User:', EBN_USER);

    // ── Step 2: POST login ────────────────────────────────
    const loginRes = await axios.post(
      postUrl,
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
        timeout: TIMEOUT,
        maxRedirects: 10,
        validateStatus: s => s < 500
      }
    );

    // Collect all cookies from response
    const respCookies = (loginRes.headers['set-cookie'] || []).map(c => c.split(';')[0]);
    sessionCookie = [...initCookies.split('; '), ...respCookies].filter(c => c && c.includes('=')).join('; ');

    // Check login result
    const body = typeof loginRes.data === 'string' ? loginRes.data : '';
    const loginFailed = body.toLowerCase().includes('invalid')
      || body.toLowerCase().includes('incorrect password')
      || body.toLowerCase().includes('login failed')
      || body.toLowerCase().includes('wrong password');
    const loginOK = !loginFailed && (
      loginRes.status === 302
      || body.includes('dashboard')
      || body.includes('logout')
      || body.includes('my account')
      || body.includes('Welcome')
      || loginRes.request?.path === '/'
      || loginRes.request?.path?.includes('dashboard')
    );

    console.log('[EnviroBidNet] Login status:', loginRes.status, '| OK:', loginOK);
    if (!loginOK) {
      console.warn('[EnviroBidNet] Login uncertain — will try scraping anyway');
    } else {
      console.log('[EnviroBidNet] Login confirmed successful');
    }

  } catch(err) {
    console.warn('[EnviroBidNet] Login error:', err.message);
    return { bids: [], source: 'EnviroBidNet' };
  }

  // ── Step 3: Scrape each category with TX state + keywords ─
  for (const keyword of KEYWORDS) {
    for (const cat of CATEGORIES) {
      // TX is default state — include in URL
      const urls = [
        `https://envirobidnet.com/bids/${cat.slug}/all?state=TX&days=${DAYS}&q=${encodeURIComponent(keyword)}`,
        `https://envirobidnet.com/bids/${cat.slug}/all?state=TX&q=${encodeURIComponent(keyword)}`,
        `https://envirobidnet.com/bids/${cat.slug}/all?state=TX&days=${DAYS}`,
      ];

      let gotResults = false;
      for (const url of urls) {
        if (gotResults) break;
        try {
          const res = await axios.get(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'text/html,application/xhtml+xml',
              'Referer': 'https://envirobidnet.com',
              'Cookie': sessionCookie,
            },
            timeout: TIMEOUT,
            maxRedirects: 5
          });

          const $ = cheerio.load(res.data);
          const before = bids.length;

          const selectors = [
            'table.bids-table tbody tr',
            'table tbody tr',
            '.bid-listing tr',
            'tr.bid-row',
            '.listing-row',
            '[class*="bid-item"]',
          ];

          for (const sel of selectors) {
            const rows = $(sel);
            if (rows.length < 2) continue;

            rows.each((i, el) => {
              try {
                const cells = $(el).find('td');
                if (cells.length < 2) return;

                const name = $(el).find('[class*="title"],[class*="name"],a').first().text().trim()
                  || $(cells[0]).text().trim();
                const agency = $(el).find('[class*="agency"],[class*="owner"]').first().text().trim()
                  || $(cells[1]).text().trim();
                const stateCell = $(cells).filter((i, c) => /^[A-Z]{2}$/.test($(c).text().trim())).first().text().trim();
                const due = $(el).find('[class*="due"],[class*="date"],[class*="close"]').first().text().trim()
                  || $(cells[cells.length - 2]).text().trim()
                  || $(cells[cells.length - 1]).text().trim();
                const link = $(el).find('a').first().attr('href') || '';

                if (!name || name.length < 5) return;
                if (/^(title|bid|project|agency|due|date|state|category|description)$/i.test(name.trim())) return;
                // Only TX bids (TX is default state in URL but double-check)
                if (stateCell && stateCell.length === 2 && stateCell.toUpperCase() !== 'TX') return;

                const key = name.slice(0, 50).toLowerCase();
                if (seen.has(key)) return;

                const text = (name + ' ' + agency + ' ' + cat.label + ' ' + keyword).toLowerCase();
                if (!RELEVANT.some(k => text.includes(k))) return;

                seen.add(key);
                bids.push({
                  id: 'ebn-' + Buffer.from(name + agency).toString('base64').slice(0, 14),
                  source: 'EnviroBidNet', name,
                  agency: agency || 'Texas Agency',
                  city: 'Texas', region: detectRegion(agency + ' ' + name),
                  scope: `${cat.label} — ${keyword} (TX, ${DAYS} days)`,
                  due: cleanDate(due) || 'See link', value: 'TBD',
                  status: detectStatus(due),
                  url: link.startsWith('http') ? link : link ? 'https://envirobidnet.com' + link : url,
                  scrapedAt: new Date().toISOString()
                });
              } catch(e) {}
            });

            if (bids.length > before) { gotResults = true; break; }
          }

          if (gotResults) console.log(`[EnviroBidNet] ${cat.label} / "${keyword}": +${bids.length - before} bids`);
          await sleep(1500);
        } catch(err) {
          console.warn(`[EnviroBidNet] ${cat.label} failed:`, err.message);
        }
      }
      await sleep(1500);
    }
  }

  // ── Step 4: Broad TX keyword search as fallback ───────────
  for (const keyword of KEYWORDS) {
    try {
      const url = `https://envirobidnet.com/bids/all?state=TX&days=${DAYS}&q=${encodeURIComponent(keyword)}`;
      const res = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Cookie': sessionCookie,
          'Referer': 'https://envirobidnet.com',
        },
        timeout: TIMEOUT
      });

      const $ = cheerio.load(res.data);
      $('table tbody tr').each((i, el) => {
        try {
          const cells = $(el).find('td');
          if (cells.length < 2) return;
          const name = $(cells[0]).text().trim();
          const agency = $(cells[1]).text().trim();
          const due = $(cells[cells.length - 1]).text().trim();
          const link = $(el).find('a').first().attr('href') || '';
          if (!name || name.length < 5) return;
          const key = name.slice(0, 50).toLowerCase();
          if (seen.has(key)) return;
          const text = (name + ' ' + agency).toLowerCase();
          if (!RELEVANT.some(k => text.includes(k))) return;
          seen.add(key);
          bids.push({
            id: 'ebn-kw-' + Buffer.from(name + agency).toString('base64').slice(0, 14),
            source: 'EnviroBidNet', name,
            agency: agency || 'Texas Agency', city: 'Texas', region: 'statewide',
            scope: `Engineering/Professional Services — TX (${DAYS} days)`,
            due: cleanDate(due) || 'See link', value: 'TBD',
            status: detectStatus(due),
            url: link.startsWith('http') ? link : 'https://envirobidnet.com' + link,
            scrapedAt: new Date().toISOString()
          });
        } catch(e) {}
      });
      await sleep(2000);
    } catch(err) {
      console.warn('[EnviroBidNet] Broad search failed:', err.message);
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
