const axios = require('axios');
const cheerio = require('cheerio');

const TIMEOUT = 10000;

async function scrapeEnviroBidNet() {
  const bids = [];
  const urls = [
    'https://envirobidnet.com/bids/scada-and-environmental-technology/all?state=TX',
    'https://envirobidnet.com/bids/water-wastewater/all?state=TX'
  ];
  for (const url of urls) {
    try {
      const res = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: TIMEOUT
      });
      const $ = cheerio.load(res.data);
      $('table tr').each((i, el) => {
        try {
          const cells = $(el).find('td');
          if (cells.length < 3) return;
          const name = $(cells[0]).text().trim();
          const agency = $(cells[1]).text().trim();
          const due = $(cells[2]).text().trim();
          const link = $(el).find('a').first().attr('href') || '';
          if (!name || name.length < 5 || name.toLowerCase() === 'title') return;
          bids.push({
            id: 'envirobidnet-' + Buffer.from(name + agency).toString('base64').slice(0,12),
            source: 'EnviroBidNet', name,
            agency: agency || 'Unknown', city: 'Texas', region: 'statewide',
            scope: 'SCADA / Water Engineering — See RFQ link',
            due: due || 'See link', value: 'TBD',
            status: detectStatus(due),
            url: link.startsWith('http') ? link : 'https://envirobidnet.com' + link,
            scrapedAt: new Date().toISOString()
          });
        } catch(e) {}
      });
      await sleep(1500);
    } catch(err) {
      console.warn('[EnviroBidNet]', url, 'failed:', err.message);
    }
  }
  console.log('[EnviroBidNet] Found ' + bids.length + ' bids');
  return bids;
}

function detectStatus(due = '') {
  try {
    const d = new Date(due);
    const diff = (d - new Date()) / 86400000;
    if (isNaN(diff)) return 'active';
    if (diff <= 7) return 'closing';
    return diff <= 30 ? 'active' : 'prebid';
  } catch { return 'active'; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { scrapeEnviroBidNet };
