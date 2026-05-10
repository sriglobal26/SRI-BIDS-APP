const axios = require('axios');
const cheerio = require('cheerio');
async function scrapeEnviroBidNet() {
  const bids = [];
  const urls = ['https://envirobidnet.com/bids/scada-and-environmental-technology/all?state=TX','https://envirobidnet.com/bids/water-wastewater/all?state=TX'];
  for(const url of urls){
    try{
      const res = await axios.get(url,{headers:{'User-Agent':'Mozilla/5.0'},timeout:10000});
      const $ = cheerio.load(res.data);
      $('table tr').each((i,el)=>{
        const cells=$(el).find('td');if(cells.length<3)return;
        const name=$(cells[0]).text().trim();const agency=$(cells[1]).text().trim();const due=$(cells[2]).text().trim();
        const link=$(el).find('a').first().attr('href')||'';
        if(!name||name.length<5||name.toLowerCase()==='title')return;
        bids.push({id:'env-'+Buffer.from(name+agency).toString('base64').slice(0,12),
          source:'EnviroBidNet',name,agency:agency||'Unknown',city:'Texas',region:'statewide',
          scope:'SCADA/Water Engineering — See RFQ link',due:due||'See link',value:'TBD',status:'active',
          url:link.startsWith('http')?link:'https://envirobidnet.com'+link,
          scrapedAt:new Date().toISOString()});
      });
      await new Promise(r=>setTimeout(r,2000));
    }catch(e){console.warn('[EnviroBidNet]',e.message);}
  }
  console.log('[EnviroBidNet] Found',bids.length,'bids');
  return bids;
}
module.exports = {scrapeEnviroBidNet};
