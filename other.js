const axios = require('axios');
const cheerio = require('cheerio');

const TIMEOUT = 15000;

// ─── NIGP CODES FOR SRI GLOBAL ───────────────────────────────
const NIGP_CODES = [
  { code: '925-33', label: 'Engineering Services Professional' },
  { code: '925-97', label: 'Water Supply Treatment Distribution Engineering' },
  { code: '925-93', label: 'Wastewater Treatment Engineering' },
  { code: '925-31', label: 'Electrical Engineering' },
  { code: '925-57', label: 'Instrumentation Engineering' }
];

// ─── H2BID ───────────────────────────────────────────────────
async function scrapeH2bid() {
  const bids = [];
  const seen = new Set();
  const searches = [
    'electrical instrumentation water texas',
    'scada water treatment texas',
    'wastewater engineering texas'
  ];

  for (const kw of searches) {
    try {
      const res = await axios.get(`https://h2bid.com/Bids/BidsSearchPreview?keyword=${encodeURIComponent(kw)}&state=TX`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml'
        },
        timeout: TIMEOUT
      });

      const $ = cheerio.load(res.data);
      $('table tbody tr').each((i, el) => {
        try {
          const cells = $(el).find('td');
          if (cells.length < 3) return;
          const name = $(cells[0]).text().trim() || $(cells[1]).text().trim();
          const agency = $(cells[1]).text().trim();
          const due = $(cells[cells.length - 1]).text().trim();
          const link = $(el).find('a').first().attr('href') || '';
          if (!name || name.length < 5) return;
          const key = name.slice(0, 40).toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);
          bids.push({
            id: 'h2bid-' + Buffer.from(name + agency).toString('base64').slice(0, 12),
            source: 'H2bid', name,
            agency: agency || 'Unknown',
            city: 'Texas', region: 'statewide',
            scope: 'Water/Wastewater E&I — See H2bid for scope',
            due: cleanDate(due) || 'See link',
            value: 'TBD',
            status: detectStatus(due),
            url: link.startsWith('http') ? link : `https://h2bid.com${link}`,
            scrapedAt: new Date().toISOString()
          });
        } catch(e) {}
      });
      await sleep(2000);
    } catch(err) {
      console.warn('[H2bid]', kw, 'failed:', err.message);
    }
  }

  console.log('[H2bid] Found', bids.length, 'bids');
  return { bids, source: 'H2bid' };
}

// ─── TX ESBD — NIGP CODE SEARCH ─────────────────────────────
async function scrapeTXESBD() {
  const bids = [];
  const seen = new Set();

  console.log('[TX ESBD] Searching', NIGP_CODES.length, 'NIGP codes...');

  for (const { code, label } of NIGP_CODES) {
    try {
      // TX ESBD NIGP code search URL
      const nigpNum = code.replace('-', '');
      const urls = [
        `https://www.txsmartbuy.gov/esbd?nigpCode=${code}&status=open`,
        `https://www.txsmartbuy.gov/esbd?nigp=${nigpNum}&status=open`,
        `https://comptroller.texas.gov/purchasing/vendor/cps/esbd/search.php?nigp=${nigpNum}&status=O`
      ];

      for (const url of urls) {
        try {
          const res = await axios.get(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/json',
              'X-Requested-With': 'XMLHttpRequest'
            },
            timeout: TIMEOUT
          });

          // Try JSON API response first
          if (typeof res.data === 'object') {
            const items = res.data.solicitations || res.data.bids ||
                          res.data.results || res.data.data ||
                          (Array.isArray(res.data) ? res.data : []);
            if (items.length > 0) {
              items.forEach(item => {
                const name = item.title || item.name || item.solicitationTitle || '';
                if (!name || name.length < 5) return;
                const key = name.slice(0, 50).toLowerCase();
                if (seen.has(key)) return;
                seen.add(key);
                bids.push({
                  id: 'esbd-' + Buffer.from(name + code).toString('base64').slice(0, 14),
                  source: 'TX ESBD',
                  name,
                  agency: item.agency || item.agencyName || 'Texas State Agency',
                  city: 'Texas',
                  region: 'statewide',
                  scope: `NIGP ${code} — ${label}`,
                  due: cleanDate(item.dueDate || item.closingDate || '') || 'See link',
                  value: item.estimatedValue || 'TBD',
                  status: detectStatus(item.dueDate || item.closingDate || ''),
                  url: item.url || item.link || `https://www.txsmartbuy.gov/esbd/${item.id || ''}`,
                  scrapedAt: new Date().toISOString()
                });
              });
              console.log(`[TX ESBD] NIGP ${code} (${label}): ${items.length} bids`);
              break;
            }
          }

          // HTML parse fallback
          const $ = cheerio.load(res.data);

          // Look for JSON embedded in script tags (SPA data)
          $('script:not([src])').each((i, el) => {
            const content = $(el).html() || '';
            if (!content.includes('solicitation') && !content.includes('title')) return;
            const matches = content.match(/\[\s*\{[^;]+\}\s*\]/g) || [];
            for (const m of matches) {
              try {
                const items = JSON.parse(m);
                if (!Array.isArray(items) || !items[0]?.title) continue;
                items.forEach(item => {
                  const name = item.title || item.name || '';
                  if (!name || name.length < 5) return;
                  const key = name.slice(0, 50).toLowerCase();
                  if (seen.has(key)) return;
                  seen.add(key);
                  bids.push({
                    id: 'esbd-' + Buffer.from(name + code).toString('base64').slice(0, 14),
                    source: 'TX ESBD', name,
                    agency: item.agency || 'Texas State Agency',
                    city: 'Texas', region: 'statewide',
                    scope: `NIGP ${code} — ${label}`,
                    due: cleanDate(item.dueDate || '') || 'See link',
                    value: 'TBD',
                    status: detectStatus(item.dueDate || ''),
                    url: `https://www.txsmartbuy.gov/esbd/${item.id || ''}`,
                    scrapedAt: new Date().toISOString()
                  });
                });
              } catch(e) {}
            }
          });

          // Table parse fallback
          let found = 0;
          $('table tbody tr, .solicitation-row, [class*="bid-row"]').each((i, el) => {
            try {
              const cells = $(el).find('td');
              if (cells.length < 2) return;
              const name = $(el).find('a').first().text().trim() || $(cells[0]).text().trim();
              const agency = $(cells[1]).text().trim();
              const due = $(cells[cells.length - 1]).text().trim();
              const link = $(el).find('a').first().attr('href') || '';
              if (!name || name.length < 5) return;
              if (/^(title|solicitation|agency|due|date|no\.)$/i.test(name.trim())) return;
              const key = name.slice(0, 50).toLowerCase();
              if (seen.has(key)) return;
              seen.add(key);
              found++;
              bids.push({
                id: 'esbd-' + Buffer.from(name + code).toString('base64').slice(0, 14),
                source: 'TX ESBD', name,
                agency: agency || 'Texas State Agency',
                city: 'Texas', region: 'statewide',
                scope: `NIGP ${code} — ${label}`,
                due: cleanDate(due) || 'See link',
                value: 'TBD',
                status: detectStatus(due),
                url: link.startsWith('http') ? link : link ? `https://www.txsmartbuy.gov${link}` : url,
                scrapedAt: new Date().toISOString()
              });
            } catch(e) {}
          });

          if (found > 0) {
            console.log(`[TX ESBD] NIGP ${code} (${label}): ${found} bids from HTML`);
            break;
          }
        } catch(e) {
          console.warn(`[TX ESBD] NIGP ${code} URL failed:`, e.message);
        }
      }

      await sleep(1000); // polite delay between codes
    } catch(err) {
      console.warn(`[TX ESBD] NIGP ${code} error:`, err.message);
    }
  }

  console.log('[TX ESBD] Total:', bids.length, 'bids from', NIGP_CODES.length, 'codes');
  return { bids, source: 'TX ESBD' };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function cleanDate(str) {
  if (!str) return '';
  const match = str.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\w+\s+\d{1,2},?\s+\d{4}/i);
  return match ? match[0] : str.replace(/due|close|date|:/gi, '').trim().slice(0, 30);
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

module.exports = { scrapeH2bid, scrapeTXESBD };
