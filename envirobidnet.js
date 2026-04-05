const axios = require('axios');
const cheerio = require('cheerio');

const TIMEOUT = 20000;
const DAYS = 30;

// Credentials — stored as Railway env vars (never hardcoded in public repo)
const EBN_USER = process.env.ENVIROBIDNET_USER || 'divyasrigl';
const EBN_PASS = process.env.ENVIROBIDNET_PASS || 'Sriglobal23*';

// Exact categories checked in SRI Global search
const CATEGORIES = [
  { slug: 'scada-and-environmental-technology',       label: 'SCADA & Environmental Technology' },
  { slug: 'civil-engineering',                        label: 'Civil Engineering - all services' },
  { slug: 'consulting-engineering',                   label: 'Consulting/Engineering' },
  { slug: 'environmental-engineering-and-consulting', label: 'Environmental Engineering and Consulting' },
  { slug: 'architect',                                label: 'Architect' },
  { slug: 'water-tanks-standpipes',                   label: 'Water Tanks & Standpipes' },
];

// Search keywords — pulls only Engineering/Professional/Architectural bids
const KEYWORDS = [
  'Engineering or Professional',
  'Professional Engineering',
  'Architectural Engineering',
];

// Relevance filter — must match at least one
const RELEVANT = [
  'engineering','professional','architectural','architect',
  'scada','instrumentation','electrical','controls','e&i',
  'water','wastewater','wtp','wwtp','lift station','pump station',
  'generator','plc','design','consultant','treatment','infrastructure'
];

async function scrapeEnviroBidNet() {
  const bids = [];
  const seen = new Set();

  // ── Step 1: Get login page for CSRF token ──────────────────
  let sessionCookie = '';
  let csrf = '';

  try {
    console.log('[EnviroBidNet] Getting login page...');
    const loginPage = await axios.get('https://envirobidnet.com/login', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
      timeout: TIMEOUT,
      maxRedirects: 5
    });

    const $lp = cheerio.load(loginPage.data);
    csrf = $lp('input[name="_token"]').val()
      || $lp('input[name="csrf_token"]').val()
      || $lp('input[name="authenticity_token"]').val()
      || '';

    const initCookies = (loginPage.headers['set-cookie'] || [])
      .map(c => c.split(';')[0]).join('; ');

    console.log('[EnviroBidNet] CSRF:', csrf ? 'found' : 'not found');

    // ── Step 2: POST login ─────────────────────────────────
    console.log('[EnviroBidNet] Logging in as:', EBN_USER);
    const loginRes = await axios.post(
      'https://envirobidnet.com/login',
      new URLSearchParams({
        email:    EBN_USER,
        username: EBN_USER,
        password: EBN_PASS,
        _token:   csrf,
        remember: '1'
      }).toString(),
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': 'https://envirobidnet.com/login',
          'Cookie': initCookies,
          'Accept': 'text/html,application/xhtml+xml',
          'Origin': 'https://envirobidnet.com',
        },
        timeout: TIMEOUT,
        maxRedirects: 5,
        validateStatus: s => s < 500
      }
    );

    const respCookies = (loginRes.headers['set-cookie'] || [])
      .map(c => c.split(';')[0]);
    sessionCookie = [...initCookies.split('; '), ...respCookies]
      .filter(Boolean).join('; ');

    // Verify login worked
    const bodyText = typeof loginRes.data === 'string' ? loginRes.data : '';
    const loginOK = !bodyText.includes('Invalid credentials')
      && !bodyText.includes('Login failed')
      && !bodyText.includes('incorrect')
      && (loginRes.status === 200 || loginRes.status === 302);

    if (loginOK) {
      console.log('[EnviroBidNet] Login successful');
    } else {
      console.warn('[EnviroBidNet] Login may have failed — continuing anyway');
    }

  } catch(err) {
    console.warn('[EnviroBidNet] Login error:', err.message);
    return { bids: [], source: 'EnviroBidNet' };
  }

  // ── Step 3: Search with each keyword across categories ────
  for (const keyword of KEYWORDS) {
    for (const cat of CATEGORIES) {
      const urls = [
        `https://envirobidnet.com/bids/${cat.slug}/all?state=TX&days=${DAYS}&q=${encodeURIComponent(keyword)}`,
        `https://envirobidnet.com/bids/${cat.slug}/all?state=TX&q=${encodeURIComponent(keyword)}`,
        `https://envirobidnet.com/bids/${cat.slug}/all?state=TX&days=${DAYS}`,
      ];

      for (const url of urls) {
        try {
          const res = await axios.get(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml',
              'Referer': 'https://envirobidnet.com',
              'Cookie': sessionCookie,
            },
            timeout: TIMEOUT,
            maxRedirects: 5
          });

          const $ = cheerio.load(res.data);
          const before = bids.length;

          // Table layout (most common on EnviroBidNet)
          const selectors = [
            'table.bids-table tbody tr',
            'table tbody tr',
            '.bid-listing tr',
            'tr.bid-row',
            '.listing-row',
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
                const stateCell = $(cells).filter((i, c) => $(c).text().trim().length === 2).first().text().trim();
                const due = $(el).find('[class*="due"],[class*="date"],[class*="close"]').first().text().trim()
                  || $(cells[cells.length - 2]).text().trim()
                  || $(cells[cells.length - 1]).text().trim();
                const link = $(el).find('a').first().attr('href') || '';

                if (!name || name.length < 5) return;
                if (/^(title|bid|project|agency|due|date|state|category|description)$/i.test(name.trim())) return;
                if (stateCell && stateCell.length === 2 && stateCell.toUpperCase() !== 'TX') return;

                const key = name.slice(0, 50).toLowerCase();
                if (seen.has(key)) return;

                // Must match relevance filter
                const text = (name + ' ' + agency + ' ' + cat.label + ' ' + keyword).toLowerCase();
                if (!RELEVANT.some(k => text.includes(k))) return;

                seen.add(key);
                bids.push({
                  id: 'ebn-' + Buffer.from(name + agency).toString('base64').slice(0, 14),
                  source: 'EnviroBidNet',
                  name,
                  agency: agency || 'Texas Agency',
                  city: 'Texas',
                  region: detectRegion(agency + ' ' + name),
                  scope: `${cat.label} — ${keyword} (TX, ${DAYS} days)`,
                  due: cleanDate(due) || 'See link',
                  value: 'TBD',
                  status: detectStatus(due),
                  url: link.startsWith('http') ? link : link ? 'https://envirobidnet.com' + link : url,
                  scrapedAt: new Date().toISOString()
                });
              } catch(e) {}
            });
            break; // Found a working selector
          }

          const found = bids.length - before;
          if (found > 0) {
            console.log(`[EnviroBidNet] "${keyword}" / ${cat.label}: +${found} bids`);
            break; // URL worked, move to next category
          }

          await sleep(1500);
        } catch(err) {
          console.warn(`[EnviroBidNet] ${cat.label} failed:`, err.message);
        }
      }

      await sleep(2000);
    }
  }

  // ── Step 4: Also run keyword-only search across all TX bids ──
  for (const keyword of KEYWORDS) {
    try {
      const searchUrl = `https://envirobidnet.com/bids/all?state=TX&days=${DAYS}&q=${encodeURIComponent(keyword)}`;
      const res = await axios.get(searchUrl, {
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
          const text = (name + ' ' + agency + ' ' + keyword).toLowerCase();
          if (!RELEVANT.some(k => text.includes(k))) return;
          seen.add(key);
          bids.push({
            id: 'ebn-kw-' + Buffer.from(name + agency).toString('base64').slice(0, 14),
            source: 'EnviroBidNet', name,
            agency: agency || 'Texas Agency', city: 'Texas', region: 'statewide',
            scope: `Engineering/Professional/Architectural Services — TX (${DAYS} days)`,
            due: cleanDate(due) || 'See link', value: 'TBD',
            status: detectStatus(due),
            url: link.startsWith('http') ? link : 'https://envirobidnet.com' + link,
            scrapedAt: new Date().toISOString()
          });
        } catch(e) {}
      });
      await sleep(2000);
    } catch(err) {
      console.warn('[EnviroBidNet] Keyword search failed:', err.message);
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
