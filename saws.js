const axios = require('axios');
const cheerio = require('cheerio');

const TIMEOUT = 15000;

const RELEVANT_KEYWORDS = [
  'electrical','instrumentation','scada','controls','e&i',
  'water','wastewater','wtp','wwtp','lift station','pump station',
  'generator','plc','vfd','switchgear','telemetry','engineering',
  'design','professional','consultant','automation','power',
  'treatment','plant','pump','pipeline','infrastructure'
];

async function scrapeSAWS() {
  const bids = [];
  const seen = new Set();

  const urls = [
    'https://apps.saws.org/business_center/contractsol/',
    'https://apps.saws.org/Business_Center/contractsol/',
    'https://www.saws.org/business-center/procurement-bids/',
  ];

  for (const url of urls) {
    try {
      console.log('[SAWS] Fetching:', url);
      const res = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.saws.org',
        },
        timeout: TIMEOUT
      });

      const $ = cheerio.load(res.data);

      // SAWS uses a table listing — try multiple selectors
      const selectors = [
        'table tbody tr',
        'table tr',
        '.solicitation-row',
        '[class*="contract"] tr',
        '[class*="solicitation"] tr',
        'tr',
      ];

      let found = false;

      for (const sel of selectors) {
        const rows = $(sel);
        if (rows.length < 2) continue;

        let parsed = 0;
        rows.each((i, el) => {
          try {
            const cells = $(el).find('td');
            if (cells.length < 2) return;

            // Extract from cells — SAWS table: Sol# | Description | Type | Due Date | Status
            const solNum = $(cells[0]).text().trim();
            const name = $(cells[1]).text().trim() || $(el).find('a').first().text().trim();
            const type = $(cells[2]).text().trim();
            const due = $(cells[3]).text().trim() || $(cells[cells.length - 1]).text().trim();
            const status = $(cells[4]).text().trim() || '';
            const link = $(el).find('a').first().attr('href') || '';

            if (!name || name.length < 5) return;
            if (/^(solicitation|description|type|due|status|title|no\.|number)$/i.test(name.trim())) return;

            // Skip awarded/closed solicitations
            if (/awarded|closed|cancelled|canceled/i.test(status)) return;

            const key = (solNum + name).slice(0, 50).toLowerCase();
            if (seen.has(key)) return;

            // Relevance filter
            const text = (name + ' ' + type + ' ' + solNum).toLowerCase();
            if (!RELEVANT_KEYWORDS.some(k => text.includes(k))) return;

            seen.add(key);
            parsed++;

            bids.push({
              id: 'saws-' + (solNum || Buffer.from(name).toString('base64').slice(0, 10)),
              source: 'SAWS',
              name: name,
              agency: 'San Antonio Water System (SAWS)',
              city: 'San Antonio',
              region: 'sa',
              scope: `${type || 'Solicitation'} — ${name}. Sol #: ${solNum}`,
              due: cleanDate(due) || 'See link',
              value: 'TBD',
              status: detectStatus(due),
              url: link.startsWith('http') ? link
                : link ? 'https://apps.saws.org' + link
                : 'https://apps.saws.org/business_center/contractsol/',
              scrapedAt: new Date().toISOString()
            });
          } catch(e) {}
        });

        if (parsed > 0) {
          found = true;
          break;
        }
      }

      // If table parse found nothing, try link-based extraction
      if (!found) {
        $('a[href*="contractsol"], a[href*="Contractsol"], a[href*="solicitation"]').each((i, el) => {
          try {
            const name = $(el).text().trim();
            const link = $(el).attr('href') || '';
            if (!name || name.length < 5) return;
            const key = name.slice(0, 50).toLowerCase();
            if (seen.has(key)) return;
            const text = name.toLowerCase();
            if (!RELEVANT_KEYWORDS.some(k => text.includes(k))) return;
            seen.add(key);
            bids.push({
              id: 'saws-' + Buffer.from(name).toString('base64').slice(0, 12),
              source: 'SAWS', name,
              agency: 'San Antonio Water System (SAWS)',
              city: 'San Antonio', region: 'sa',
              scope: 'SAWS Solicitation — See link for full scope',
              due: 'See link', value: 'TBD', status: 'active',
              url: link.startsWith('http') ? link : 'https://apps.saws.org' + link,
              scrapedAt: new Date().toISOString()
            });
          } catch(e) {}
        });
      }

      if (bids.length > 0) break; // Got results, stop trying other URLs

    } catch(err) {
      console.warn('[SAWS] Failed:', url, '-', err.message);
    }

    await sleep(2000);
  }

  console.log('[SAWS] Found', bids.length, 'solicitations');
  return { bids, source: 'SAWS' };
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

module.exports = { scrapeSAWS };
