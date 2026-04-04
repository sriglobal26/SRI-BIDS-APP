const axios = require('axios');
const cheerio = require('cheerio');

const TIMEOUT = 10000;

async function scrapeH2bid() {
  const bids = [];
  const terms = ['electrical+instrumentation', 'SCADA+water'];
  for (const kw of terms) {
    try {
      const url = 'https://h2bid.com/Bids/BidsSearchPreview?keyword=' + kw + '&state=TX';
      const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: TIMEOUT });
      const $ = cheerio.load(res.data);
      $('table tr').each((i, el) => {
        try {
          const name = $(el).find('td:nth-child(2)').text().trim();
          const agency = $(el).find('td:nth-child(3)').text().trim();
          const due = $(el).find('td:nth-child(4)').text().trim();
          const link = $(el).find('a').first().attr('href') || '';
          if (!name || name.length < 5 || name.toLowerCase() === 'title') return;
          bids.push({
            id: 'h2bid-' + Buffer.from(name + agency).toString('base64').slice(0,12),
            source: 'H2bid', name,
            agency: agency || 'Unknown', city: 'Texas', region: 'statewide',
            scope: 'Water/Wastewater E&I — See RFQ link',
            due: due || 'See link', value: 'TBD',
            status: detectStatus(due),
            url: link.startsWith('http') ? link : 'https://h2bid.com' + link,
            scrapedAt: new Date().toISOString()
          });
        } catch(e) {}
      });
      await sleep(1500);
    } catch(err) {
      console.warn('[H2bid]', kw, 'failed:', err.message);
    }
  }
  console.log('[H2bid] Found ' + bids.length + ' bids');
  return bids;
}

async function scrapeTXESBD() {
  const bids = [];
  const codes = ['913', '920', '956'];
  for (const code of codes) {
    try {
      const url = 'https://www.txsmartbuy.gov/esbd?nigpCode=' + code + '&keywords=water';
      const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: TIMEOUT });
      const $ = cheerio.load(res.data);
      $('table tr').each((i, el) => {
        try {
          const name = $(el).find('td:nth-child(2)').text().trim();
          const agency = $(el).find('td:nth-child(3)').text().trim();
          const due = $(el).find('td:nth-child(4)').text().trim();
          const link = $(el).find('a').first().attr('href') || '';
          if (!name || name.length < 5 || name.toLowerCase() === 'title') return;
          bids.push({
            id: 'esbd-' + Buffer.from(name + agency).toString('base64').slice(0,12),
            source: 'TX ESBD', name,
            agency: agency || 'Texas State Agency', city: 'Texas', region: 'statewide',
            scope: 'NIGP ' + code + ' — Electrical/Instrumentation/Controls',
            due: due || 'See link', value: 'TBD',
            status: detectStatus(due),
            url: link.startsWith('http') ? link : 'https://www.txsmartbuy.gov' + link,
            scrapedAt: new Date().toISOString()
          });
        } catch(e) {}
      });
      await sleep(1500);
    } catch(err) {
      console.warn('[TXESBD] NIGP', code, 'failed:', err.message);
    }
  }
  console.log('[TX ESBD] Found ' + bids.length + ' bids');
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

module.exports = { scrapeH2bid, scrapeTXESBD };
