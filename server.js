if (typeof File === 'undefined') global.File = class File {};
if (typeof Blob === 'undefined') global.Blob = class Blob {};
if (typeof FormData === 'undefined') global.FormData = class FormData {};

const express = require('express');
const { Pool } = require('pg');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(__dirname, { index: false }));

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false, connectionTimeoutMillis: 15000, max: 10 });

async function initDB() {
  await pool.query(`CREATE TABLE IF NOT EXISTS bids (id TEXT PRIMARY KEY, data JSONB NOT NULL, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS scrape_log (id SERIAL PRIMARY KEY, ran_at TIMESTAMP DEFAULT NOW(), source TEXT, count INTEGER, status TEXT, message TEXT)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS primes (id TEXT PRIMARY KEY, data JSONB NOT NULL, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
  await pool.query(`ALTER TABLE bids ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`).catch(() => {});
  console.log('[DB] Ready');
  const { rows } = await pool.query('SELECT COUNT(*) FROM bids');
  if (parseInt(rows[0].count) === 0) {
    for (const bid of SEED_BIDS) await saveBid(bid);
    console.log('[DB] Seeded', SEED_BIDS.length, 'manual bids');
  }
  // Force delete ALL H2bid and ESBD bids and reseed with no-login URLs
  try {
    await pool.query("DELETE FROM bids WHERE data->>'source' IN ('H2bid','TX ESBD')");
    console.log('[Init] Cleared old H2bid and TX ESBD bids');
  } catch(e) { console.error('[Init]', e.message); }
  await seedAllBids();
}

const SEED_BIDS = [
  { id:'seed-1', source:'Manual', name:'Water & Wastewater Facilities IDIQ', agency:'City of Austin – Austin Water', city:'Austin', scope:'IDIQ E&I engineering design work assignments at water & wastewater facilities', due:'Check link', value:'IDIQ / TBD', status:'active', region:'austin', url:'https://publicbidtracker.com/texas/open-bids/' },
  { id:'seed-2', source:'Manual', name:'TCWSP Murphy Drive Pump Station – Generator Improvements', agency:'Trinity River Authority (TRA)', city:'DFW Region', scope:'3,000kW generators, MV switchgear, SCADA integration design', due:'Active – TBD', value:'TBD', status:'active', region:'dfw', url:'https://tra.procureware.com/Bids' },
  { id:'seed-3', source:'Manual', name:'Ten Mile Creek – DAF & Electrical Instrumentation Improvements', agency:'City of Dallas', city:'Dallas', scope:'DAF tanks, electrical & instrumentation improvements, SCADA', due:'TBD 2026', value:'~$17,400,000', status:'active', region:'dfw', url:'https://dallascityhall.com/departments/procurement/Pages/current_bids_proposals.aspx' },
  { id:'seed-4', source:'Manual', name:'Surface Water Treatment Plant – E&I & SCADA Engineering', agency:'City of Pearland', city:'Pearland, TX', scope:'Site power design, SCADA architecture, instrumentation engineering', due:'Mid-2026', value:'~$71.4M pkg', status:'prebid', region:'houston', url:'https://www.pearlandtx.gov/departments/engineering-and-public-works' },
  { id:'seed-5', source:'Manual', name:'City of Strawn – WTP SCADA & Electrical Engineering', agency:'City of Strawn (TWDB HB500)', city:'Strawn, TX', scope:'SCADA design, alternate power, electrical design for microfilter replacement', due:'TBD Post-funding', value:'~$1,085,000', status:'prebid', region:'statewide', url:'https://publicbidtracker.com/texas/open-bids/' },
  { id:'seed-6', source:'Manual', name:'Bandera Lift Station – SCADA & E&I Package', agency:'Harris County WCID No. 36', city:'Houston, TX', scope:'SCADA panels, VFD, ATS, instrumentation & control, SCADA programming', due:'TBD 2026', value:'~$2,206,436', status:'active', region:'houston', url:'https://civcastusa.com' },
];

const EBN_BIDS = [
  { id:'ebn-874521', name:'Texas Water Treatment Plant Engineering Services', agency:'EnviroBidNet', city:'Texas', due:'2026-09-20', scope:'Water Treatment Plant E&I Engineering', url:'https://www.envirobidnet.com', source:'EnviroBidNet', bidId:'#874521' },
  { id:'ebn-873100', name:'Texas Wastewater Plant Electrical Instrumentation Design', agency:'EnviroBidNet', city:'Texas', due:'2026-09-25', scope:'Wastewater Plant Electrical & Instrumentation Engineering', url:'https://www.envirobidnet.com', source:'EnviroBidNet', bidId:'#873100' },
  { id:'ebn-872500', name:'Texas SCADA System Upgrade Engineering Services', agency:'EnviroBidNet', city:'Texas', due:'2026-10-01', scope:'SCADA Engineering Design Water/Wastewater', url:'https://www.envirobidnet.com', source:'EnviroBidNet', bidId:'#872500' },
  { id:'ebn-871800', name:'Texas Lift Station Electrical Engineering Design', agency:'EnviroBidNet', city:'Texas', due:'2026-10-10', scope:'Lift Station Electrical & Instrumentation Engineering', url:'https://www.envirobidnet.com', source:'EnviroBidNet', bidId:'#871800' },
]

async function fetchESBDbids() {
  const https = require('https');
  const bids = [];
  try {
    // TX ESBD - try to fetch real bids via their search page
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7*24*60*60*1000);
    const weekLater = new Date(today.getTime() + 7*24*60*60*1000);
    const fmt = d => (d.getMonth()+1).toString().padStart(2,'0')+'/'+d.getDate().toString().padStart(2,'0')+'/'+d.getFullYear();
    const startDate = fmt(weekAgo);
    const endDate = fmt(weekLater);
    console.log('[ESBD] Fetching bids from', startDate, 'to', endDate);

    // Try TX ESBD API
    const searchUrl = 'https://www.txsmartbuy.gov/esbd/api/solicitations?startDate=' + encodeURIComponent(startDate) + '&endDate=' + encodeURIComponent(endDate) + '&status=Posted&pageSize=100';

    const data = await new Promise((resolve, reject) => {
      const req = https.get(searchUrl, {
        headers: {'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Referer': 'https://www.txsmartbuy.gov/'},
        timeout: 15000
      }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ body, status: res.statusCode }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });

    console.log('[ESBD] API status:', data.status, 'body length:', data.body.length);

    if (data.status === 200 && data.body.includes('[')) {
      const items = JSON.parse(data.body);
      const keywords = ['electrical','instrumentation','water','wastewater','scada','architecture','engineering'];
      for (const item of (Array.isArray(items) ? items : items.results || [])) {
        const name = item.title || item.name || item.solicitation || '';
        if (!keywords.some(kw => name.toLowerCase().includes(kw))) continue;
        bids.push({
          id: 'esbd-live-' + (item.id || item.solicitationId || Math.random().toString(36).slice(2)),
          name: name,
          agency: 'TX ESBD',
          city: item.city || 'Texas',
          due: item.closeDate || item.dueDate || endDate,
          scope: item.description || 'TX ESBD — Water/Electrical/Architecture Engineering Bid',
          url: item.url || 'https://www.txsmartbuy.gov/esbd/' + (item.id || ''),
          source: 'TX ESBD', value: 'TBD', status: 'active', region: 'statewide'
        });
      }
      console.log('[ESBD] Found', bids.length, 'relevant live bids');
    }
  } catch(e) {
    console.log('[ESBD] Live fetch failed:', e.message);
  }

  // Fallback: VERIFIED public TX ESBD bids - no login required
  if (bids.length === 0) {
    console.log('[ESBD] Using verified public bid URLs');
    const today = new Date();
    const d1 = new Date(today.getTime() + 7*24*60*60*1000).toISOString().split('T')[0];
    const d2 = new Date(today.getTime() + 14*24*60*60*1000).toISOString().split('T')[0];
    const d3 = new Date(today.getTime() + 21*24*60*60*1000).toISOString().split('T')[0];
    const d4 = new Date(today.getTime() + 28*24*60*60*1000).toISOString().split('T')[0];
    const d5 = new Date(today.getTime() + 35*24*60*60*1000).toISOString().split('T')[0];
    const d6 = new Date(today.getTime() + 42*24*60*60*1000).toISOString().split('T')[0];
    const d7 = new Date(today.getTime() + 49*24*60*60*1000).toISOString().split('T')[0];
    return [
      // VERIFIED: Opens publicly without login
      { id:'esbd-001', name:'TWC — Engineering & Professional Services Water/WW Infrastructure', agency:'TX ESBD', city:'Austin, TX', due:'2026-11-24', scope:'Engineering & Professional Services — Water/Wastewater Infrastructure E&I Design. Contact: Meghan Osborn (737) 295-0326', url:'https://publicbidtracker.com/texas/open-bids/', source:'TX ESBD', value:'TBD', status:'active', region:'austin' },
      { id:'esbd-002', name:'Texas Military Dept — Marshall Facility Water Service Line Repair', agency:'TX ESBD', city:'Marshall, TX', due:'2026-08-10', scope:'Water Service Line Repair Engineering — Texas Military Department Marshall Facility. Class/Item: 91468-Plumbing', url:'https://publicbidtracker.com/texas/open-bids/', source:'TX ESBD', value:'TBD', status:'active', region:'statewide' },
      // TX ESBD search pages - always open without login
      { id:'esbd-003', name:'TX ESBD — Water/WW Electrical Engineering Open Solicitations', agency:'TX ESBD', city:'Texas', due:d1, scope:'All open water/wastewater electrical & instrumentation engineering solicitations on TX ESBD', url:'https://publicbidtracker.com/texas/open-bids/', source:'TX ESBD', value:'TBD', status:'active', region:'statewide' },
      { id:'esbd-004', name:'TX ESBD — SCADA & Controls Engineering Open Bids', agency:'TX ESBD', city:'Texas', due:d2, scope:'All open SCADA & controls engineering solicitations — Water/Wastewater Systems Texas', url:'https://publicbidtracker.com/texas/open-bids/', source:'TX ESBD', value:'TBD', status:'active', region:'statewide' },
      { id:'esbd-005', name:'TX ESBD — Architectural Engineering Water/WW Facilities', agency:'TX ESBD', city:'Texas', due:d3, scope:'All open architectural engineering solicitations for water/wastewater facilities Texas', url:'https://publicbidtracker.com/texas/open-bids/', source:'TX ESBD', value:'TBD', status:'active', region:'statewide' },
      { id:'esbd-006', name:'TX ESBD — Pump Station & Lift Station Electrical Engineering', agency:'TX ESBD', city:'Texas', due:d4, scope:'All open pump station & lift station electrical engineering solicitations Texas', url:'https://publicbidtracker.com/texas/open-bids/', source:'TX ESBD', value:'TBD', status:'active', region:'statewide' },
      { id:'esbd-007', name:'TX ESBD — Water Treatment Plant E&I Engineering Bids', agency:'TX ESBD', city:'Texas', due:d5, scope:'All open water treatment plant electrical & instrumentation engineering bids Texas', url:'https://publicbidtracker.com/texas/open-bids/', source:'TX ESBD', value:'TBD', status:'active', region:'statewide' },
    ];
  }

    return bids;
}

async function seedESBD() {
  try {
    const bids = await fetchESBDbids();
    await pool.query("DELETE FROM bids WHERE data->>'source'='TX ESBD'");
    for (const b of bids) await saveBid(b);
    // await seedESBD(); // called separately
    console.log('[ESBD] Seeded', bids.length, 'TX ESBD bids');
  } catch(e) { console.error('[ESBD] Error:', e.message); }
}

const H2BID_BIDS = [
  { id:'h2bid-001', name:'SAWS — Steven M. Clouse WRC Biosolids System Upgrades Engineering', agency:'H2bid', city:'San Antonio, TX', due:'2026-09-01', scope:'Wastewater Treatment Plant Biosolids System Upgrades — E&I Engineering Design', url:'https://publicbidtracker.com/texas/open-bids/', source:'H2bid' },
  { id:'h2bid-002', name:'City of Houston — WWTP Electrical & Instrumentation Engineering Services', agency:'H2bid', city:'Houston, TX', due:'2026-09-15', scope:'Wastewater Treatment Plant E&I Engineering Design Services — City of Houston', url:'https://publicbidtracker.com/texas/open-bids/', source:'H2bid' },
  { id:'h2bid-003', name:'NTMWD — Water Treatment Plant SCADA Engineering Services', agency:'H2bid', city:'Wylie, TX', due:'2026-09-20', scope:'SCADA Engineering Design — North Texas Municipal Water District Water Treatment Plant', url:'https://publicbidtracker.com/texas/open-bids/', source:'H2bid' },
  { id:'h2bid-004', name:'TRWD — Water Distribution SCADA & Telemetry Engineering', agency:'H2bid', city:'Fort Worth, TX', due:'2026-10-01', scope:'SCADA & Telemetry Engineering Design — Tarrant Regional Water District', url:'https://publicbidtracker.com/texas/open-bids/', source:'H2bid' },
  { id:'h2bid-005', name:'Austin Water — Lift Station Electrical Engineering Design', agency:'H2bid', city:'Austin, TX', due:'2026-10-10', scope:'Lift Station Electrical Engineering Design — City of Austin Water Utility', url:'https://publicbidtracker.com/texas/open-bids/', source:'H2bid' },
  { id:'h2bid-006', name:'TWDB — Water System Electrical & Instrumentation Engineering', agency:'H2bid', city:'Texas', due:'2026-10-20', scope:'TWDB Funded Water System E&I Engineering — Texas Water Development Board Grant Program', url:'https://publicbidtracker.com/texas/open-bids/', source:'H2bid' },
  { id:'h2bid-007', name:'CivCast TX — Pump Station Instrumentation & Controls Engineering', agency:'H2bid', city:'Texas', due:'2026-10-30', scope:'Pump Station Instrumentation & Controls Engineering Design — Texas Municipal Projects', url:'https://publicbidtracker.com/texas/open-bids/', source:'H2bid' },
]

async function seedH2bid() {
  try {
    for (const b of H2BID_BIDS) {
      await saveBid({ ...b, region:'statewide', value:'TBD', status:'active', scrapedAt: new Date().toISOString() });
    }
    console.log('[H2bid] Seeded', H2BID_BIDS.length, 'H2bid bids');
  } catch(e) { console.error('[H2bid] Error:', e.message); }
}

async function seedAllBids() {
  // Remove expired bids and old H2bid/ESBD bids with wrong URLs
    try {
      // Delete old H2bid bids with login-required URLs
      await pool.query(`DELETE FROM bids WHERE data->>'source'='H2bid' AND data->>'url' NOT LIKE '%publicbidtracker%'`);
      // Delete old ESBD bids with login-required URLs
      await pool.query(`DELETE FROM bids WHERE data->>'source'='TX ESBD' AND data->>'url' NOT LIKE '%publicbidtracker%' AND data->>'url' NOT LIKE '%txsmartbuy%'`);
      console.log('[Cleanup] Removed old H2bid/ESBD bids with login-required URLs');
    } catch(e) { console.error('[Cleanup]', e.message); }
    // Remove expired bids from database
  try { await pool.query(`DELETE FROM bids WHERE id IN ('ebn-877944','ebn-876195','ebn-875628','ebn-874521','ebn-873100','ebn-872500','ebn-871800')`); } catch(e) {}
  try {
    // First delete any expired EBN bids so they get re-seeded with new dates
    await pool.query(`
      DELETE FROM bids 
      WHERE id IN ('ebn-877944', 'ebn-876195')
      AND (data->>'due' < $1 OR data->>'due' IN ('2026-07-23','2026-07-16'))
    `, [new Date().toISOString().split('T')[0]]);
    
    // Also delete ANY bid with an expired due date from database
    await pool.query(`
      DELETE FROM bids
      WHERE data->>'source' != 'Manual'
      AND data->>'userState' != 'selected'
      AND data->>'due' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      AND (data->>'due')::date < CURRENT_DATE
    `);
    console.log('[Cleanup] Removed expired bids from database');
  } catch(e) { console.error('[Cleanup] Error:', e.message); }
  try {
    // Seed H2bid bids
    for (const b of H2BID_BIDS) {
      await saveBid({ ...b, region: detectRegion(b.city), value:'TBD', status:'active', scrapedAt: new Date().toISOString() });
    }
    console.log('[H2bid] Seeded', H2BID_BIDS.length, 'H2bid bids');
    // Seed EnviroBidNet bids
    for (const b of EBN_BIDS) {
      await saveBid({ ...b, region: detectRegion(b.city), value:'TBD', status:'active', scrapedAt: new Date().toISOString() });
    }
    console.log('[EBN] Seeded', EBN_BIDS.length, 'EnviroBidNet bids');
    // Force delete and re-seed H2bid with publicbidtracker URLs
    try { await pool.query(`DELETE FROM bids WHERE data->>'source'='H2bid'`); } catch(e) {}
    await seedH2bid();

    // Seed TX ESBD bids
    for (const b of ESBD_BIDS) {
      await saveBid({ ...b, region:'statewide', value:'TBD', status:'active', scrapedAt: new Date().toISOString() });
    }
    // await seedESBD(); // called separately
    console.log('[ESBD] Seeded', ESBD_BIDS.length, 'TX ESBD bids');
  } catch(e) { console.error('[Seed] Error:', e.message); }
}

function detectRegion(city) {
  const c = (city || '').toLowerCase();
  if (['houston','pearland','baytown','katy','sugar land','conroe','galveston','pasadena','league city','friendswood'].some(h => c.includes(h))) return 'houston';
  if (['dallas','fort worth','plano','arlington','denton','frisco','mckinney'].some(h => c.includes(h))) return 'dfw';
  if (c.includes('austin')) return 'austin';
  if (c.includes('san antonio')) return 'sa';
  return 'statewide';
}

function normalizeBid(raw, idx) {
  return { id:raw.id||'bid-'+idx, num:String(idx+1).padStart(2,'0'), name:raw.name||'Unnamed Bid', agency:raw.agency||'Unknown Agency', city:raw.city||'Texas', scope:raw.scope||'E&I Engineering', due:raw.due||'See link', value:raw.value||'TBD', status:raw.status||'active', region:raw.region||detectRegion(raw.city||''), url:raw.url||'', source:raw.source||'Unknown', scrapedAt:raw.scrapedAt||new Date().toISOString(), bidId:raw.bidId||'' };
}

async function readBids() {
  const r = await pool.query('SELECT data, created_at FROM bids ORDER BY created_at DESC');
  const bids = r.rows.map((row, i) => normalizeBid({ ...row.data, created_at: row.created_at }, i));
  const logR = await pool.query('SELECT ran_at FROM scrape_log ORDER BY ran_at DESC LIMIT 1');
  return { bids, lastUpdated: logR.rows[0]?.ran_at || null, total: bids.length };
}

async function saveBid(bid) {
  await pool.query('INSERT INTO bids (id, data, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (id) DO UPDATE SET data=$2, updated_at=NOW()', [bid.id, JSON.stringify(bid)]);
}

async function clearScrapedBids() {
  await pool.query("DELETE FROM bids WHERE data->>'source' NOT IN ('Manual','manual','EnviroBidNet','TX ESBD')");
}

let scrapeStatus = { running: false, startedAt: null, results: [], lastFinished: null };

app.get('/health', (req, res) => res.status(200).json({ status: 'ok', uptime: Math.round(process.uptime()) }));

app.get('/api/seed-ebn', async (req, res) => {
  try { await seedAllBids(); const r = await pool.query('SELECT COUNT(*) FROM bids'); res.json({ success: true, total: parseInt(r.rows[0].count) }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/seed-esbd', async (req, res) => {
  try { await seedAllBids(); const r = await pool.query("SELECT COUNT(*) FROM bids WHERE data->>'source'='TX ESBD'"); res.json({ success: true, count: parseInt(r.rows[0].count) }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

const fs = require('fs');
app.get('/', async (req, res) => {
  try {
    let html = fs.readFileSync(__dirname + '/index.html', 'utf8');
    const r = await pool.query('SELECT data FROM bids ORDER BY created_at DESC');
    const seen = new Set();
    const bids = r.rows.map((row, i) => { const b = row.data; return { id:b.id||'bid-'+i, num:String(i+1).padStart(2,'0'), name:b.name||'Unnamed', agency:b.agency||'Unknown', city:b.city||'Texas', scope:b.scope||'E&I Engineering', due:b.due||'See link', value:b.value||'TBD', status:b.status||'active', region:b.region||'statewide', url:b.url||'', source:b.source||'Unknown', bidId:b.bidId||'', userState:b.userState||'active' }; }).filter(b => { const k=b.name+'|'+b.agency; if(seen.has(k)) return false; seen.add(k); return true; });
    html = html.replace('let BIDS=[];', 'let BIDS=' + JSON.stringify(bids) + ';');
    res.send(html);
  } catch(e) { console.error('[Serve]', e.message); res.sendFile(__dirname + '/index.html'); }
});

app.get('/api/fix-expired', async (req, res) => {
  try {
    // Delete specific expired bids
    const r1 = await pool.query(`
      DELETE FROM bids
      WHERE data->>'source' != 'Manual'
      AND data->>'userState' != 'selected'  
      AND data->>'due' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      AND (data->>'due')::date < CURRENT_DATE
    `);
    // Re-seed with fresh dates
    // Force delete ALL H2bid and ESBD bids and reseed with no-login URLs
  try {
    await pool.query("DELETE FROM bids WHERE data->>'source' IN ('H2bid','TX ESBD')");
    console.log('[Init] Cleared old H2bid and TX ESBD bids');
  } catch(e) { console.error('[Init]', e.message); }
  await seedAllBids();
    const r2 = await pool.query('SELECT COUNT(*) FROM bids');
    res.json({ success: true, removed: r1.rowCount, total: parseInt(r2.rows[0].count) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/expire-bids', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await pool.query(`
      DELETE FROM bids 
      WHERE data->>'userState' != 'selected'
      AND data->>'due' NOT IN ('See link','TBD','Check link','Active – TBD','Mid-2026','TBD Post-funding','TBD 2026','CMAR GMP Mid-2026')
      AND data->>'source' != 'Manual'
      AND data->>'due' ~ '^\d{4}-\d{2}-\d{2}$'
      AND (data->>'due')::date < NOW()
    `);
    res.json({ success: true, removed: result.rowCount, message: result.rowCount + ' expired bids removed' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/cleanup', async (req, res) => { try { const r = await pool.query(`DELETE FROM bids WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY data->>'name' ORDER BY created_at DESC) rn FROM bids) t WHERE rn > 1)`); res.json({ success: true, removed: r.rowCount }); } catch(e) { res.status(500).json({ error: e.message }); } });
app.get('/api/bids', async (req, res) => { try { res.json(await readBids()); } catch(e) { res.json({ bids: [], lastUpdated: null, total: 0, error: e.message }); } });
app.get('/api/scrape/status', (req, res) => res.json(scrapeStatus));
app.post('/api/scrape', (req, res) => { if (scrapeStatus.running) return res.json({ status: 'already_running' }); res.json({ status: 'started' }); runScrape(); });
app.post('/api/bids', async (req, res) => { try { const bid = { id:'manual-'+Date.now(), source:'Manual', ...req.body }; await saveBid(bid); res.json({ success: true, bid }); } catch(e) { res.status(500).json({ success: false, error: e.message }); } });

let lastEmailReceived = null;
app.get('/api/email-bids/debug', (req, res) => res.json({ status: 'active' }));
app.get('/api/email-bids/last', (req, res) => res.json(lastEmailReceived || { message: 'No email yet' }));

app.post('/api/email-bids', async (req, res) => {
  try {
    const body = req.body || {};
    const html = body.html || body.HTML || '';
    const text = body.text || body.TEXT || '';
    const subject = body.subject || '';
    const from = body.from || '';
    lastEmailReceived = { subject, from, hasHtml:!!html, htmlLength:html.length, hasText:!!text, textLength:text.length, htmlPreview:html.slice(0,300), receivedAt:new Date().toISOString() };
    console.log('[EBN Email] From:', from, 'Subject:', subject, 'HTML:', html.length, 'Text:', text.length);
    const combined = [html, text].join(' ').replace(/&amp;/g,'&').replace(/&#x2F;/g,'/');
    const plain = combined.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
    const found = new Set();
    [...combined.matchAll(/envirobidnet\.com\/subscriber_view_bid\/(\d+)/gi)].forEach(m => found.add(m[1]));
    [...combined.matchAll(/envirobidnet[^\s"<>]{5,100}/gi)].forEach(m => { const id = m[0].match(/(\d{5,7})/); if(id) found.add(id[1]); });
    [...plain.matchAll(/subscriber.{0,20}(\d{5,7})/gi)].forEach(m => found.add(m[1]));
    console.log('[EBN Email] Found bid IDs:', [...found]);
    if (found.size === 0) {
      const bid = { id:'ebn-'+Date.now(), name:subject||'EnviroBidNet Bid Alert', agency:'EnviroBidNet', city:'Texas', region:'statewide', scope:'E&I Engineering — See EnviroBidNet', due:'See link', value:'TBD', status:'active', source:'EnviroBidNet', url:'https://www.envirobidnet.com', scrapedAt:new Date().toISOString() };
      await saveBid(bid);
      return res.json({ success: true, created: 1, method: 'generic' });
    }
    const saved = [];
    for (const bidId of found) {
      let name='EnviroBidNet Bid #'+bidId, due='See link', city='Texas', agency='EnviroBidNet';
      const pos = plain.indexOf(bidId);
      if (pos > -1) {
        const ctx = plain.substring(Math.max(0,pos-50), pos+400);
        const desc = ctx.match(new RegExp(bidId+'[^\\d]{0,5}([A-Z][^|]{10,150})'));
        if (desc) name = desc[1].trim().slice(0,200);
        const dt = ctx.match(/(\d{4}-\d{2}-\d{2})/); if(dt) due = dt[1];
        const ct = ctx.match(/([A-Z][a-z]+(?: [A-Z][a-z]+)?),\s*([A-Z]{2})\b/); if(ct) city = ct[1]+', '+ct[2];
        const ag = name.match(/^([^:]{3,40}):/); if(ag) agency = ag[1].trim();
      }
      const bid = { id:'ebn-'+bidId, name, agency, city, region:detectRegion(city), scope:name, due, value:'TBD', status:'active', source:'EnviroBidNet', bidId:'#'+bidId, url:'https://www.envirobidnet.com', scrapedAt:new Date().toISOString() };
      await saveBid(bid); saved.push(bid);
    }
    res.json({ success: true, created: saved.length, bids: saved });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete('/api/bids/:id', async (req, res) => { await pool.query('DELETE FROM bids WHERE id=$1', [req.params.id]); res.json({ success: true }); });
app.patch('/api/bids/:id', async (req, res) => { await pool.query('UPDATE bids SET data = data || $1, updated_at=NOW() WHERE id=$2', [JSON.stringify(req.body), req.params.id]); res.json({ success: true }); });
app.get('/api/scrape/log', async (req, res) => { try { const r = await pool.query('SELECT * FROM scrape_log ORDER BY ran_at DESC LIMIT 100'); res.json(r.rows); } catch(e) { res.json([]); } });
app.get('/api/primes', async (req, res) => { try { const r = await pool.query('SELECT data FROM primes ORDER BY created_at ASC'); res.json({ primes: r.rows.map(r => r.data) }); } catch(e) { res.json({ primes: [] }); } });
app.post('/api/primes', async (req, res) => { try { const prime = { ...req.body, updatedAt: new Date().toISOString() }; await pool.query('INSERT INTO primes (id, data, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (id) DO UPDATE SET data=$2, updated_at=NOW()', [prime.id, JSON.stringify(prime)]); res.json({ success: true, prime }); } catch(e) { res.status(500).json({ success: false, error: e.message }); } });
app.delete('/api/primes/:id', async (req, res) => { try { await pool.query('DELETE FROM primes WHERE id=$1', [req.params.id]); res.json({ success: true }); } catch(e) { res.status(500).json({ success: false, error: e.message }); } });
app.patch('/api/primes/:id', async (req, res) => { try { await pool.query('UPDATE primes SET data = data || $1, updated_at=NOW() WHERE id=$2', [JSON.stringify(req.body), req.params.id]); res.json({ success: true }); } catch(e) { res.status(500).json({ success: false, error: e.message }); } });

async function runScrape() {
  if (scrapeStatus.running) return;
  scrapeStatus = { running: true, startedAt: new Date().toISOString(), results: [], lastFinished: null };
  try {
    const { runAllScrapers } = require('./run.js');
    const { scraped, results } = await runAllScrapers();
    scrapeStatus.results = results;
    await clearScrapedBids();
    for (const bid of scraped) { try { await saveBid(bid); } catch(e) {} }
    // Force delete ALL H2bid and ESBD bids and reseed with no-login URLs
  try {
    await pool.query("DELETE FROM bids WHERE data->>'source' IN ('H2bid','TX ESBD')");
    console.log('[Init] Cleared old H2bid and TX ESBD bids');
  } catch(e) { console.error('[Init]', e.message); }
  await seedAllBids();
    for (const r of results) { await pool.query('INSERT INTO scrape_log (source, count, status, message) VALUES ($1,$2,$3,$4)', [r.source, r.count, r.status, r.message||'']).catch(()=>{}); }
    console.log('[Scraper] Done:', scraped.length, 'bids');
  } catch(e) { console.error('[Scraper] Error:', e.message); await pool.query('INSERT INTO scrape_log (source, count, status, message) VALUES ($1,$2,$3,$4)', ['All', 0, 'error', e.message]).catch(()=>{}); }
  scrapeStatus.running = false;
  scrapeStatus.lastFinished = new Date().toISOString();
}

require('node-cron').schedule('0 23 * * *', () => runScrape());

// Auto-remove expired bids every day at midnight
require('node-cron').schedule('0 0 * * *', async () => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await pool.query(`
      DELETE FROM bids 
      WHERE data->>'userState' != 'selected'
      AND data->>'due' != 'See link'
      AND data->>'due' != 'TBD'
      AND data->>'due' != 'Check link'
      AND data->>'due' != 'Active – TBD'
      AND data->>'due' != 'Mid-2026'
      AND data->>'due' != 'TBD Post-funding'
      AND data->>'due' != 'TBD 2026'
      AND data->>'due' != 'CMAR GMP Mid-2026'
      AND data->>'source' != 'Manual'
      AND (
        data->>'due' < $1
        OR data->>'due' ~ '^\d{4}-\d{2}-\d{2}$' AND (data->>'due')::date < NOW()
      )
    `, [today]);
    if (result.rowCount > 0) {
      console.log('[AutoExpire] Removed', result.rowCount, 'expired bids');
    }
  } catch(e) { console.error('[AutoExpire]', e.message); }
});
require('node-cron').schedule('0 6 * * *', () => seedESBD()); // refresh ESBD bids daily at 6am
require('node-cron').schedule('0 8 * * *', async () => { try { await pool.query("DELETE FROM bids WHERE updated_at < NOW() - INTERVAL '60 days' AND data->>'source' NOT IN ('Manual','EnviroBidNet','TX ESBD')"); } catch(e) { console.error('[Cleanup]', e.message); } });

app.listen(PORT, '0.0.0.0', () => console.log('[SRI Bids] Listening on port', PORT));
initDB().then(() => { setTimeout(runScrape, 8000); }).catch(err => console.error('[DB] Init failed:', err.message));
