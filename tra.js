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

async function scrapeTRA() {
  const bids = [];
  const seen = new Set();

  const urls = [
    'https://tra.procureware.com/Bids',
    'https://tra.procureware.com/Bids?status=open',
    'https://tra.procureware.com/Bids/Index',
  ];

  for (const url of urls) {
    try {
      console.log('[TRA] Fetching:', url);
      const res = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://tra.procureware.com',
        },
        timeout: TIMEOUT
      });

      const $ = cheerio.load(res.data);

      // Procureware uses a standard table layout
      const selectors = [
        'table tbody tr',
        '.bid-row',
        '[class*="bid-list"] tr',
        '[class*="solicitation"] tr',
        'tr',
      ];

      let parsed = 0;

      for (const sel of selectors) {
        const rows = $(sel);
        if (rows.length < 2) continue;

        rows.each((i, el) => {
          try {
            const cells = $(el).find('td');
            if (cells.length < 2) return;

            const name = $(el).find('[class*="title"],[class*="desc"],[class*="name"],a').first().text().trim()
              || $(cells[0]).text().trim()
              || $(cells[1]).text().trim();
            const bidNum = $(cells[0]).text().trim();
            const due = $(el).find('[class*="due"],[class*="date"],[class*="close"]').first().text().trim()
              || $(cells[cells.length - 1]).text().trim();
            const status = $(el).find('[class*="status"]').first().text().trim() || '';
            const link = $(el).find('a').first().attr('href') || '';

            if (!name || name.length < 5) return;
            if (/^(bid|title|description|number|due|date|status|type)$/i.test(name.trim())) return;

            // Skip closed/awarded
            if (/closed|awarded|cancelled/i.test(status)) return;

            const key = name.slice(0, 50).toLowerCase();
            if (seen.has(key)) return;

            // TRA bids are all water/infrastructure — light filter
            const text = (name + ' ' + bidNum).toLowerCase();
            const isRelevant = RELEVANT_KEYWORDS.some(k => text.includes(k))
              || name.length > 5; // TRA is already a water utility — most bids are relevant

            if (!isRelevant) return;

            seen.add(key);
            parsed++;

            bids.push({
              id: 'tra-' + (bidNum || Buffer.from(name).toString('base64').slice(0, 12)),
              source: 'TRA Procureware',
              name,
              agency: 'Trinity River Authority (TRA)',
              city: 'DFW Region',
              region: 'dfw',
              scope: `TRA Solicitation — ${name}. Bid #: ${bidNum}`,
              due: cleanDate(due) || 'See link',
              value: 'TBD',
              status: detectStatus(due),
              url: link.startsWith('http') ? link
                : link ? 'https://tra.procureware.com' + link
                : 'https://tra.procureware.com/Bids',
              scrapedAt: new Date().toISOString()
            });
          } catch(e) {}
        });

        if (parsed > 0) break;
      }

      console.log('[TRA] Found', parsed, 'bids from', url);
      if (bids.length > 0) break;

    } catch(err) {
      console.warn('[TRA] Failed:', url, '-', err.message);
    }

    await sleep(2000);
  }

  console.log('[TRA] Total:', bids.length, 'bids');
  return { bids, source: 'TRA Procureware' };
}

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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { scrapeTRA };
