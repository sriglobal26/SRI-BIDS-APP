const axios = require('axios');
const cheerio = require('cheerio');

const TIMEOUT = 15000;
const KEYWORDS = ['electrical','instrumentation','scada','controls','water','wastewater','wtp','wwtp','lift station','pump station','generator','plc','e&i'];

// ─── H2BID ───────────────────────────────────────────────────
async function scrapeH2bid() {
  const bids = [];
  const seen = new Set();

  // H2bid search API endpoints — try JSON first, fallback to HTML
  const searches = [
    { kw: 'electrical instrumentation water', label: 'E&I Water' },
    { kw: 'SCADA water Texas',                label: 'SCADA TX' },
    { kw: 'wastewater electrical',            label: 'WW Electrical' },
    { kw: 'pump station instrumentation',     label: 'Pump Station' },
  ];

  for (const { kw, label } of searches) {
    try {
      // Try JSON API endpoint first
      const apiUrl = `https://h2bid.com/api/bids/search?keyword=${encodeURIComponent(kw)}&state=TX&format=json`;
      let handled = false;

      try {
        const apiRes = await axios.get(apiUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
          timeout: TIMEOUT
        });
        if (apiRes.data && Array.isArray(apiRes.data.bids || apiRes.data)) {
          const items = apiRes.data.bids || apiRes.data;
          for (const item of items) {
            const name = item.title || item.name || item.bidName || '';
            const agency = item.agency || item.owner || item.organization || '';
            if (!name || name.length < 5) continue;
            const key = name.slice(0, 40).toLowerCase();
            if (seen.has(key)) continue;
            const text = (name + ' ' + agency).toLowerCase();
            if (!KEYWORDS.some(k => text.includes(k))) continue;
            seen.add(key);
            bids.push({
              id: 'h2bid-' + (item.id || Buffer.from(name + agency).toString('base64').slice(0, 12)),
              source: 'H2bid', name,
              agency: agency || 'Unknown', city: item.city || item.location || 'Texas',
              region: detectRegion(item.city || item.location || ''),
              scope: item.description || item.scope || 'Water/Wastewater E&I — See H2bid for scope',
              due: cleanDate(item.dueDate || item.closingDate || item.due) || 'See link',
              value: item.estimatedValue || item.value || 'TBD',
              status: detectStatus(item.dueDate || item.closingDate || ''),
              url: item.url || item.link || `https://h2bid.com/bids/${item.id || ''}`,
              scrapedAt: new Date().toISOString()
            });
          }
          handled = true;
        }
      } catch(apiErr) { /* fallback to HTML below */ }

      // HTML fallback
      if (!handled) {
        const htmlUrls = [
          `https://h2bid.com/Bids/BidsSearchPreview?keyword=${encodeURIComponent(kw)}&state=TX`,
          `https://h2bid.com/bids?q=${encodeURIComponent(kw)}&state=TX`,
        ];

        for (const url of htmlUrls) {
          try {
            const res = await axios.get(url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Referer': 'https://h2bid.com',
              },
              timeout: TIMEOUT
            });

            // Check if response is JSON
            const contentType = res.headers['content-type'] || '';
            if (contentType.includes('json')) {
              const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
              const items = Array.isArray(data) ? data : (data.bids || data.results || []);
              for (const item of items) {
                const name = item.title || item.name || item.BidTitle || item.ProjectName || '';
                const agency = item.agency || item.Agency || item.Owner || '';
                if (!name || name.length < 5) continue;
                const key = name.slice(0, 40).toLowerCase();
                if (seen.has(key)) continue;
                const text = (name + ' ' + agency).toLowerCase();
                if (!KEYWORDS.some(k => text.includes(k))) continue;
                seen.add(key);
                bids.push({
                  id: 'h2bid-' + Buffer.from(name + agency).toString('base64').slice(0, 12),
                  source: 'H2bid', name,
                  agency: agency || 'Unknown', city: item.City || item.city || 'Texas',
                  region: detectRegion(item.City || item.city || ''),
                  scope: 'Water/Wastewater E&I — See H2bid for scope',
                  due: cleanDate(item.DueDate || item.dueDate || item.ClosingDate) || 'See link',
                  value: item.EstimatedValue || item.estimatedValue || 'TBD',
                  status: detectStatus(item.DueDate || item.dueDate || ''),
                  url: `https://h2bid.com/bids/${item.BidID || item.id || ''}`,
                  scrapedAt: new Date().toISOString()
                });
              }
              break;
            }

            // HTML parse
            const $ = cheerio.load(res.data);
            const selectors = ['table tbody tr', '.bid-row', '[class*="bid-item"]', '.result-item'];
            for (const sel of selectors) {
              const rows = $(sel);
              if (rows.length < 2) continue;
              rows.each((i, el) => {
                try {
                  const cells = $(el).find('td');
                  if (cells.length < 2) return;
                  const name = $(cells[0]).text().trim() || $(cells[1]).text().trim();
                  const agency = $(cells[1]).text().trim() || $(cells[2]).text().trim();
                  const due = $(cells[cells.length - 1]).text().trim();
                  const link = $(el).find('a').first().attr('href') || '';
                  if (!name || name.length < 5 || /^(title|bid|name)$/i.test(name)) return;
                  const key = name.slice(0, 40).toLowerCase();
                  if (seen.has(key)) return;
                  const text = (name + ' ' + agency).toLowerCase();
                  if (!KEYWORDS.some(k => text.includes(k))) return;
                  seen.add(key);
                  bids.push({
                    id: 'h2bid-' + Buffer.from(name + agency).toString('base64').slice(0, 12),
                    source: 'H2bid', name,
                    agency: agency || 'Unknown', city: 'Texas', region: 'statewide',
                    scope: 'Water/Wastewater E&I — See H2bid for scope',
                    due: cleanDate(due) || 'See link', value: 'TBD',
                    status: detectStatus(due),
                    url: link.startsWith('http') ? link : 'https://h2bid.com' + link,
                    scrapedAt: new Date().toISOString()
                  });
                } catch(e) {}
              });
              break;
            }
            break;
          } catch(e) {}
        }
      }

      await sleep(2000);
    } catch(err) {
      console.warn(`[H2bid] "${label}" failed:`, err.message);
    }
  }

  console.log('[H2bid] Found', bids.length, 'bids');
  return { bids, source: 'H2bid' };
}

// ─── TX ESBD ─────────────────────────────────────────────────
async function scrapeTXESBD() {
  const bids = [];
  const seen = new Set();

  // TX ESBD is a JS-rendered SPA — but they have API endpoints we can try
  const searches = [
    // NIGP codes: 913=Electrical, 920=Instrumentation, 956=SCADA/Controls
    { url: 'https://www.txsmartbuy.gov/esbd?nigpCode=913&keywords=water', label: 'Electrical/Water' },
    { url: 'https://www.txsmartbuy.gov/esbd?nigpCode=920&keywords=water', label: 'Instrumentation/Water' },
    { url: 'https://www.txsmartbuy.gov/esbd?nigpCode=956&keywords=water', label: 'SCADA/Water' },
  ];

  // Try the ESBD API (undocumented but often works)
  const apiSearches = [
    { endpoint: 'https://www.txsmartbuy.gov/esbd/api/solicitations?nigp=913&keyword=water+electrical', label: 'API-913' },
    { endpoint: 'https://www.txsmartbuy.gov/esbd/api/solicitations?nigp=920&keyword=instrumentation', label: 'API-920' },
    { endpoint: 'https://www.txsmartbuy.gov/esbd/api/solicitations?nigp=956&keyword=scada', label: 'API-956' },
    // Alternative API format
    { endpoint: 'https://www.txsmartbuy.gov/esbd-api/solicitations?category=913&q=water', label: 'AltAPI-913' },
  ];

  for (const { endpoint, label } of apiSearches) {
    try {
      const res = await axios.get(endpoint, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        timeout: TIMEOUT
      });
      if (res.data && (Array.isArray(res.data) || res.data.solicitations || res.data.bids)) {
        const items = Array.isArray(res.data) ? res.data : (res.data.solicitations || res.data.bids || []);
        for (const item of items) {
          const name = item.title || item.solicitationTitle || item.description || item.name || '';
          const agency = item.agency || item.entityName || item.purchasingEntity || item.organization || '';
          if (!name || name.length < 5) continue;
          const key = name.slice(0, 40).toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          bids.push({
            id: 'esbd-' + (item.id || item.solicitationId || Buffer.from(name + agency).toString('base64').slice(0, 12)),
            source: 'TX ESBD', name,
            agency: agency || 'Texas State Agency', city: 'Texas', region: 'statewide',
            scope: `NIGP Code — Electrical/Instrumentation/SCADA Engineering`,
            due: cleanDate(item.dueDate || item.closingDate || item.responseDate) || 'See link',
            value: item.estimatedValue || item.amount || 'TBD',
            status: detectStatus(item.dueDate || item.closingDate || ''),
            url: item.url || item.link || `https://www.txsmartbuy.gov/esbd?id=${item.id || ''}`,
            scrapedAt: new Date().toISOString()
          });
        }
        console.log(`[TX ESBD] ${label}: found ${items.length} results`);
      }
      await sleep(1500);
    } catch(e) {
      console.warn(`[TX ESBD] ${label} API failed:`, e.message);
    }
  }

  // HTML fallback if API gave nothing
  if (bids.length === 0) {
    for (const { url, label } of searches) {
      try {
        const res = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml',
          },
          timeout: TIMEOUT
        });

        // Check if JSON response
        if (res.headers['content-type']?.includes('json')) {
          const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
          const items = Array.isArray(data) ? data : (data.solicitations || data.results || []);
          for (const item of items) {
            const name = item.title || item.solicitationTitle || item.name || '';
            const agency = item.agency || item.entityName || '';
            if (!name || name.length < 5) continue;
            const key = name.slice(0, 40).toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            bids.push({
              id: 'esbd-' + Buffer.from(name + agency).toString('base64').slice(0, 12),
              source: 'TX ESBD', name, agency: agency || 'Texas Agency',
              city: 'Texas', region: 'statewide',
              scope: 'NIGP Electrical/Instrumentation/SCADA Engineering',
              due: cleanDate(item.dueDate || item.closingDate) || 'See link',
              value: item.estimatedValue || 'TBD',
              status: detectStatus(item.dueDate || item.closingDate || ''),
              url: item.url || url,
              scrapedAt: new Date().toISOString()
            });
          }
        } else {
          // HTML parse attempt (SPA content may not be present)
          const $ = cheerio.load(res.data);
          $('table tbody tr, .solicitation-row, [class*="solicitation-item"]').each((i, el) => {
            try {
              const name = $(el).find('td:first-child, [class*="title"]').first().text().trim();
              const agency = $(el).find('td:nth-child(2), [class*="agency"]').first().text().trim();
              const due = $(el).find('[class*="due"], [class*="date"], td:last-child').first().text().trim();
              const link = $(el).find('a').first().attr('href') || '';
              if (!name || name.length < 5 || /title|header|solicitation/i.test(name.toLowerCase())) return;
              const key = name.slice(0, 40).toLowerCase();
              if (seen.has(key)) return;
              seen.add(key);
              bids.push({
                id: 'esbd-' + Buffer.from(name + agency).toString('base64').slice(0, 12),
                source: 'TX ESBD', name, agency: agency || 'Texas Agency',
                city: 'Texas', region: 'statewide',
                scope: 'NIGP Electrical/Instrumentation/SCADA Engineering',
                due: cleanDate(due) || 'See link', value: 'TBD',
                status: detectStatus(due),
                url: link.startsWith('http') ? link : 'https://www.txsmartbuy.gov' + link,
                scrapedAt: new Date().toISOString()
              });
            } catch(e) {}
          });
        }
        await sleep(2000);
      } catch(err) {
        console.warn(`[TX ESBD] ${label} HTML failed:`, err.message);
      }
    }
  }

  console.log('[TX ESBD] Found', bids.length, 'bids');
  return { bids, source: 'TX ESBD' };
}

// ─── HELPERS ──────────────────────────────────────────────────
function cleanDate(str) {
  if (!str) return '';
  const match = str.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\w+\s+\d{1,2},?\s+\d{4}/i);
  return match ? match[0] : str.replace(/due|close|date|:/gi, '').trim().slice(0, 30);
}

function detectRegion(city = '') {
  const c = city.toLowerCase();
  if (['houston','pearland','baytown','pasadena','katy','sugar land','league city','conroe','galveston'].some(h => c.includes(h))) return 'houston';
  if (['dallas','plano','fort worth','arlington','denton'].some(h => c.includes(h))) return 'dfw';
  if (c.includes('austin')) return 'austin';
  if (c.includes('san antonio')) return 'sa';
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

module.exports = { scrapeH2bid, scrapeTXESBD };
