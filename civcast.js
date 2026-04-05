const axios = require('axios');
const cheerio = require('cheerio');

const KEYWORDS = ['electrical','instrumentation','scada','controls','water','wastewater','wtp','wwtp','lift station','pump station','generator','plc','e&i'];
const TIMEOUT = 15000;

async function scrapeCivCast() {
  const bids = [];
  const seen = new Set();

  const searches = [
    { kw: 'electrical instrumentation water texas', label: 'E&I Water TX' },
    { kw: 'scada water texas',                      label: 'SCADA TX' },
    { kw: 'wastewater electrical texas',             label: 'WW Electrical TX' },
    { kw: 'instrumentation controls texas',          label: 'Instrumentation TX' },
    { kw: 'engineering services texas',              label: 'Engineering Services TX' },
  ];

  for (const { kw, label } of searches) {
    try {
      const url = `https://www.civcastusa.com/bids?keywords=${encodeURIComponent(kw)}&state=TX&timeInfo=0`;
      const res = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: TIMEOUT
      });

      const $ = cheerio.load(res.data);

      // Try multiple selector patterns — CivCast has changed layout before
      const selectors = [
        '.bid-list-item',
        '.bid-card',
        '[class*="bid-item"]',
        '[class*="BidItem"]',
        '.search-result',
        'tr.bid-row',
        '.project-item',
        '.result-item',
      ];

      let found = false;
      for (const sel of selectors) {
        const items = $(sel);
        if (items.length > 0) {
          found = true;
          items.each((i, el) => {
            try {
              const name = $(el).find('[class*="title"], [class*="name"], h2, h3, h4, .bid-title, .project-title').first().text().trim()
                || $(el).find('a').first().text().trim();
              const agency = $(el).find('[class*="agency"], [class*="owner"], [class*="entity"], .owner-name').first().text().trim();
              const due = $(el).find('[class*="due"], [class*="date"], [class*="close"], [class*="deadline"]').first().text().trim();
              const city = $(el).find('[class*="city"], [class*="location"], [class*="county"]').first().text().trim();
              const link = $(el).find('a[href*="bid"]').first().attr('href')
                || $(el).find('a').first().attr('href') || '';
              const id = $(el).attr('data-bid-id') || $(el).attr('id') || null;

              if (!name || name.length < 5) return;
              const key = name.slice(0, 40).toLowerCase();
              if (seen.has(key)) return;

              const text = (name + ' ' + agency + ' ' + ($(el).text())).toLowerCase();
              if (!KEYWORDS.some(k => text.includes(k))) return;

              seen.add(key);
              bids.push({
                id: 'civcast-' + (id || Buffer.from(name + agency).toString('base64').slice(0, 12)),
                source: 'CivCast',
                name, agency: agency || 'Unknown Texas Agency',
                city: city || 'Texas', region: detectRegion(city),
                scope: extractScope($, el) || 'Water/Wastewater E&I — See CivCast for full scope',
                due: cleanDate(due) || 'See link',
                value: extractValue($, el) || 'TBD',
                status: detectStatus(due),
                url: link.startsWith('http') ? link : 'https://www.civcastusa.com' + link,
                scrapedAt: new Date().toISOString()
              });
            } catch(e) {}
          });
          break;
        }
      }

      // Fallback: try scraping table rows if no cards found
      if (!found) {
        $('table tbody tr').each((i, el) => {
          try {
            const cells = $(el).find('td');
            if (cells.length < 2) return;
            const name = $(cells[0]).text().trim() || $(cells[1]).text().trim();
            const agency = $(cells[1]).text().trim() || $(cells[2]).text().trim();
            const due = $(cells).filter((i, c) => /due|close|date/i.test($(c).text())).text().trim();
            const link = $(el).find('a').first().attr('href') || '';
            if (!name || name.length < 5 || /title|header/i.test(name)) return;
            const key = name.slice(0, 40).toLowerCase();
            if (seen.has(key)) return;
            const text = (name + ' ' + agency).toLowerCase();
            if (!KEYWORDS.some(k => text.includes(k))) return;
            seen.add(key);
            bids.push({
              id: 'civcast-' + Buffer.from(name + agency).toString('base64').slice(0, 12),
              source: 'CivCast', name,
              agency: agency || 'Unknown', city: 'Texas', region: 'statewide',
              scope: 'Water/Wastewater E&I — See CivCast for full scope',
              due: cleanDate(due) || 'See link', value: 'TBD',
              status: detectStatus(due),
              url: link.startsWith('http') ? link : 'https://www.civcastusa.com' + link,
              scrapedAt: new Date().toISOString()
            });
          } catch(e) {}
        });
      }

      await sleep(2000);
    } catch(err) {
      console.warn(`[CivCast] "${label}" failed:`, err.message);
    }
  }

  console.log('[CivCast] Found', bids.length, 'bids');
  return { bids, source: 'CivCast' };
}

function extractScope($, el) {
  return $(el).find('[class*="desc"], [class*="scope"], [class*="summary"], p').first().text().trim().slice(0, 200);
}

function extractValue($, el) {
  const txt = $(el).find('[class*="value"], [class*="amount"], [class*="cost"], [class*="estimate"]').first().text().trim();
  if (txt && /\$/.test(txt)) return txt;
  const match = $(el).text().match(/\$[\d,]+(?:\.\d+)?(?:\s*(?:M|K|million|thousand))?/i);
  return match ? match[0] : null;
}

function cleanDate(str) {
  if (!str) return '';
  const match = str.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\w+\s+\d{1,2},?\s+\d{4}/i);
  return match ? match[0] : str.replace(/due|close|date|:/gi, '').trim().slice(0, 30);
}

function detectRegion(city = '') {
  const c = city.toLowerCase();
  if (['houston','pearland','baytown','pasadena','katy','sugar land','league city','conroe','galveston','friendswood'].some(h => c.includes(h))) return 'houston';
  if (['dallas','plano','fort worth','arlington','denton','frisco'].some(h => c.includes(h))) return 'dfw';
  if (c.includes('austin')) return 'austin';
  if (c.includes('san antonio')) return 'sa';
  return 'statewide';
}

function detectStatus(due = '') {
  try {
    const d = new Date(due);
    const diff = (d - Date.now()) / 86400000;
    if (isNaN(diff)) return 'active';
    if (diff < 0) return 'active'; // past due but keep as active until manually removed
    if (diff <= 7) return 'closing';
    if (diff <= 30) return 'active';
    return 'prebid';
  } catch { return 'active'; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { scrapeCivCast };
