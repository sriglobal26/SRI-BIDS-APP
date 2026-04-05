async function runAllScrapers() {
  console.log('[Scrapers] Running all sources...');

  const { scrapeCivCast }             = require('./civcast.js');
  const { scrapeH2bid, scrapeTXESBD } = require('./other.js');
  const { scrapeAustinWater }         = require('./austinwater.js');
  const { scrapeSAWS }                = require('./saws.js');
  const { scrapeBidNetTX }            = require('./bidnet.js');
  const { scrapeDemandStar }          = require('./demandstar.js');
  const { scrapeTRA }                 = require('./tra.js');

  const scraperDefs = [
    { name: 'CivCast',      fn: scrapeCivCast },
    { name: 'H2bid',        fn: scrapeH2bid },
    { name: 'TX ESBD',      fn: scrapeTXESBD },
    { name: 'Austin Water', fn: scrapeAustinWater },
    { name: 'SAWS',         fn: scrapeSAWS },
    { name: 'BidNet TX',    fn: scrapeBidNetTX },
    { name: 'DemandStar',   fn: scrapeDemandStar },
    { name: 'TRA',          fn: scrapeTRA },
  ];

  const allBids = [];
  const results = [];

  const settled = await Promise.allSettled(scraperDefs.map(s => s.fn()));

  settled.forEach((r, i) => {
    const { name } = scraperDefs[i];
    if (r.status === 'fulfilled') {
      const bids = Array.isArray(r.value) ? r.value : (r.value.bids || []);
      console.log(`[${name}] ${bids.length} bids`);
      allBids.push(...bids);
      results.push({ source: name, count: bids.length, status: 'ok', message: '' });
    } else {
      console.warn(`[${name}] Failed:`, r.reason?.message);
      results.push({ source: name, count: 0, status: 'error', message: r.reason?.message || 'Unknown error' });
    }
  });

  console.log('[Scrapers] Total:', allBids.length, 'bids across all sources');
  return { scraped: allBids, results };
}

module.exports = { runAllScrapers };
