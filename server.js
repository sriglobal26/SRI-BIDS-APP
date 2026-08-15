

async function fetchAndSaveCivCastBids() {
  try {
    const https = require('https');
    const data = await new Promise((resolve, reject) => {
      const req = https.get({ hostname:'app.civcast.com', path:'/api/v1/bid-opportunities?state=TX&status=open&limit=20', headers:{'User-Agent':'SRI/1.0','Accept':'application/json'} }, (res) => { let b=''; res.on('data',d=>b+=d); res.on('end',()=>resolve(b)); });
      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    });
    const result = JSON.parse(data);
    const bids = result.projects || result.bids || result.data || [];
    if (!Array.isArray(bids)) return;
    const kw = ['water','wastewater','electrical','sewer','pump','scada','lift station'];
    let added = 0;
    for (const bid of bids.slice(0,10)) {
      const title = (bid.name||bid.title||'').toLowerCase();
      if (!kw.some(k=>title.includes(k))) continue;
      const due = (bid.bid_date||bid.due_date||'').split('T')[0];
      if (!due || due < new Date().toISOString().split('T')[0]) continue;
      await saveBid({ id:'civcast-'+bid.id, name:bid.name||bid.title||'CivCast Bid', agency:'CivCast', city:(bid.city||'Texas')+', TX', due, scope:bid.description||bid.name||'', url:'https://app.civcast.com/bid-opportunities/projects/'+(bid.id||''), source:'CivCast', value:'TBD', status:'active', region:detectRegion(bid.city||''), scrapedAt:new Date().toISOString() });
      added++;
    }
    console.log('[AutoFetch] CivCast:', added, 'new bids');
  } catch(e) { console.log('[AutoFetch] CivCast skipped:', e.message); }
}

async function fetchAndSaveEnviroBidNetBids() {
  try {
    const https = require('https');
    const data = await new Promise((resolve, reject) => {
      const req = https.get({ hostname:'www.envirobidnet.com', path:'/api/bids/public?state=TX&category=water&limit=10', headers:{'User-Agent':'SRI/1.0','Accept':'application/json'} }, (res) => { let b=''; res.on('data',d=>b+=d); res.on('end',()=>resolve(b)); });
      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    });
    const bids = JSON.parse(data);
    if (!Array.isArray(bids)) return;
    let added = 0;
    for (const bid of bids.slice(0,7)) {
      const due = (bid.due_date||bid.expiration||'').split('T')[0];
      if (!due || due < new Date().toISOString().split('T')[0]) continue;
      const bidNum = bid.bid_id||bid.id||'';
      await saveBid({ id:'ebn-'+bidNum, name:bid.title||'EnviroBidNet Bid', agency:'EnviroBidNet', city:bid.city||'Texas', due, scope:bid.description||bid.title||'', url:bidNum?'https://www.envirobidnet.com/subscriber_view_bid/'+bidNum:'https://www.envirobidnet.com/bid-center/', source:'EnviroBidNet', bidId:'#'+bidNum, value:'TBD', status:'active', region:detectRegion(bid.city||''), scrapedAt:new Date().toISOString() });
      added++;
    }
    console.log('[AutoFetch] EnviroBidNet:', added, 'new bids');
  } catch(e) { console.log('[AutoFetch] EnviroBidNet skipped:', e.message); }
}

