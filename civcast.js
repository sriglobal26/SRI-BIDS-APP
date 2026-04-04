const axios = require('axios');
const cheerio = require('cheerio');

const KEYWORDS = ['electrical','instrumentation','scada','controls','water','wastewater','wtp','wwtp','lift station','pump station','generator','plc'];
const TIMEOUT = 10000; // 10 second timeout per request

async function scrapeCivCast() {
  const bids = [];
  const searches = [
    'electrical instrumentation water texas',
    'scada water texas',
    'wastewater electrical texas'
  ];

  for (const term of searches) {
    try {
      const url = 'https://www.civcastusa.com/bids?keywords=' + encodeURIComponent(term) + '&state=TX&timeInfo=0';
      const res = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: TIMEOUT
      });
      const $ = cheerio.load(res.data);
      $('.bid-list-item, .bid-card, [class*="bid-item"]').each((i, el) => {
        try {
          const name = $(el).find('[class*="title"], h3, h4').first().text().trim();
          const agency = $(el).find('[class*="agency"], [class*="owner"]').first().text().trim();
          const due = $(el).find('[class*="due"], [class*="date"]').first().text().trim();
          const city = $(el).find('[class*="city"], [class*="location"]').first().text().trim();
          const link = $(el).find('a').first().attr('href') || '';
          if (!name || name.length < 5) return;
          const text = (name + ' ' + agency).toLowerCase();
          if (!KEYWORDS.some(k => text.includes(k))) return;
          bids.push({
            id: 'civcast-' + Buffer.from(name + agency).toString('base64').slice(0,12),
            source: 'CivCast',
            name, agency: agency || 'Unknown',
            city: city || 'Texas', region: detectRegion(city),
            scope: 'See RFQ link for E&I scope details',
            due: due || 'See link', value: 'TBD',
            status: detectStatus(due),
            url: link.startsWith('http') ? link : 'https://www.civcastusa.com' + link,
            scrapedAt: new Date().toISOString()
          });
        } catch(e) {}
      });
      await sleep(1500);
    } catch(err) {
      console.warn('[CivCast] "' + term + '" failed:', err.message);
    }
  }
  console.log('[CivCast] Found ' + bids.length + ' bids');
  return bids;
}

function detectRegion(city = '') {
  const c = city.toLowerCase();
  if (['houston','pearland','baytown','pasadena','katy','sugar land','league city','conroe','galveston','friendswood','la porte','missouri city'].some(h => c.includes(h))) return 'houston';
  if (c.includes('dallas') || c.includes('plano') || c.includes('fort worth')) return 'dfw';
  if (c.includes('austin')) return 'austin';
  if (c.includes('san antonio')) return 'sa';
  return 'statewide';
}

function detectStatus(due = '') {
  try {
    const d = new Date(due);
    const diff = (d - new Date()) / 86400000;
    if (isNaN(diff)) return 'active';
    if (diff <= 7) return 'closing';
    if (diff <= 30) return 'active';
    return 'prebid';
  } catch { return 'active'; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { scrapeCivCast };
