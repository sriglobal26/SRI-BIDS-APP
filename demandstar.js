const axios = require('axios');
const cheerio = require('cheerio');

const TIMEOUT = 15000;

const RELEVANT_KEYWORDS = [
  'electrical','instrumentation','scada','controls','e&i',
  'water','wastewater','wtp','wwtp','lift station','pump station',
  'generator','plc','vfd','switchgear','engineering','design',
  'consultant','treatment','plant','pump','pipeline','civil'
];

async function scrapeDemandStar() {
  const bids = [];
  const seen = new Set();

  // DemandStar correct public search URLs
  const searches = [
    'https://www.demandstar.com/app/bids/search?state=TX&keywords=electrical+water',
    'https://www.demandstar.com/app/bids/search?state=TX&keywords=scada+engineering',
    'https://www.demandstar.com/app/bids/search?state=TX&keywords=wastewater+engineering',
    'https://www.demandstar.com/bids?state=TX&q=electrical+water',
    'https://www.demandstar.com/bids?state=TX&q=scada+engineering',
  ];

  for (const url of searches) {
    try {
      const res = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/json',
          'Referer': 'https://www.demandstar.com',
        },
        timeout: TIMEOUT
      });

      // Check if JSON response
      const ct = res.headers['content-type'] || '';
      if (ct.includes('json')) {
        const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        const items = Array.isArray(data) ? data : (data.bids || data.results || data.solicitations || data.data || []);
        for (const item of items) {
          const name = item.title || item.name || item.description || '';
          const agency = item.agency || item.organization || item.buyer || '';
          if (!name || name.length < 5) continue;
          const key = name.slice(0, 50).toLowerCase();
          if (seen.has(key)) continue;
          const text = (name + ' ' + agency).toLowerCase();
          if (!RELEVANT_KEYWORDS.some(k => text.includes(k))) continue;
          seen.add(key);
          bids.push({
            id: 'demandstar-' + Buffer.from(name + agency).toString('base64').slice(0, 14),
            source: 'DemandStar', name,
            agency: agency || 'Texas Agency', city: 'Texas',
            region: detectRegion(agency + ' ' + name),
            scope: item.description || 'Texas Municipal Solicitation — See DemandStar',
            due: cleanDate(item.dueDate || item.closingDate || '') || 'See link',
            value: item.estimatedValue || 'TBD',
            status: detectStatus(item.dueDate || item.closingDate || ''),
            url: item.url || item.link || url,
            scrapedAt: new Date().toISOString()
          });
        }
      } else {
        // HTML parse
        const $ = cheerio.load(res.data);
        const selectors = ['table tbody tr', '.bid-result', '.opportunity-row', '[class*="bid"]', 'tr'];
        for (const sel of selectors) {
          const rows = $(sel);
          if (rows.length < 2) continue;
          let parsed = 0;
          rows.each((i, el) => {
            try {
              const name = $(el).find('[class*="title"],[class*="name"],a').first().text().trim()
                || $(el).find('td').first().text().trim();
              const agency = $(el).find('[class*="agency"],[class*="org"]').first().text().trim()
                || $(el).find('td:nth-child(2)').text().trim();
              const due = $(el).find('[class*="due"],[class*="date"]').first().text().trim();
              const link = $(el).find('a').first().attr('href') || '';
              if (!name || name.length < 5) return;
              if (/^(title|bid|agency|due|date|status)$/i.test(name.trim())) return;
              const key = name.slice(0, 50).toLowerCase();
              if (seen.has(key)) return;
              const text = (name + ' ' + agency).toLowerCase();
              if (!RELEVANT_KEYWORDS.some(k => text.includes(k))) return;
              seen.add(key);
              parsed++;
              bids.push({
                id: 'demandstar-' + Buffer.from(name + agency).toString('base64').slice(0, 14),
                source: 'DemandStar', name,
                agency: agency || 'Texas Agency', city: 'Texas',
                region: detectRegion(agency + ' ' + name),
                scope: 'Texas Municipal Solicitation — See DemandStar for full scope',
                due: cleanDate(due) || 'See link', value: 'TBD',
                status: detectStatus(due),
                url: link.startsWith('http') ? link : link ? 'https://www.demandstar.com' + link : url,
                scrapedAt: new Date().toISOString()
              });
            } catch(e) {}
          });
          if (parsed > 0) break;
        }
      }

      await sleep(2000);
    } catch(err) {
      console.warn('[DemandStar] Failed:', err.message);
    }
  }

  console.log('[DemandStar] Total:', bids.length, 'bids');
  return { bids, source: 'DemandStar' };
}

function cleanDate(str) {
  if (!str) return '';
  const match = str.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\w+\s+\d{1,2},?\s+\d{4}/i);
  return match ? match[0] : str.replace(/due|close|date|:/gi, '').trim().slice(0, 30);
}

function detectRegion(text = '') {
  const t = text.toLowerCase();
  if (['houston','pearland','baytown','pasadena','katy','sugar land','league city','conroe'].some(h => t.includes(h))) return 'houston';
  if (['dallas','plano','fort worth','arlington','denton'].some(h => t.includes(h))) return 'dfw';
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

module.exports = { scrapeDemandStar };
