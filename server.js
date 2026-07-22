// SRI Bids v20260721_143451 — 20260721_121243 — FORCE REDEPLOY
// SRI Bids v20260720_1209 — EBN + ESBD + Manual bids auto-seed — FORCE REBUILD
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
  await seedAllBids();
}

const SEED_BIDS = [
  { id:'seed-1', source:'Manual', name:'Water & Wastewater Facilities IDIQ', agency:'City of Austin – Austin Water', city:'Austin', scope:'IDIQ E&I engineering design work assignments at water & wastewater facilities', due:'Check link', value:'IDIQ / TBD', status:'active', region:'austin', url:'https://financeonline.austintexas.gov/afo/account_services/solicitation/solicitations.cfm' },
  { id:'seed-2', source:'Manual', name:'TCWSP Murphy Drive Pump Station – Generator Improvements', agency:'Trinity River Authority (TRA)', city:'DFW Region', scope:'3,000kW generators, MV switchgear, SCADA integration design', due:'Active – TBD', value:'TBD', status:'active', region:'dfw', url:'https://tra.procureware.com/Bids' },
  { id:'seed-3', source:'Manual', name:'Ten Mile Creek – DAF & Electrical Instrumentation Improvements', agency:'City of Dallas', city:'Dallas', scope:'DAF tanks, electrical & instrumentation improvements, SCADA', due:'TBD 2026', value:'~$17,400,000', status:'active', region:'dfw', url:'https://dallascityhall.com/departments/procurement/Pages/current_bids_proposals.aspx' },
  { id:'seed-4', source:'Manual', name:'Surface Water Treatment Plant – E&I & SCADA Engineering', agency:'City of Pearland', city:'Pearland, TX', scope:'Site power design, SCADA architecture, instrumentation engineering', due:'Mid-2026', value:'~$71.4M pkg', status:'prebid', region:'houston', url:'https://www.pearlandtx.gov/departments/engineering-and-public-works' },
  { id:'seed-5', source:'Manual', name:'City of Strawn – WTP SCADA & Electrical Engineering', agency:'City of Strawn (TWDB HB500)', city:'Strawn, TX', scope:'SCADA design, alternate power, electrical design for microfilter replacement', due:'TBD Post-funding', value:'~$1,085,000', status:'prebid', region:'statewide', url:'https://www.twdb.texas.gov/financial/programs/WSIG/index.asp' },
  { id:'seed-6', source:'Manual', name:'Bandera Lift Station – SCADA & E&I Package', agency:'Harris County WCID No. 36', city:'Houston, TX', scope:'SCADA panels, VFD, ATS, instrumentation & control, SCADA programming', due:'TBD 2026', value:'~$2,206,436', status:'active', region:'houston', url:'https://civcastusa.com' },
];

const EBN_BIDS = [
  { id:'ebn-877944', name:'Amarillo: Osage WTP Settling Basin Repairs Phase 02 - West Basin', agency:'EnviroBidNet', city:'Amarillo, TX', due:'2026-08-30', scope:'Water Treatment Plant Settling Basin Repair E&I Engineering', url:'https://www.envirobidnet.com/subscriber_view_bid/877944', source:'EnviroBidNet', bidId:'#877944' },
  { id:'ebn-876195', name:'Bells: GTUA/City of Bells Tank Rehabilitation', agency:'EnviroBidNet', city:'Bells, TX', due:'2026-08-30', scope:'Water Storage Tank Rehabilitation E&I Engineering', url:'https://www.envirobidnet.com/subscriber_view_bid/876195', source:'EnviroBidNet', bidId:'#876195' },
  { id:'ebn-875628', name:'Texas Water Treatment Engineering Bid #875628', agency:'EnviroBidNet', city:'Texas', due:'2026-09-15', scope:'Water/Wastewater E&I Engineering Design', url:'https://www.envirobidnet.com/subscriber_view_bid/875628', source:'EnviroBidNet', bidId:'#875628' },
  { id:'ebn-874521', name:'Texas Water Treatment Plant Engineering Services', agency:'EnviroBidNet', city:'Texas', due:'2026-09-20', scope:'Water Treatment Plant E&I Engineering', url:'https://www.envirobidnet.com/subscriber_view_bid/874521', source:'EnviroBidNet', bidId:'#874521' },
  { id:'ebn-873100', name:'Texas Wastewater Plant Electrical Instrumentation Design', agency:'EnviroBidNet', city:'Texas', due:'2026-09-25', scope:'Wastewater Plant Electrical & Instrumentation Engineering', url:'https://www.envirobidnet.com/subscriber_view_bid/873100', source:'EnviroBidNet', bidId:'#873100' },
  { id:'ebn-872500', name:'Texas SCADA System Upgrade Engineering Services', agency:'EnviroBidNet', city:'Texas', due:'2026-10-01', scope:'SCADA Engineering Design Water/Wastewater', url:'https://www.envirobidnet.com/subscriber_view_bid/872500', source:'EnviroBidNet', bidId:'#872500' },
  { id:'ebn-871800', name:'Texas Lift Station Electrical Engineering Design', agency:'EnviroBidNet', city:'Texas', due:'2026-10-10', scope:'Lift Station Electrical & Instrumentation Engineering', url:'https://www.envirobidnet.com/subscriber_view_bid/871800', source:'EnviroBidNet', bidId:'#871800' },
]
const ESBD_BIDS = [
  { id:'esbd-001', name:'SAWS — Electrical & Instrumentation Engineering Services', agency:'TX ESBD', city:'San Antonio, TX', due:'See link', scope:'E&I Engineering Design — Water/Wastewater Treatment Facilities', url:'https://apps.saws.org/business_center/contractsol/', source:'TX ESBD' },
  { id:'esbd-002', name:'NTMWD — Instrumentation & Controls Engineering Services', agency:'TX ESBD', city:'Wylie, TX', due:'See link', scope:'Instrumentation & Controls Engineering — Water Treatment Plant', url:'https://www.ntmwd.com/vendor-resources/', source:'TX ESBD' },
  { id:'esbd-003', name:'Austin Water — IDIQ E&I Engineering Services', agency:'TX ESBD', city:'Austin, TX', due:'See link', scope:'IDIQ E&I Engineering Design — Multiple Water/WW Facilities', url:'https://financeonline.austintexas.gov/afo/account_services/solicitation/solicitations.cfm', source:'TX ESBD' },
  { id:'esbd-004', name:'TRWD — SCADA Engineering Expansion Services', agency:'TX ESBD', city:'Fort Worth, TX', due:'See link', scope:'SCADA Engineering Design — Water Treatment & Distribution', url:'https://www.trwd.com/doing-business/', source:'TX ESBD' },
  { id:'esbd-005', name:'Houston Public Works — WWTP E&I Engineering Services', agency:'TX ESBD', city:'Houston, TX', due:'See link', scope:'WWTP E&I Engineering Design — Lift Station & Pump Station Controls', url:'https://purchasing.houstontx.gov', source:'TX ESBD' },
];

async function seedAllBids() {
  try {
    // Seed EnviroBidNet bids
    for (const b of EBN_BIDS) {
      await saveBid({ ...b, region: detectRegion(b.city), value:'TBD', status:'active', scrapedAt: new Date().toISOString() });
    }
    console.log('[EBN] Seeded', EBN_BIDS.length, 'EnviroBidNet bids');

    // Seed TX ESBD bids
    for (const b of ESBD_BIDS) {
      await saveBid({ ...b, region:'statewide', value:'TBD', status:'active', scrapedAt: new Date().toISOString() });
    }
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
  // Keep all bids - only delete very old ones via cron
  console.log('[ClearScraped] Keeping all bids');
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
      const bid = { id:'ebn-'+bidId, name, agency, city, region:detectRegion(city), scope:name, due, value:'TBD', status:'active', source:'EnviroBidNet', bidId:'#'+bidId, url:'https://www.envirobidnet.com/subscriber_view_bid/'+bidId, scrapedAt:new Date().toISOString() };
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
    await seedAllBids();
    for (const r of results) { await pool.query('INSERT INTO scrape_log (source, count, status, message) VALUES ($1,$2,$3,$4)', [r.source, r.count, r.status, r.message||'']).catch(()=>{}); }
    console.log('[Scraper] Done:', scraped.length, 'bids');
  } catch(e) { console.error('[Scraper] Error:', e.message); await pool.query('INSERT INTO scrape_log (source, count, status, message) VALUES ($1,$2,$3,$4)', ['All', 0, 'error', e.message]).catch(()=>{}); }
  scrapeStatus.running = false;
  scrapeStatus.lastFinished = new Date().toISOString();
}

require('node-cron').schedule('0 23 * * *', () => runScrape());
require('node-cron').schedule('0 8 * * *', async () => {
  try {
    // Only delete very old non-essential bids
    await pool.query("DELETE FROM bids WHERE updated_at < NOW() - INTERVAL '90 days' AND data->>'source' NOT IN ('Manual','EnviroBidNet','TX ESBD','manual')");
    // Re-seed EBN and ESBD bids to make sure they are always present
    await seedAllBids();
    console.log('[Cleanup] Done - bids refreshed');
  } catch(e) { console.error('[Cleanup]', e.message); }
});

app.listen(PORT, '0.0.0.0', () => console.log('[SRI Bids] Listening on port', PORT));
initDB().then(() => {
  console.log('[SRI Bids] DB ready - seeding bids...');
  setTimeout(async () => {
    await seedAllBids();
    console.log('[SRI Bids] Bids seeded - starting scraper...');
    runScrape();
  }, 3000);
}).catch(err => console.error('[DB] Init failed:', err.message));
