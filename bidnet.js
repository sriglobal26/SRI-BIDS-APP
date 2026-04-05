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

async function scrapeBidNetTX() {
  const bids = [];
  const seen = new Set();

  const searches = [
    { url: 'https://www.bidnetdirect.com/texas?keywords=electrical+instrumentation+water', label: 'E&I Water' },
    { url: 'https://www.bidnetdirect.com/texas?keywords=scada+water', label: 'SCADA' },
    { url: 'https://www.bidnetdirect.com/texas?keywords=engineering+services+water', label: 'Engineering Services' },
    { url: 'https://www.bidnetdirect.com/texas?keywords=wastewater+engineering', label: 'WW Engineering' },
    { url: 'https://www.bidnetdirect.com/texas', label: 'All TX' },
  ];

  for (const { url, label } of searches) {
    try {
      const res = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.bidnetdirect.com',
        },
        timeout: TIMEOUT
      });

      const $ = cheerio.load(res.data);

      // BidNet uses a table or card layout
      const selectors = [
        'table tbody tr',
        '.bid-result',
        '.opportunity-row',
        '[class*="bid-item"]',
        '[class*="opportunity"]',
        '.result-row',
        'tr',
      ];

      let parsed = 0;

      for (const sel of selectors) {
        const rows = $(sel);
        if (rows.length < 2) continue;

        rows.each((i, el) => {
          try {
            const cells = $(el).find('td');
            const name = $(el).find('[class*="title"],[class*="name"],[class*="desc"],a').first().text().trim()
              || (cells.length > 0 ? $(cells[0]).text().trim() : '');
            const agency = $(el).find('[class*="agency"],[class*="entity"],[class*="org"]').first().text().trim()
              || (cells.length > 1 ? $(cells[1]).text().trim() : '');
            const due = $(el).find('[class*="due"],[class*="date"],[class*="close"]').first().text().trim()
              || (cells.length > 0 ? $(cells[cells.length - 1]).text().trim() : '');
            const link = $(el).find('a').first().attr('href') || '';

            if (!name || name.length < 5) return;
            if (/^(title|bid|description|agency|due|date|status|type)$/i.test(name.trim())) return;

            const key = name.slice(0, 50).toLowerCase();
            if (seen.has(key)) return;

            const text = (name + ' ' + agency).toLowerCase();
            if (!RELEVANT_KEYWORDS.some(k => text.includes(k))) return;

            seen.add(key);
            parsed++;

            bids.push({
              id: 'bidnet-' + Buffer.from(name + agency).toString('base64').slice(0, 14),
              source: 'BidNet TX',
              name, agency: agency || 'Texas Agency',
              city: 'Texas', region: detectRegion(agency + ' ' + name),
              scope: 'Texas Government Bid — See BidNet for full scope',
              due: cleanDate(due) || 'See link',
              value: 'TBD',
              status: detectStatus(due),
              url: link.startsWith('http') ? link
                : link ? 'https://www.bidnetdirect.com' + link
                : url,
              scrapedAt: new Date().toISOString()
            });
          } catch(e) {}
        });

        if (parsed > 0) break;
      }

      console.log(`[BidNet TX] "${label}": +${parsed} bids`);
      await sleep(2000);

    } catch(err) {
      console.warn(`[BidNet TX] "${label}" failed:`, err.message);
    }
  }

  console.log('[BidNet TX] Total:', bids.length, 'bids');
  return { bids, source: 'BidNet TX' };
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

module.exports = { scrapeBidNetTX };
