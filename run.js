const path = require('path');
const fs = require('fs');

function loadScraper(name) {
  // Try scrapers/ folder first, then root
  const nested = path.join(__dirname, 'scrapers', name);
  const flat = path.join(__dirname, name);
  return require(fs.existsSync(nested) ? nested : flat);
}

async function runAllScrapers() {
  console.log('[Scrapers] Running all sources...');
  const { scrapeCivCast } = loadScraper('civcast.js');
  const { scrapeEnviroBidNet } = loadScraper('envirobidnet.js');
  const { scrapeH2bid, scrapeTXESBD } = loadScraper('other.js');

  const results = await Promise.allSettled([
    scrapeCivCast(),
    scrapeEnviroBidNet(),
    scrapeH2bid(),
    scrapeTXESBD()
  ]);

  const allBids = [];
  const names = ['CivCast','EnviroBidNet','H2bid','TX ESBD'];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      console.log('[' + names[i] + '] ' + r.value.length + ' bids');
      allBids.push(...r.value);
    } else {
      console.warn('[' + names[i] + '] Failed:', r.reason?.message);
    }
  });
  console.log('[Scrapers] Total: ' + allBids.length + ' bids');
  return allBids;
}

module.exports = { runAllScrapers };
