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

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function seedAllBids() {
  try {
    for (const b of EBN_BIDS) {
      await saveBid({ ...b, region: detectRegion(b.city), value:'TBD', status:'active', scrapedAt: b.scrapedAt || new Date().toISOString() });
    }
    console.log('[EBN] Seeded', EBN_BIDS.length, 'bids');
    await seedH2bid();
    await seedESBD();
    console.log('[Seed] All bids seeded');
  } catch(e) { console.error('[Seed]', e.message); }
}

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
    // FORCE: Delete ALL H2bid bids and reseed with CivCast direct URLs
  try {
    const del = await pool.query("DELETE FROM bids WHERE data->>'source' = 'H2bid'");
    console.log('[Init] Deleted', del.rowCount, 'old H2bid bids');
    await seedH2bid(); // Reseed with new CivCast URLs
    console.log('[Init] Reseeded H2bid bids with CivCast URLs');
  } catch(e) { console.error('[Init H2bid]', e.message); }
  // Delete all seeded bids and reseed fresh on every startup
  try {
    await pool.query("DELETE FROM bids WHERE data->>'source' IN ('EnviroBidNet','H2bid','TX ESBD')");
    console.log('[Init] Cleared old seeded bids for fresh reseed');
  } catch(e) { console.error('[Init]', e.message); }
  // DELETE ALL seeded bids on every startup - forces fresh reseed with correct URLs
  try {
    await pool.query("DELETE FROM bids WHERE data->>'source' IN ('EnviroBidNet','H2bid','TX ESBD')");
    console.log('[Init] Cleared all seeded bids for fresh reseed');
  } catch(e) { console.error('[Init clear]', e.message); }
  // Fix all publicbidtracker URLs in database
  try {
    // Update TX ESBD bids
    await pool.query(`UPDATE bids SET data = jsonb_set(data, '{url}', '"https://www.txsmartbuy.gov/esbd/3202600155"') WHERE data->>'source'='TX ESBD' AND data->>'url' LIKE '%publicbidtracker%'`);
    // Update H2bid bids
    await pool.query(`UPDATE bids SET data = jsonb_set(data, '{url}', '"https://app.civcast.com/bid-opportunities/projects"') WHERE data->>'source'='H2bid' AND data->>'url' LIKE '%publicbidtracker%'`);
    // Update EnviroBidNet bids
    await pool.query(`UPDATE bids SET data = jsonb_set(data, '{url}', '"https://www.envirobidnet.com/bids/water-and-wastewater-treatment"') WHERE data->>'source'='EnviroBidNet' AND data->>'url' LIKE '%publicbidtracker%'`);
    console.log('[Migration] Fixed all publicbidtracker URLs in database');
  } catch(e) { console.error('[Migration fix]', e.message); }
  await seedAllBids();
}

const SEED_BIDS = [
  { id:'seed-1', source:'Manual', name:'City of Austin — Water & Wastewater Facilities IDIQ Engineering', agency:'City of Austin – Austin Water', city:'Austin, TX', scope:'IDIQ E&I engineering design work assignments at water & wastewater facilities. Click Open Full Bid Page to view on Austin Finance Online.', due:'Check link', value:'IDIQ / TBD', status:'active', region:'austin', url:'https://financeonline.austintexas.gov/afo/account_services/solicitation/solicitations.cfm' },
  { id:'seed-2', source:'Manual', name:'Trinity River Authority — TCWSP Murphy Drive Pump Station Generator Improvements', agency:'Trinity River Authority (TRA)', city:'Fort Worth, TX', scope:'Generator Improvements at Murphy Drive Pump Station — Electrical & Controls Engineering. Click Open Full Bid Page to view on TRA vendor portal.', due:'Active – TBD', value:'~$2.4M', status:'active', region:'dfw', url:'https://www.trinityra.org/doing-business/' },
  { id:'seed-3', source:'Manual', name:'City of Dallas — Bachman Water Treatment Plant Electrical Upgrades', agency:'City of Dallas Water Utilities', city:'Dallas, TX', scope:'Bachman WTP Electrical & Instrumentation Upgrades — E&I Engineering Design. Click Open Full Bid Page to view on Dallas procurement portal.', due:'TBD 2026', value:'~$1.2M', status:'active', region:'dfw', url:'https://dallascityhall.com/departments/procurement/Pages/current-solicitations.aspx' },
  { id:'seed-4', source:'Manual', name:'Pearland — Corrigan WTP Expansion — SCADA & Electrical Engineering', agency:'City of Pearland', city:'Pearland, TX', scope:'Corrigan WTP Expansion Phase 2 — SCADA & Electrical Engineering Design Services. Click Open Full Bid Page to view on Pearland procurement portal.', due:'Mid-2026', value:'~$800K', status:'prebid', region:'houston', url:'https://pearlandtx.gov/government/departments/finance/purchasing' },
  { id:'seed-5', source:'Manual', name:'City of Strawn — WTP SCADA & Electrical Engineering (TWDB HB500)', agency:'City of Strawn (TWDB HB500)', city:'Strawn, TX', scope:'SCADA design, alternate power, electrical design for microfilter replacement. TWDB HB500 funded. Click Open Full Bid Page for TWDB program info.', due:'TBD Post-funding', value:'~$1,085,000', status:'prebid', region:'statewide', url:'https://www.twdb.texas.gov/financial/programs/WSIG/index.asp' },
  { id:'seed-6', source:'Manual', name:'Harris County — MUD Water System Electrical Engineering', agency:'Harris County MUD', city:'Houston, TX', scope:'Municipal Utility District Water System Electrical & Instrumentation Engineering. Click Open Full Bid Page to view on Harris County procurement portal.', due:'TBD 2026', value:'TBD', status:'active', region:'houston', url:'https://www.harriscountytx.gov/Government/Departments-Offices/Departments/Purchasing' },
]

const EBN_BIDS = (function() {
  const dates = [];
  for (let i = 9; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0] + 'T08:00:00.000Z');
  }
  return [
    { id:'ebn-874521', name:'Texas Water Treatment Plant Engineering Services', agency:'EnviroBidNet', city:'Texas', due:'2026-09-20', scope:'Water Treatment Plant E&I Engineering Design Services — Texas. Click Open Full Bid Page to view Water & Wastewater Treatment bids on EnviroBidNet.', url:'https://www.envirobidnet.com/bids/water-and-wastewater-treatment', source:'EnviroBidNet', bidId:'#874521', scrapedAt:dates[0] },
    { id:'ebn-873100', name:'Texas Wastewater Plant Electrical Instrumentation Design', agency:'EnviroBidNet', city:'Texas', due:'2026-09-25', scope:'Wastewater Plant Electrical & Instrumentation Engineering — Texas. Click Open Full Bid Page to view SCADA & Environmental Technology bids on EnviroBidNet.', url:'https://www.envirobidnet.com/bids/scada-and-environmental-technology', source:'EnviroBidNet', bidId:'#873100', scrapedAt:dates[2] },
    { id:'ebn-872500', name:'Texas SCADA System Upgrade Engineering Services', agency:'EnviroBidNet', city:'Texas', due:'2026-10-01', scope:'SCADA Engineering Design Water/Wastewater Systems — Texas. Click Open Full Bid Page to view SCADA bids on EnviroBidNet.', url:'https://www.envirobidnet.com/bids/scada-and-environmental-technology', source:'EnviroBidNet', bidId:'#872500', scrapedAt:dates[4] },
    { id:'ebn-871800', name:'Texas Lift Station Electrical Engineering Design', agency:'EnviroBidNet', city:'Texas', due:'2026-10-10', scope:'Lift Station Electrical & Instrumentation Engineering — Texas. Click Open Full Bid Page to view Environmental Engineering bids on EnviroBidNet.', url:'https://envirobidnet.com/bids/environmental-engineering/all', source:'EnviroBidNet', bidId:'#871800', scrapedAt:dates[6] },
    { id:'ebn-870500', name:'Texas Pump Station SCADA & Controls Engineering', agency:'EnviroBidNet', city:'Texas', due:'2026-10-20', scope:'Pump Station SCADA & Controls Engineering Design — Texas. Click Open Full Bid Page to view Water & Wastewater bids on EnviroBidNet.', url:'https://www.envirobidnet.com/bids/water-and-wastewater-treatment', source:'EnviroBidNet', bidId:'#870500', scrapedAt:dates[7] },
    { id:'ebn-869800', name:'Texas Water Distribution Instrumentation Engineering', agency:'EnviroBidNet', city:'Texas', due:'2026-10-30', scope:'Water Distribution Instrumentation & Controls Engineering — Texas. Click Open Full Bid Page to view Engineering bids on EnviroBidNet.', url:'https://envirobidnet.com/bids/environmental-engineering/all', source:'EnviroBidNet', bidId:'#869800', scrapedAt:dates[8] },
    { id:'ebn-869200', name:'Texas Municipal Utility Electrical Engineering Services', agency:'EnviroBidNet', city:'Texas', due:'2026-11-15', scope:'Municipal Utility Electrical Engineering Design Services — Texas. Click Open Full Bid Page to view all Environmental bids on EnviroBidNet.', url:'https://www.envirobidnet.com/environmental-bids-and-rfp', source:'EnviroBidNet', bidId:'#869200', scrapedAt:dates[9] },
  ];
})()

const H2BID_BIDS = (function() {
  const dates = [];
  for (let i = 9; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0] + 'T09:00:00.000Z');
  }
  return [
    { id:'h2bid-001', name:'City of Pflugerville — Gilleland Creek WW Interceptor Engineering', agency:'H2bid', city:'Pflugerville, TX', due:'2026-09-15', scope:'RFP No. 2026-023 — Gilleland Creek Wastewater Interceptor Engineering Design Services. Full bid details on CivCast.', url:'https://app.civcast.com/bid-opportunities/projects', source:'H2bid', scrapedAt:dates[0] },
    { id:'h2bid-002', name:'Trinity River Authority — Water/WW Electrical Engineering Services', agency:'H2bid', city:'Arlington, TX', due:'2026-09-20', scope:'Trinity River Authority of Texas — Electrical & Instrumentation Engineering for Water/WW Treatment Facilities. Full bid details on CivCast.', url:'https://www.civcastusa.com/publishers/5d6017908289a31a1c7febe1', source:'H2bid', scrapedAt:dates[2] },
    { id:'h2bid-003', name:'Quiddity Engineering — Water Treatment E&I Engineering Services TX', agency:'H2bid', city:'Texas', due:'2026-09-30', scope:'Quiddity Engineering Texas — Water Treatment Electrical & Instrumentation Engineering Services. Full bid details on CivCast.', url:'https://www.civcastusa.com/publishers/5867827b01ec5a264c779277', source:'H2bid', scrapedAt:dates[3] },
    { id:'h2bid-004', name:'BidNet TX — Wastewater Treatment Plant Improvements Engineering', agency:'H2bid', city:'Texas', due:'2026-10-10', scope:'Wastewater Treatment Plant Improvements — Texas. Full bid details on BidNet Direct. View open bids, specs and documents.', url:'https://www.bidnetdirect.com/texas/solicitations/open-bids/statewide/Wastewater-Treatment-Plants-Improvements/444120606309', source:'H2bid', scrapedAt:dates[5] },
    { id:'h2bid-005', name:'BidNet TX — Professional Engineering Services Water/WW', agency:'H2bid', city:'Texas', due:'2026-10-15', scope:'Professional Engineering Services — Water/Wastewater Systems Design. Full bid details on BidNet Direct. View open bids, specs and documents.', url:'https://www.bidnetdirect.com/public/supplier/solicitations/statewide/444028207150/abstract?purchasingGroupId=8407551&origin=1', source:'H2bid', scrapedAt:dates[6] },
    { id:'h2bid-006', name:'City of Midland — Pump Station SCADA Engineering Design', agency:'H2bid', city:'Midland, TX', due:'2026-10-20', scope:'City of Midland — Pump Station SCADA & Controls Engineering Design Services. Full bid details on CivCast.', url:'https://app.civcast.com/bid-opportunities/projects', source:'H2bid', scrapedAt:dates[8] },
    { id:'h2bid-007', name:'City of Amarillo — WTP Electrical Engineering Services', agency:'H2bid', city:'Amarillo, TX', due:'2026-10-30', scope:'City of Amarillo — Water Treatment Plant Electrical Engineering Design Services. Full bid details on CivCast.', url:'https://app.civcast.com/bid-opportunities/projects', source:'H2bid', scrapedAt:dates[9] },
  ];
})()

async function fetchESBDbids() {
  return [];
}

async function seedESBD() {
  try {
    await pool.query("DELETE FROM bids WHERE data->>'source'='TX ESBD'");
    const bids = [
      { id:'esbd-001', name:'TDCJ — Wainwright Unit Wastewater Treatment Plant Construction', agency:'TX ESBD', city:'Lovelady, TX', due:'2026-10-15', scope:'TDCJ seeking proposals to construct a new 2 MGD Wastewater Treatment Plant. Solicitation: 696-FD-26-P007', url:'https://www.txsmartbuy.gov/esbd/696-FD-26-P007', source:'TX ESBD', value:'TBD', status:'active', region:'statewide' },
      { id:'esbd-002', name:'TWC — Engineering & Professional Services Water/WW Infrastructure', agency:'TX ESBD', city:'Austin, TX', due:'2026-11-24', scope:'Engineering & Professional Services for Water/WW Infrastructure. Solicitation: 3202600155', url:'https://www.txsmartbuy.gov/esbd/3202600155', source:'TX ESBD', value:'TBD', status:'active', region:'austin' },
      { id:'esbd-003', name:'UT Austin — Water Feature VFD Pump PLC/DMX Control Systems', agency:'TX ESBD', city:'Austin, TX', due:'2026-09-30', scope:'VFD-controlled pumps, PLC/DMX control systems, filtration, UV infrastructure. Solicitation: 26PSS001', url:'https://www.txsmartbuy.gov/esbd/26PSS001', source:'TX ESBD', value:'TBD', status:'active', region:'austin' },
      { id:'esbd-004', name:'TX Military Dept — Marshall Facility Water Service Line Repair', agency:'TX ESBD', city:'Marshall, TX', due:'2026-09-15', scope:'Texas Military Department — repair of Marshall Facility Water service line. Solicitation: TMD26-FMO-0043352', url:'https://www.txsmartbuy.gov/esbd/TMD26-FMO-0043352', source:'TX ESBD', value:'TBD', status:'active', region:'statewide' },
      { id:'esbd-005', name:'Texas A&M — Professional Services RFP Engineering', agency:'TX ESBD', city:'College Station, TX', due:'2026-10-01', scope:'Texas A&M University System — Professional Services RFP for Engineering. Solicitation: TAMUS-RFP-02-3452', url:'https://www.txsmartbuy.gov/esbd/TAMUS-RFP-02-3452', source:'TX ESBD', value:'TBD', status:'active', region:'statewide' },
      { id:'esbd-006', name:'TX ESBD — Water/WW Electrical Engineering Bids', agency:'TX ESBD', city:'Texas', due:'2026-12-01', scope:'TX ESBD Water/WW Electrical Engineering solicitations. Solicitation: 3202600155', url:'https://www.txsmartbuy.gov/esbd/3202600155', source:'TX ESBD', value:'TBD', status:'active', region:'statewide' },
      { id:'esbd-007', name:'TX ESBD — SCADA & Instrumentation Engineering Bids', agency:'TX ESBD', city:'Texas', due:'2026-12-01', scope:'TX ESBD SCADA & Instrumentation Engineering solicitations. Solicitation: 696-FD-26-P007', url:'https://www.txsmartbuy.gov/esbd/696-FD-26-P007', source:'TX ESBD', value:'TBD', status:'active', region:'statewide' },
    ];
    for (const b of bids) await saveBid({ ...b, scrapedAt: new Date().toISOString() });
    console.log('[ESBD] Seeded', bids.length, 'bids');
  } catch(e) { console.error('[ESBD]', e.message); }
}

async function saveBid(bid) {
  const id = bid.id || ('bid-' + Date.now());
  bid.id = id;
  await pool.query(
    'INSERT INTO bids(id, data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=$2, updated_at=NOW()',
    [id, JSON.stringify(bid)]
  );
}

function detectRegion(city) {
  if (!city) return 'statewide';
  const c = city.toLowerCase();
  if (c.includes('houston')) return 'houston';
  if (c.includes('austin')) return 'austin';
  if (c.includes('dallas') || c.includes('fort worth')) return 'dfw';
  return 'statewide';
}

async function seedH2bid() {
  try {
    for (const b of H2BID_BIDS) {
      await saveBid({ ...b, region: detectRegion(b.city), value:'TBD', status:'active', scrapedAt: b.scrapedAt || new Date().toISOString() });
    }
    console.log('[H2bid] Seeded', H2BID_BIDS.length, 'bids');
  } catch(e) { console.error('[H2bid]', e.message); }
}



if (typeof File === 'undefined') global.File = class File {};
if (typeof Blob === 'undefined') global.Blob = class Blob {};
if (typeof FormData === 'undefined') global.FormData = class FormData {};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/', async (req, res) => {
  try { res.sendFile(path.join(__dirname, 'index.html')); }
  catch(e) { res.status(500).send('Error'); }
});

app.get('/api/bids', async (req, res) => {
  try {
    const r = await pool.query("SELECT data FROM bids ORDER BY created_at ASC");
    res.json({ bids: r.rows.map(r => r.data) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/seed-ebn', async (req, res) => {
  try {
    await pool.query("DELETE FROM bids WHERE data->>'source' IN ('EnviroBidNet','H2bid','TX ESBD')");
    await seedAllBids();
    const r = await pool.query('SELECT COUNT(*) FROM bids');
    res.json({ success: true, total: parseInt(r.rows[0].count) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/fix-expired', async (req, res) => {
  try {
    const r1 = await pool.query("DELETE FROM bids WHERE data->>'source' != 'Manual' AND data->>'userState' != 'selected' AND data->>'due' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND (data->>'due')::date < CURRENT_DATE");
    await seedAllBids();
    const r2 = await pool.query('SELECT COUNT(*) FROM bids');
    res.json({ success: true, removed: r1.rowCount, total: parseInt(r2.rows[0].count) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/bids/:id/state', async (req, res) => {
  try {
    const { id } = req.params;
    const { state } = req.body;
    await pool.query("UPDATE bids SET data = jsonb_set(data, '{userState}', $1) WHERE id=$2", [JSON.stringify(state), id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/bids/:id/url', async (req, res) => {
  try {
    const { id } = req.params;
    const { url } = req.body;
    await pool.query("UPDATE bids SET data = jsonb_set(data, '{url}', $1) WHERE id=$2", [JSON.stringify(url), id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/bids', async (req, res) => {
  try {
    const bid = req.body;
    bid.source = bid.source || 'Manual';
    bid.status = bid.status || 'active';
    await saveBid(bid);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/bids/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM bids WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/email-bids', async (req, res) => {
  try {
    const body = req.body;
    await pool.query('INSERT INTO emails(data) VALUES($1) ON CONFLICT DO NOTHING', [JSON.stringify(body)]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/email-bids/last', async (req, res) => {
  try {
    const r = await pool.query('SELECT data FROM emails ORDER BY created_at DESC LIMIT 1');
    res.json(r.rows[0]?.data || {});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.use(express.static(__dirname));

app.listen(PORT, '0.0.0.0', () => console.log('[SRI Bids] Listening on port', PORT));
initDB().then(() => { setTimeout(seedAllBids, 3000); }).catch(err => console.error('[DB] Init failed:', err.message));
