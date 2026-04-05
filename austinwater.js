const axios = require('axios');
const cheerio = require('cheerio');

const TIMEOUT = 15000;

// Austin Water portal — pull only Solicitations containing "CLMP"
// URL: https://financeonline.austintexas.gov/afo/account_services/solicitation/solicitations.cfm

async function scrapeAustinWater() {
  const bids = [];
  const seen = new Set();

  const urls = [
    'https://financeonline.austintexas.gov/afo/account_services/solicitation/solicitations.cfm',
    'https://financeonline.austintexas.gov/afo/account_services/solicitation/solicitations.cfm?dept=AWU',
    'https://financeonline.austintexas.gov/afo/account_services/solicitation/solicitations.cfm?type=CLMP',
  ];

  for (const url of urls) {
    try {
      const res = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: TIMEOUT
      });

      const $ = cheerio.load(res.data);

      // Austin Water uses a table for solicitations
      const selectors = [
        'table tbody tr',
        '.solicitation-row',
        '[class*="solicitation"] tr',
        'tr',
      ];

      for (const sel of selectors) {
        const rows = $(sel);
        if (rows.length < 2) continue;

        rows.each((i, el) => {
          try {
            const cells = $(el).find('td');
            if (cells.length < 2) return;

            const rowText = $(el).text();

            // ONLY pull rows that contain "CLMP" — SRI Global's requirement
            if (!rowText.toUpperCase().includes('CLMP')) return;

            const name = $(el).find('[class*="title"],[class*="desc"],[class*="name"],a').first().text().trim()
              || $(cells[0]).text().trim()
              || $(cells[1]).text().trim();
            const solNum = $(cells).filter((i,c) => /CLMP/i.test($(c).text())).first().text().trim()
              || $(cells[0]).text().trim();
            const due = $(el).find('[class*="due"],[class*="date"],[class*="close"]').first().text().trim()
              || $(cells[cells.length - 1]).text().trim();
            const link = $(el).find('a').first().attr('href') || '';

            if (!name || name.length < 3) return;

            const key = (solNum + name).slice(0, 50).toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);

            bids.push({
              id: 'austinwater-' + Buffer.from(solNum + name).toString('base64').slice(0, 14),
              source: 'Austin Water',
              name: name.includes('CLMP') ? name : `[CLMP] ${name}`,
              agency: 'City of Austin – Austin Water',
              city: 'Austin',
              region: 'austin',
              scope: `CLMP Solicitation — E&I Engineering Services. Solicitation #: ${solNum}`,
              due: cleanDate(due) || 'See link',
              value: 'TBD',
              status: detectStatus(due),
              url: link.startsWith('http') ? link
                : link ? 'https://financeonline.austintexas.gov' + link
                : 'https://financeonline.austintexas.gov/afo/account_services/solicitation/solicitations.cfm',
              scrapedAt: new Date().toISOString()
            });
          } catch(e) {}
        });

        if (bids.length > 0) break;
      }

      if (bids.length > 0) break; // Found bids, stop trying other URLs

      await sleep(2000);
    } catch(err) {
      console.warn('[Austin Water] Failed:', url, err.message);
    }
  }

  console.log('[Austin Water] Found', bids.length, 'CLMP solicitations');
  return { bids, source: 'Austin Water' };
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

module.exports = { scrapeAustinWater };
