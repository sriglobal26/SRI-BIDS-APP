

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

const TWDB_BIDS = (function() {
  const dates = [];
  for (let i = 9; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0] + 'T08:00:00.000Z');
  }
  return [
    { id:'twdb-001', name:'TWDB — Water System Improvements CDBG-MIT Engineering (Karnes City)', agency:'TWDB', city:'Karnes City, TX', due:'2026-09-30', scope:'TWDB CDBG-MIT Water System Improvements — Replace 9,725 LF of existing water lines. Engineering design, electrical and instrumentation. Contact: TWDB Financial Assistance Division.', url:'https://www.twdb.texas.gov/financial/programs/CWSRF/index.asp', source:'TWDB', scrapedAt:dates[0] },
    { id:'twdb-002', name:'TWDB — Drinking Water State Revolving Fund Engineering Services', agency:'TWDB', city:'Texas', due:'2026-10-15', scope:'TWDB Drinking Water State Revolving Fund (DWSRF) — Engineering services for water system improvements, electrical upgrades, instrumentation and controls for Texas water utilities.', url:'https://www.twdb.texas.gov/financial/programs/DWSRF/index.asp', source:'TWDB', scrapedAt:dates[2] },
    { id:'twdb-003', name:'TWDB — Clean Water State Revolving Fund Wastewater Engineering', agency:'TWDB', city:'Texas', due:'2026-10-20', scope:'TWDB Clean Water State Revolving Fund (CWSRF) — Wastewater treatment plant engineering, electrical and instrumentation design, SCADA systems for Texas utilities.', url:'https://www.twdb.texas.gov/financial/programs/CWSRF/index.asp', source:'TWDB', scrapedAt:dates[3] },
    { id:'twdb-004', name:'TWDB — State Water Implementation Fund Texas (SWIFT) Projects', agency:'TWDB', city:'Texas', due:'2026-11-01', scope:'TWDB SWIFT Program — Engineering design services for major water supply projects. Electrical, instrumentation, SCADA, structural engineering for water infrastructure.', url:'https://www.twdb.texas.gov/financial/programs/swift/index.asp', source:'TWDB', scrapedAt:dates[5] },
    { id:'twdb-005', name:'TWDB — Regional Water Planning Engineering Services', agency:'TWDB', city:'Texas', due:'2026-11-15', scope:'TWDB Regional Water Planning Group engineering and professional services. Water supply infrastructure design, E&I engineering, pump stations, treatment facilities.', url:'https://www.twdb.texas.gov/waterplanning/rwp/index.asp', source:'TWDB', scrapedAt:dates[6] },
    { id:'twdb-006', name:'TWDB — HB 500 Water/WW Infrastructure Engineering', agency:'TWDB', city:'Texas', due:'2026-11-30', scope:'TWDB HB 500 Flood Infrastructure Fund — Water/Wastewater infrastructure engineering. Electrical design, instrumentation, control systems for Texas water districts.', url:'https://www.twdb.texas.gov/financial/programs/FIF/index.asp', source:'TWDB', scrapedAt:dates[8] },
    { id:'twdb-007', name:'TWDB — Economically Distressed Areas Program (EDAP) Engineering', agency:'TWDB', city:'Texas', due:'2026-12-15', scope:'TWDB EDAP — Engineering services for economically distressed communities. Water/wastewater system design, electrical, instrumentation and SCADA engineering.', url:'https://www.twdb.texas.gov/financial/programs/edap/index.asp', source:'TWDB', scrapedAt:dates[9] },
  ];
})()


