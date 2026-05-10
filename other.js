const axios = require('axios');
const cheerio = require('cheerio');
async function scrapeH2bid() {
  const bids = [];
  const terms = ['electrical+instrumentation','scada+water','wastewater+electrical'];
  for(const kw of terms){
    try{
      const res = await axios.get(`https://h2bid.com/Bids/BidsSearchPreview?keyword=${kw}&state=TX`,{headers:{'User-Agent':'Mozilla/5.0'},timeout:10000});
      const $ = cheerio.load(res.data);
      $('table tr').each((i,el)=>{
        const name=$(el).find('td:nth-child(2)').text().trim();
        const agency=$(el).find('td:nth-child(3)').text().trim();
        const due=$(el).find('td:nth-child(4)').text().trim();
        const link=$(el).find('a').first().attr('href')||'';
        if(!name||name.length<5||name.toLowerCase()==='title')return;
        bids.push({id:'h2bid-'+Buffer.from(name+agency).toString('base64').slice(0,12),
          source:'H2bid',name,agency:agency||'Unknown',city:'Texas',region:'statewide',
          scope:'Water/Wastewater — See RFQ link',due:due||'See link',value:'TBD',status:'active',
          url:link.startsWith('http')?link:'https://h2bid.com'+link,
          scrapedAt:new Date().toISOString()});
      });
      await new Promise(r=>setTimeout(r,2000));
    }catch(e){console.warn('[H2bid]',e.message);}
  }
  console.log('[H2bid] Found',bids.length,'bids');
  return bids;
}
async function scrapeTXESBD() {
  const bids = [];
  for(const code of ['913','920','956']){
    try{
      const res = await axios.get(`https://www.txsmartbuy.gov/esbd?nigpCode=${code}&keywords=water`,{headers:{'User-Agent':'Mozilla/5.0'},timeout:10000});
      const $ = cheerio.load(res.data);
      $('table tr').each((i,el)=>{
        const name=$(el).find('td:nth-child(2)').text().trim();
        const agency=$(el).find('td:nth-child(3)').text().trim();
        const due=$(el).find('td:nth-child(4)').text().trim();
        const link=$(el).find('a').first().attr('href')||'';
        if(!name||name.length<5||name.toLowerCase()==='title')return;
        bids.push({id:'esbd-'+Buffer.from(name+agency).toString('base64').slice(0,12),
          source:'TX ESBD',name,agency:agency||'TX State Agency',city:'Texas',region:'statewide',
          scope:'NIGP '+code+' — E&I Engineering',due:due||'See link',value:'TBD',status:'active',
          url:link.startsWith('http')?link:'https://www.txsmartbuy.gov'+link,
          scrapedAt:new Date().toISOString()});
      });
      await new Promise(r=>setTimeout(r,2000));
    }catch(e){console.warn('[TXESBD]',e.message);}
  }
  console.log('[TX ESBD] Found',bids.length,'bids');
  return bids;
}
module.exports = {scrapeH2bid,scrapeTXESBD};
