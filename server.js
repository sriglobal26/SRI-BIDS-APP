if (typeof File === 'undefined') global.File = class File {};
if (typeof Blob === 'undefined') global.Blob = class Blob {};
if (typeof FormData === 'undefined') global.FormData = class FormData {};

const express = require('express');
const { Pool } = require('pg');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

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
  // Always delete seeded bids and reseed fresh on every startup
  await pool.query("DELETE FROM bids WHERE data->>'source' IN ('EnviroBidNet','H2bid','TX ESBD')");
  {
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
    { id:'ebn-881931', name:'CLCWA — Water Plant No. 1 Recoating', agency:'EnviroBidNet', city:'Texas', due:'2026-08-25', scope:'CLCWA Water Plant No. 1 Recoating — Water Treatment Plant Maintenance Engineering Services.', url:'https://envirobidnet.com/subscriber_view_bid/881931', source:'EnviroBidNet', bidId:'#881931', scrapedAt:dates[0] },
    { id:'ebn-881932', name:'HCMUD No. 406 — Lift Station No. 1 Rehabilitation', agency:'EnviroBidNet', city:'Houston, TX', due:'2026-09-01', scope:'HCMUD No. 406 Lift Station No. 1 Rehabilitation — cleaning, abrasive blasting and rehabilitation of lift station components. Harris County MUD.', url:'https://envirobidnet.com/subscriber_view_bid/881932', source:'EnviroBidNet', bidId:'#881932', scrapedAt:dates[1] },
    { id:'ebn-881778', name:'La Marque — RFQ Third-Party Building Plan Review & Inspection Services', agency:'EnviroBidNet', city:'La Marque, TX', due:'2026-09-07', scope:'City of La Marque RFQ for Third-Party Building Plan Review and Inspection Services.', url:'https://envirobidnet.com/subscriber_view_bid/881778', source:'EnviroBidNet', bidId:'#881778', scrapedAt:dates[3] },
    { id:'ebn-881930', name:'Texas A&M — RFQ A/E Ballistic Aero-Optics & Materials Range Phase 2', agency:'EnviroBidNet', city:'College Station, TX', due:'2026-09-01', scope:'Texas A&M University System RFQ for Architectural/Engineering services for the Ballistic Aero-Optics and Materials Range Phase 2 Project.', url:'https://envirobidnet.com/subscriber_view_bid/881930', source:'EnviroBidNet', bidId:'#881930', scrapedAt:dates[4] },
    { id:'ebn-881890', name:'Northwest ISD — CM at Risk for NISD Steele ECHS Renovation & Addition', agency:'EnviroBidNet', city:'Texas', due:'2026-09-03', scope:'Northwest ISD Construction Manager at Risk for NISD Steele Early College High School Renovation & Addition project.', url:'https://envirobidnet.com/subscriber_view_bid/881890', source:'EnviroBidNet', bidId:'#881890', scrapedAt:dates[6] },
    { id:'ebn-881891', name:'Pinehurst — RFQ Administration/Professional & Engineering Services', agency:'EnviroBidNet', city:'Pinehurst, TX', due:'2026-08-25', scope:'City of Pinehurst RFQ Administration/Professional Services and Engineering Services. Mitigation Reallocation Program application support.', url:'https://envirobidnet.com/subscriber_view_bid/881891', source:'EnviroBidNet', bidId:'#881891', scrapedAt:dates[8] },
    { id:'ebn-881877', name:'HHSC — Lead Sample Analysis Services for Dept of Health Services', agency:'EnviroBidNet', city:'Austin, TX', due:'2026-08-21', scope:'Texas Health & Human Services Commission — Lead Sample Analysis Services for the Department of State Health Services. Austin, TX.', url:'https://envirobidnet.com/subscriber_view_bid/881877', source:'EnviroBidNet', bidId:'#881877', scrapedAt:dates[9] },
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
    { id:'h2bid-001', name:'City of Houston — WW Collection System Rehabilitation & Renewal (CB-2026-0048)', agency:'H2bid', city:'Houston, TX', due:'2026-09-15', scope:'On-call rehabilitation and renewal of wastewater collection system. Point repairs, sewer replacement, CIPP, manholes, pavement. Est. $4,300,000. City of Houston CB-2026-0048.', url:'https://www.beaconbid.com/solicitations/city-of-houston/085f5cae-deb4-4ccd-aae0-d070ae461214/wastewater-collection-system-rehabilitation-and-renewal', source:'H2bid', scrapedAt:dates[0] },
    { id:'h2bid-002', name:'City of Houston — WW Collection System Rehabilitation of Manholes (CB-2026-0030)', agency:'H2bid', city:'Houston, TX', due:'2026-09-20', scope:'Rehabilitation of existing manholes using cementitious liners, CIPP liners, polymeric coatings. Point repairs to sewer mains at manhole connections. City of Houston CB-2026-0030.', url:'https://www.beaconbid.com/solicitations/city-of-houston/9f2e4bf2-7d31-4ec1-943c-10f0eeec95d0/wastewater-collection-system-rehabilitation-and-renewal-of-manholes', source:'H2bid', scrapedAt:dates[2] },
    { id:'h2bid-003', name:'City of Houston — Rehabilitation of Water Storage Tanks Package 16 (CB-2026-0052)', agency:'H2bid', city:'Houston, TX', due:'2026-08-20', scope:'Rehabilitation of water storage tanks at four sites. Structural repairs, protective coating upgrades, equipment replacements, safety improvements. City of Houston CB-2026-0052.', url:'https://www.beaconbid.com/solicitations/city-of-houston', source:'H2bid', scrapedAt:dates[3] },
    { id:'h2bid-004', name:'City of Houston — Lift Station Renewal & Rehabilitation CB-2026-0026', agency:'H2bid', city:'Houston, TX', due:'2026-10-01', scope:'Lift Station Renewal and Rehabilitation — Green Dolphin, Sherwood Oaks, West subdivisions. City of Houston Houston Public Works CB-2026-0026.', url:'https://www.beaconbid.com/solicitations/city-of-houston', source:'H2bid', scrapedAt:dates[5] },
    { id:'h2bid-005', name:'City of Houston — Sims North WWTP Improvements Package 3 (CB-2026-0022)', agency:'H2bid', city:'Houston, TX', due:'2026-10-10', scope:'Sims North Wastewater Treatment Plant Improvements Package 3. City of Houston Houston Public Works CB-2026-0022.', url:'https://www.beaconbid.com/solicitations/city-of-houston', source:'H2bid', scrapedAt:dates[6] },
    { id:'h2bid-006', name:'City of Houston — WW Process Unit Cleaning & Evaluation (CB-2026-0029)', agency:'H2bid', city:'Houston, TX', due:'2026-10-20', scope:'Wastewater Process Unit Cleaning and Evaluation. City of Houston Houston Public Works CB-2026-0029.', url:'https://www.beaconbid.com/solicitations/city-of-houston', source:'H2bid', scrapedAt:dates[8] },
    { id:'h2bid-007', name:'City of Houston — WW Collection System Rehabilitation & Renewal (CB-2026-0024)', agency:'H2bid', city:'Houston, TX', due:'2026-10-30', scope:'Wastewater Collection System Rehabilitation and Renewal Project. City of Houston CB-2026-0024. Houston Public Works.', url:'https://www.beaconbid.com/solicitations/city-of-houston', source:'H2bid', scrapedAt:dates[9] },
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

app.use(express.static(__dirname));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/bids', async (req, res) => {
  try {
    const r = await pool.query("SELECT data FROM bids ORDER BY created_at ASC");
    res.json({ bids: r.rows.map(r => r.data) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/seed-ebn', async (req, res) => {
  try {
    // Force delete ALL seeded bids to ensure fresh correct URLs
    await pool.query("DELETE FROM bids WHERE data->>'source' IN ('EnviroBidNet','H2bid','TX ESBD')");
    // Also update any remaining civcast URLs
    await pool.query("UPDATE bids SET data = jsonb_set(data, '{url}', to_jsonb(REPLACE(data->>'url', 'civcastusa.com', 'govcb.com'))) WHERE data->>'source'='H2bid' AND data->>'url' LIKE '%civcastusa%'");
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


app.listen(PORT, '0.0.0.0', () => console.log('[SRI Bids] Listening on port', PORT));
initDB().then(() => { setTimeout(seedAllBids, 3000); }).catch(err => console.error('[DB] Init failed:', err.message));
