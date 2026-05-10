const { scrapeCivCast } = require('./civcast.js');
const { scrapeEnviroBidNet } = require('./envirobidnet.js');
const { scrapeH2bid, scrapeTXESBD } = require('./other.js');

async function runAllScrapers() {
  console.log('[Scrapers] Running all sources...');
  const results = await Promise.allSettled([
    scrapeCivCast(), scrapeEnviroBidNet(), scrapeH2bid(), scrapeTXESBD()
  ]);
  const allBids = [];
  ['CivCast','EnviroBidNet','H2bid','TX ESBD'].forEach((name,i)=>{
    if(results[i].status==='fulfilled'){
      console.log('['+name+']',results[i].value.length,'bids');
      allBids.push(...results[i].value);
    } else {
      console.warn('['+name+'] Failed:',results[i].reason?.message);
    }
  });
  const seen = new Set();
  const unique = allBids.filter(b=>{
    const k=(b.name+b.agency).toLowerCase().replace(/\s+/g,'');
    return seen.has(k)?false:seen.add(k);
  });
  console.log('[Scrapers] Total:',unique.length,'bids');
  return unique;
}
module.exports = { runAllScrapers };
