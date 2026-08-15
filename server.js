

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
async function fetchAndSaveESBDbids() {
  try {
    const https = require('https');
    // SRI Global filter: only electrical, structural, instrumentation, wastewater, engineering, professional
    const SRI_KEYWORDS = [
      'electrical','instrumentation','wastewater','water treatment',
      'structural','professional engineering','engineering services',
      'SCADA','control systems','lift station','pump station',
      'BMS','PLC','DCS','E&I','MV switchgear','substation'
    ];
    const data = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'publicbidtracker.com',
        path: '/api/texas/bids?keywords=electrical+instrumentation+wastewater+engineering+structural&limit=30',
        headers: { 'User-Agent': 'SRI-Global-Bids/1.0', 'Accept': 'application/json' }
      };
      const req = https.get(options, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => resolve(body));
      });
      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    });

    const bids = JSON.parse(data);
    if (!Array.isArray(bids)) return;

    let added = 0;
    for (const bid of bids.slice(0, 20)) {
      const title = (bid.title || bid.description || '').toLowerCase();
      // STRICT filter - only SRI Global relevant bids
      const isRelevant = SRI_KEYWORDS.some(k => title.includes(k.toLowerCase()));
      if (!isRelevant) continue;

      const bidId = 'esbd-live-' + (bid.id || bid.solicitation_id || Date.now());
      const due = (bid.due_date || bid.deadline || '').split('T')[0];
      if (!due || due < new Date().toISOString().split('T')[0]) continue;

      // Check not already in DB
      const existing = await pool.query("SELECT id FROM bids WHERE id=$1", [bidId]);
      if (existing.rows.length > 0) continue;

      await saveBid({
        id: bidId,
        name: bid.title || bid.description || 'TX ESBD Bid',
        agency: 'TX ESBD',
        city: bid.agency || 'Texas',
        due: due,
        scope: bid.description || bid.title || '',
        url: bid.url || 'https://www.txsmartbuy.gov/esbd',
        source: 'TX ESBD',
        value: 'TBD',
        status: 'active',
        region: 'statewide',
        scrapedAt: new Date().toISOString()
      });
      added++;
    }
    console.log('[AutoFetch] TX ESBD:', added, 'new relevant bids added');
  } catch(e) {
    console.log('[AutoFetch] TX ESBD fetch skipped:', e.message);
  }
}async function fetchAndSaveCivCastBids() {
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

