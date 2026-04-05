async function runAllScrapers() {
  console.log('[Scrapers] Running all sources...');

  const scraperDefs = [
    { name: 'CivCast',        file: './civcast.js',   fn: 'scrapeCivCast' },
    { name: 'H2bid',          file: './other.js',     fn: 'scrapeH2bid' },
    { name: 'TX ESBD',        file: './other.js',     fn: 'scrapeTXESBD' },
    { name: 'Austin Water',   file: './austinwater.js', fn: 'scrapeAustinWater' },
    { name: 'SAWS',           file: './saws.js',      fn: 'scrapeSAWS' },
    { name: 'BidNet TX',      file: './bidnet.js',    fn: 'scrapeBidNetTX' },
    { name: 'DemandStar',     file: './demandstar.js',fn: 'scrapeDemandStar' },
    { name: 'TRA',            file: './tra.js',       fn: 'scrapeTRA' },
    { name: 'Houston PW',     file: './houston.js',   fn: 'scrapeHoustonPW' },
    { name: 'TWDB',           file: './houston.js',   fn: 'scrapeTWDB' },
  ];

  const allBids = [];
  const results = [];

  for (const def of scraperDefs) {
    try {
      console.log(`[${def.name}] Running...`);
      const mod = require(def.file);
      const fn = mod[def.fn];
      if (!fn) throw new Error(`Function ${def.fn} not found in ${def.file}`);
      const result = await fn();
      const bids = Array.isArray(result) ? result : (result.bids || []);
      console.log(`[${def.name}] ${bids.length} bids`);
      allBids.push(...bids);
      results.push({ source: def.name, count: bids.length, status: 'ok', message: '' });
    } catch(e) {
      console.error(`[${def.name}] FAILED: ${e.message}`);
      results.push({ source: def.name, count: 0, status: 'error', message: e.message });
    }
  }

  console.log('[Scrapers] Total:', allBids.length, 'bids');
  return { scraped: allBids, results };
}

module.exports = { runAllScrapers };
