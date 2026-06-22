const axios = require('axios');
const cheerio = require('cheerio');

const TIMEOUT = 15000;
const KEYWORDS = ['electrical','instrumentation','scada','controls','water','wastewater','wtp','wwtp','lift station','pump station','generator','plc','e&i'];

// ─── H2BID ───────────────────────────────────────────────────
async function scrapeH2bid() {
  const bids = [];
  const seen = new Set();
  const searches = ['electrical instrumentation water', 'scada water texas', 'wastewater engineering'];

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
          const due = $(cells[cells.length-1]).text().trim();
          const link = $(el).find('a').first().attr('href') || '';
          if (!name || name.length < 5) return;
          const key = name.slice(0,40).toLowerCase();
          if (seen.has(key)) return;
          const text = (name+' '+agency).toLowerCase();
          if (!KEYWORDS.some(k=>text.includes(k))) return;
          seen.add(key);
          bids.push({
            id: 'h2bid-'+Buffer.from(name+agency).toString('base64').slice(0,12),
            source: 'H2bid', name,
            agency: agency||'Unknown', city: 'Texas', region: 'statewide',
            scope: 'Water/Wastewater E&I — See H2bid for scope',
            due: cleanDate(due)||'See link', value: 'TBD',
            status: detectStatus(due),
            url: link.startsWith('http')?link:`https://h2bid.com${link}`,
            scrapedAt: new Date().toISOString()
          });
        } catch(e){}
      });
      await sleep(2000);
    } catch(err) {
      console.warn('[H2bid]', kw, 'failed:', err.message);
    }
  }
  console.log('[H2bid] Found', bids.length, 'bids');
  return { bids, source: 'H2bid' };
}

// ─── TX ESBD ─────────────────────────────────────────────────
async function scrapeTXESBD() {
  const bids = [];
  const seen = new Set();

  // TX ESBD API endpoints — direct JSON API calls
  const apiEndpoints = [
    {
      url: 'https://www.txsmartbuy.gov/esbd/api/v1/solicitations?keywords=electrical+instrumentation+water&status=open&limit=50',
      label: 'API v1 E&I Water'
    },
    {
      url: 'https://www.txsmartbuy.gov/esbd/api/solicitations?q=electrical+water&state=TX&status=open',
      label: 'API solicitations'
    },
    {
      url: 'https://comptroller.texas.gov/purchasing/vendor/cps/esbd/search.php?kw=electrical+instrumentation+water&status=O',
      label: 'Comptroller search'
    }
  ];

  // Try API endpoints first
  for (const { url, label } of apiEndpoints) {
    try {
      const res = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json, text/html',
          'X-Requested-With': 'XMLHttpRequest'
        },
        timeout: TIMEOUT
      });

      // Handle JSON response
      if (typeof res.data === 'object') {
        const items = res.data.solicitations || res.data.bids || res.data.results || 
                      res.data.data || (Array.isArray(res.data) ? res.data : []);
        if (items.length > 0) {
          console.log(`[TX ESBD] ${label}: ${items.length} results from API`);
          for (const item of items) {
            const name = item.title || item.name || item.solicitationTitle || item.description || '';
            const agency = item.agency || item.agencyName || item.entity || 'Texas State Agency';
            if (!name || name.length < 5) continue;
            const key = name.slice(0,50).toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            bids.push({
              id: 'esbd-'+Buffer.from(name+agency).toString('base64').slice(0,14),
              source: 'TX ESBD', name,
              agency, city: 'Texas', region: 'statewide',
              scope: item.description || item.scope || 'TX ESBD Solicitation — E&I Engineering',
              due: cleanDate(item.dueDate || item.closingDate || item.responseDeadline) || 'See link',
              value: item.estimatedValue || item.value || 'TBD',
              status: detectStatus(item.dueDate || item.closingDate || ''),
              url: item.url || item.link || `https://www.txsmartbuy.gov/esbd/${item.id||''}`,
              scrapedAt: new Date().toISOString()
            });
          }
          if (bids.length > 0) break;
        }
      }
      await sleep(1500);
    } catch(err) {
      console.warn(`[TX ESBD] ${label} failed:`, err.message);
    }
  }

  // Fallback — try ESBD portal search page with different keywords
  if (bids.length === 0) {
    const fallbackUrls = [
      'https://www.txsmartbuy.gov/esbd?keywords=electrical+instrumentation',
      'https://www.txsmartbuy.gov/esbd?keywords=scada+water+treatment',
      'https://www.txsmartbuy.gov/esbd?keywords=wastewater+electrical'
    ];

    for (const url of fallbackUrls) {
      try {
        const res = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          },
          timeout: TIMEOUT
        });

        const $ = cheerio.load(res.data);

        // Look for JSON data embedded in the page
        const scripts = $('script:not([src])').toArray();
        for (const script of scripts) {
          const content = $(script).html() || '';
          if (content.includes('solicitation') || content.includes('bids')) {
            const match = content.match(/\[.*"title".*\]/s);
            if (match) {
              try {
                const items = JSON.parse(match[0]);
                items.forEach(item => {
                  const name = item.title || item.name || '';
                  if (!name || name.length < 5) return;
                  const key = name.slice(0,50).toLowerCase();
                  if (seen.has(key)) return;
                  seen.add(key);
                  bids.push({
                    id: 'esbd-'+Buffer.from(name).toString('base64').slice(0,14),
                    source: 'TX ESBD', name,
                    agency: item.agency || 'Texas State Agency',
                    city: 'Texas', region: 'statewide',
                    scope: 'TX ESBD Solicitation — E&I Engineering',
                    due: cleanDate(item.dueDate || '') || 'See link',
                    value: 'TBD',
                    status: detectStatus(item.dueDate || ''),
                    url: `https://www.txsmartbuy.gov/esbd/${item.id||''}`,
                    scrapedAt: new Date().toISOString()
                  });
                });
              } catch(e) {}
            }
          }
        }

        // Try table parsing as last resort
        $('table tbody tr, .solicitation-row').each((i, el) => {
          try {
            const cells = $(el).find('td');
            if (cells.length < 2) return;
            const name = $(el).find('a').first().text().trim() || $(cells[0]).text().trim();
            const agency = $(cells[1]).text().trim();
            const due = $(cells[cells.length-1]).text().trim();
            const link = $(el).find('a').first().attr('href') || '';
            if (!name || name.length < 5) return;
            const key = name.slice(0,50).toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            bids.push({
              id: 'esbd-'+Buffer.from(name+agency).toString('base64').slice(0,14),
              source: 'TX ESBD', name,
              agency: agency||'Texas State Agency',
              city: 'Texas', region: 'statewide',
              scope: 'TX ESBD Solicitation — E&I Engineering',
              due: cleanDate(due)||'See link', value: 'TBD',
              status: detectStatus(due),
              url: link.startsWith('http')?link:`https://www.txsmartbuy.gov${link}`,
              scrapedAt: new Date().toISOString()
            });
          } catch(e) {}
        });

        if (bids.length > 0) break;
        await sleep(2000);
      } catch(err) {
        console.warn('[TX ESBD] Fallback failed:', err.message);
      }
    }
  }

  console.log('[TX ESBD] Total:', bids.length, 'bids');
  return { bids, source: 'TX ESBD' };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function cleanDate(str) {
  if (!str) return '';
  const match = str.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\w+\s+\d{1,2},?\s+\d{4}/i);
  return match ? match[0] : str.replace(/due|close|date|:/gi,'').trim().slice(0,30);
}

function detectStatus(due='') {
  try {
    const d = new Date(due);
    const diff = (d-Date.now())/86400000;
    if (isNaN(diff)) return 'active';
    if (diff<=7) return 'closing';
    return diff<=30?'active':'prebid';
  } catch { return 'active'; }
}

function detectRegion(city='') {
  const c = city.toLowerCase();
  if (['houston','pearland','baytown','pasadena','katy','sugar land','league city','conroe','galveston'].some(h=>c.includes(h))) return 'houston';
  if (['dallas','plano','fort worth','arlington'].some(h=>c.includes(h))) return 'dfw';
  if (c.includes('austin')) return 'austin';
  if (c.includes('san antonio')) return 'sa';
  return 'statewide';
}

module.exports = { scrapeH2bid, scrapeTXESBD };
