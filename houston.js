const axios = require('axios');
const cheerio = require('cheerio');

const TIMEOUT = 15000;

const RELEVANT_KEYWORDS = [
  'electrical','instrumentation','scada','controls','e&i',
  'water','wastewater','wtp','wwtp','lift station','pump station',
  'generator','plc','vfd','switchgear','engineering','design',
  'consultant','treatment','plant','pump','pipeline','civil',
  'professional services','infrastructure'
];

// ─── HOUSTON PUBLIC WORKS ─────────────────────────────────────
async function scrapeHoustonPW() {
  const bids = [];
  const seen = new Set();

  const urls = [
    'https://purchasing.houstontx.gov/bids.html',
    'https://purchasing.houstontx.gov/bid_download.aspx',
    'https://www.beaconbid.com/solicitations/city-of-houston/open',
    'https://www.houstontx.gov/obo/current_contracting_opportunities.html',
  ];

  for (const url of urls) {
    try {
      console.log('[Houston PW] Fetching:', url);
      const res = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: TIMEOUT
      });

      const $ = cheerio.load(res.data);
      let parsed = 0;

      // Houston uses standard HTML tables
      const selectors = [
        'table tbody tr',
        '#GridView1 tr',
        '.bid-table tr',
        '[id*="Grid"] tr',
        'table tr',
      ];

      for (const sel of selectors) {
        const rows = $(sel);
        if (rows.length < 2) continue;

        rows.each((i, el) => {
          try {
            const cells = $(el).find('td');
            if (cells.length < 2) return;

            const name = $(el).find('a, [class*="title"]').first().text().trim()
              || $(cells[1]).text().trim()
              || $(cells[0]).text().trim();
            const bidNum = $(cells[0]).text().trim();
            const dept = $(cells).filter((i, c) => /public works|water|PWE/i.test($(c).text())).first().text().trim()
              || $(cells[2]).text().trim();
            const due = $(cells[cells.length - 1]).text().trim()
              || $(cells[cells.length - 2]).text().trim();
            const link = $(el).find('a').first().attr('href') || '';

            if (!name || name.length < 5) return;
            if (/^(bid|title|description|number|department|due|date|status|type)$/i.test(name.trim())) return;

            // Filter for Public Works / water related
            const text = (name + ' ' + dept + ' ' + bidNum).toLowerCase();
            if (!RELEVANT_KEYWORDS.some(k => text.includes(k))) return;

            const key = name.slice(0, 50).toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            parsed++;

            bids.push({
              id: 'hpw-' + (bidNum || Buffer.from(name).toString('base64').slice(0, 12)),
              source: 'Houston Public Works',
              name,
              agency: 'City of Houston — Public Works',
              city: 'Houston',
              region: 'houston',
              scope: `Houston Public Works Bid — ${dept || 'Water/Wastewater Engineering'}. Bid #: ${bidNum}`,
              due: cleanDate(due) || 'See link',
              value: 'TBD',
              status: detectStatus(due),
              url: link.startsWith('http') ? link
                : link ? 'https://purchasing.houstontx.gov' + link
                : 'https://purchasing.houstontx.gov/Bids.aspx',
              scrapedAt: new Date().toISOString()
            });
          } catch(e) {}
        });

        if (parsed > 0) break;
      }

      console.log('[Houston PW] Found', parsed, 'bids from', url);
      if (bids.length > 0) break;
      await sleep(2000);

    } catch(err) {
      console.warn('[Houston PW] Failed:', url, '-', err.message);
    }
  }

  console.log('[Houston PW] Total:', bids.length, 'bids');
  return { bids, source: 'Houston Public Works' };
}

// ─── TWDB GRANTS PAGE ─────────────────────────────────────────
async function scrapeTWDB() {
  const bids = [];
  const seen = new Set();

  const urls = [
    'https://www.twdb.texas.gov/financial/programs/WSIG/index.asp',
    'https://www.twdb.texas.gov/financial/programs/index.asp',
    'https://www.twdb.texas.gov/procurement/index.asp',
    'https://www.twdb.texas.gov/procurement/bids/index.asp',
  ];

  for (const url of urls) {
    try {
      console.log('[TWDB] Fetching:', url);
      const res = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.twdb.texas.gov',
        },
        timeout: TIMEOUT
      });

      const $ = cheerio.load(res.data);
      let parsed = 0;

      // Look for grant recipients / funded projects — these become downstream E&I bids
      const selectors = [
        'table tbody tr',
        'table tr',
        '.grant-row',
        '[class*="project"] tr',
        'tr',
      ];

      for (const sel of selectors) {
        const rows = $(sel);
        if (rows.length < 2) continue;

        rows.each((i, el) => {
          try {
            const cells = $(el).find('td');
            if (cells.length < 2) return;

            const name = $(el).find('a, [class*="title"]').first().text().trim()
              || $(cells[0]).text().trim()
              || $(cells[1]).text().trim();
            const entity = $(cells[1]).text().trim() || $(cells[0]).text().trim();
            const amount = $(cells).filter((i, c) => /\$|amount|grant/i.test($(c).text())).first().text().trim();
            const link = $(el).find('a').first().attr('href') || '';

            if (!name || name.length < 5) return;
            if (/^(project|entity|recipient|amount|status|type|title|grant)$/i.test(name.trim())) return;

            const key = name.slice(0, 50).toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            parsed++;

            bids.push({
              id: 'twdb-' + Buffer.from(name + entity).toString('base64').slice(0, 14),
              source: 'TWDB',
              name: `[TWDB Grant] ${name}`,
              agency: entity || 'Texas Water Development Board',
              city: 'Texas',
              region: 'statewide',
              scope: `TWDB HB500 Grant Recipient — downstream E&I engineering bids expected. Grant: ${amount || 'TBD'}`,
              due: 'Post-funding',
              value: amount || 'TBD',
              status: 'prebid',
              url: link.startsWith('http') ? link
                : link ? 'https://www.twdb.texas.gov' + link
                : url,
              scrapedAt: new Date().toISOString()
            });
          } catch(e) {}
        });

        if (parsed > 0) break;
      }

      // Also grab any linked PDFs or project lists
      if (parsed === 0) {
        $('a[href*="project"], a[href*="grant"], a[href*="funded"], a[href*="recipient"]').each((i, el) => {
          try {
            const name = $(el).text().trim();
            const link = $(el).attr('href') || '';
            if (!name || name.length < 5) return;
            const key = name.slice(0, 50).toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            bids.push({
              id: 'twdb-' + Buffer.from(name).toString('base64').slice(0, 14),
              source: 'TWDB',
              name: `[TWDB] ${name}`,
              agency: 'Texas Water Development Board',
              city: 'Texas', region: 'statewide',
              scope: 'TWDB Grant Program — downstream E&I engineering bids expected',
              due: 'Post-funding', value: 'TBD', status: 'prebid',
              url: link.startsWith('http') ? link : 'https://www.twdb.texas.gov' + link,
              scrapedAt: new Date().toISOString()
            });
          } catch(e) {}
        });
      }

      console.log('[TWDB] Found', parsed || bids.length, 'entries from', url);
      if (bids.length > 0) break;
      await sleep(2000);

    } catch(err) {
      console.warn('[TWDB] Failed:', url, '-', err.message);
    }
  }

  console.log('[TWDB] Total:', bids.length, 'bids');
  return { bids, source: 'TWDB' };
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

module.exports = { scrapeHoustonPW, scrapeTWDB };
