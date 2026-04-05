const axios = require('axios');
const cheerio = require('cheerio');

const TIMEOUT = 15000;

const RELEVANT_KEYWORDS = [
  'electrical','instrumentation','scada','controls','e&i',
  'water','wastewater','wtp','wwtp','lift station','pump station',
  'generator','plc','vfd','switchgear','telemetry','engineering',
  'design','professional','consultant','automation','power',
  'treatment','plant','pump','pipeline','infrastructure','civil'
];

async function scrapeDemandStar() {
  const bids = [];
  const seen = new Set();

  // DemandStar has a public API for solicitations
  const apiUrls = [
    'https://network.demandstar.com/api/v1/solicitations?state=TX&keyword=electrical+water&limit=50',
    'https://network.demandstar.com/api/v1/solicitations?state=TX&keyword=scada+engineering&limit=50',
    'https://network.demandstar.com/api/v1/solicitations?state=TX&keyword=wastewater+engineering&limit=50',
    'https://network.demandstar.com/api/v1/solicitations?state=TX&keyword=engineering+services&limit=50',
  ];

  // Try API first
  for (const url of apiUrls) {
    try {
      const res = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
        timeout: TIMEOUT
      });

      if (res.data && (Array.isArray(res.data) || res.data.solicitations || res.data.results || res.data.data)) {
        const items = Array.isArray(res.data) ? res.data
          : (res.data.solicitations || res.data.results || res.data.data || []);

        for (const item of items) {
          const name = item.title || item.name || item.description || item.solicitationTitle || '';
          const agency = item.agency || item.organization || item.entityName || item.buyer || '';
          const due = item.dueDate || item.closingDate || item.responseDate || item.openDate || '';
          const id = item.id || item.solicitationId || item.solicitation_id || '';

          if (!name || name.length < 5) continue;
          const key = name.slice(0, 50).toLowerCase();
          if (seen.has(key)) continue;

          const text = (name + ' ' + agency).toLowerCase();
          if (!RELEVANT_KEYWORDS.some(k => text.includes(k))) continue;

          seen.add(key);
          bids.push({
            id: 'demandstar-' + (id || Buffer.from(name + agency).toString('base64').slice(0, 12)),
            source: 'DemandStar',
            name, agency: agency || 'Texas Agency',
            city: item.city || item.location || 'Texas',
            region: detectRegion((item.city || item.location || '') + ' ' + agency),
            scope: item.description || item.scope || 'Texas Municipal Solicitation — See DemandStar for full scope',
            due: cleanDate(due) || 'See link',
            value: item.estimatedValue || item.budget || 'TBD',
            status: detectStatus(due),
            url: item.url || item.link || `https://network.demandstar.com/solicitation/${id}`,
            scrapedAt: new Date().toISOString()
          });
        }
      }
      await sleep(2000);
    } catch(err) {
      console.warn('[DemandStar] API failed:', err.message);
    }
  }

  // HTML fallback if API gave nothing
  if (bids.length === 0) {
    const htmlUrls = [
      'https://network.demandstar.com/solicitations?state=TX&keywords=electrical+water',
      'https://network.demandstar.com/solicitations?state=TX&keywords=scada+engineering',
      'https://network.demandstar.com/solicitations?state=TX&keywords=wastewater+engineering',
    ];

    for (const url of htmlUrls) {
      try {
        const res = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Referer': 'https://network.demandstar.com',
          },
          timeout: TIMEOUT
        });

        const $ = cheerio.load(res.data);

        const selectors = [
          'table tbody tr',
          '.solicitation-card',
          '.solicitation-row',
          '[class*="solicitation"]',
          '[class*="opportunity"]',
          'tr',
        ];

        for (const sel of selectors) {
          const rows = $(sel);
          if (rows.length < 2) continue;

          let parsed = 0;
          rows.each((i, el) => {
            try {
              const name = $(el).find('[class*="title"],[class*="name"],a').first().text().trim()
                || $(el).find('td').first().text().trim();
              const agency = $(el).find('[class*="agency"],[class*="org"],[class*="entity"]').first().text().trim()
                || $(el).find('td:nth-child(2)').text().trim();
              const due = $(el).find('[class*="due"],[class*="date"],[class*="close"]').first().text().trim()
                || $(el).find('td:last-child').text().trim();
              const link = $(el).find('a').first().attr('href') || '';

              if (!name || name.length < 5) return;
              if (/^(title|solicitation|agency|due|date|status)$/i.test(name.trim())) return;

              const key = name.slice(0, 50).toLowerCase();
              if (seen.has(key)) return;

              const text = (name + ' ' + agency).toLowerCase();
              if (!RELEVANT_KEYWORDS.some(k => text.includes(k))) return;

              seen.add(key);
              parsed++;

              bids.push({
                id: 'demandstar-' + Buffer.from(name + agency).toString('base64').slice(0, 14),
                source: 'DemandStar',
                name, agency: agency || 'Texas Agency',
                city: 'Texas', region: detectRegion(agency + ' ' + name),
                scope: 'Texas Municipal Solicitation — See DemandStar for full scope',
                due: cleanDate(due) || 'See link', value: 'TBD',
                status: detectStatus(due),
                url: link.startsWith('http') ? link
                  : link ? 'https://network.demandstar.com' + link
                  : 'https://network.demandstar.com/solicitations?state=TX',
                scrapedAt: new Date().toISOString()
              });
            } catch(e) {}
          });

          if (parsed > 0) break;
        }

        await sleep(2000);
      } catch(err) {
        console.warn('[DemandStar] HTML failed:', err.message);
      }
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

module.exports = { scrapeDemandStar };
