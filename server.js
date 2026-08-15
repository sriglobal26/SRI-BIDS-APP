// SRI Global Bids App — server.js
'use strict';
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000, max: 10 });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// ─── BID ARRAYS ────────────────────────────────────────────────

const EBN_BIDS = [
  { id:'ebn-881931', name:'CLCWA — Water Plant No. 1 Recoating', agency:'EnviroBidNet', city:'Texas', due:'2026-08-25', posted:'2026-08-09', scope:'CLCWA Water Plant No. 1 Recoating — Water Treatment Plant Maintenance Engineering Services. Contact: Adrian Bustios, 713-821-0332. Zip: 77058.', url:'https://envirobidnet.com/subscriber_view_bid/881931', source:'EnviroBidNet', bidId:'#881931' },
  { id:'ebn-881932', name:'HCMUD No. 406 — Lift Station No. 1 Rehabilitation', agency:'EnviroBidNet', city:'Houston, TX', due:'2026-09-01', posted:'2026-08-01', scope:'HCMUD No. 406 Lift Station No. 1 Rehabilitation — cleaning, abrasive blasting and rehabilitation of lift station components.', url:'https://envirobidnet.com/subscriber_view_bid/881932', source:'EnviroBidNet', bidId:'#881932' },
  { id:'ebn-881778', name:'La Marque — RFQ Third-Party Building Plan Review & Inspection', agency:'EnviroBidNet', city:'La Marque, TX', due:'2026-09-07', posted:'2026-08-07', scope:'City of La Marque RFQ for Third-Party Building Plan Review and Inspection Services.', url:'https://envirobidnet.com/subscriber_view_bid/881778', source:'EnviroBidNet', bidId:'#881778' },
  { id:'ebn-881930', name:'Texas A&M — RFQ A/E Ballistic Aero-Optics Phase 2', agency:'EnviroBidNet', city:'College Station, TX', due:'2026-09-01', posted:'2026-08-01', scope:'Texas A&M University System RFQ for A/E services for the Ballistic Aero-Optics and Materials Range Phase 2 Project.', url:'https://envirobidnet.com/subscriber_view_bid/881930', source:'EnviroBidNet', bidId:'#881930' },
  { id:'ebn-881890', name:'Northwest ISD — CM at Risk NISD Steele ECHS Renovation', agency:'EnviroBidNet', city:'Texas', due:'2026-09-03', posted:'2026-08-04', scope:'Northwest ISD Construction Manager at Risk for NISD Steele Early College High School Renovation & Addition.', url:'https://envirobidnet.com/subscriber_view_bid/881890', source:'EnviroBidNet', bidId:'#881890' },
  { id:'ebn-881891', name:'Pinehurst — RFQ Administration/Professional & Engineering Services', agency:'EnviroBidNet', city:'Pinehurst, TX', due:'2026-08-25', posted:'2026-08-05', scope:'City of Pinehurst RFQ for Administration/Professional Services and Engineering Services. Mitigation Reallocation Program.', url:'https://envirobidnet.com/subscriber_view_bid/881891', source:'EnviroBidNet', bidId:'#881891' },
  { id:'ebn-881877', name:'HHSC — Lead Sample Analysis Services Dept of Health Services', agency:'EnviroBidNet', city:'Austin, TX', due:'2026-09-21', posted:'2026-08-01', scope:'Texas Health & Human Services Commission — Lead Sample Analysis Services for the Department of State Health Services.', url:'https://envirobidnet.com/subscriber_view_bid/881877', source:'EnviroBidNet', bidId:'#881877' },
];

const H2BID_BIDS = [
  { id:'h2bid-001', name:'City of Houston — WW Collection System Rehab & Renewal CB-2026-0048', agency:'H2bid', city:'Houston, TX', due:'2026-09-15', scope:'On-call rehab and renewal of wastewater collection system. Point repairs, sewer replacement, CIPP, manholes. Est. $4.3M.', url:'https://www.beaconbid.com/solicitations/city-of-houston/085f5cae-deb4-4ccd-aae0-d070ae461214/wastewater-collection-system-rehabilitation-and-renewal', source:'H2bid' },
  { id:'h2bid-002', name:'City of Houston — WW Collection System Rehab Manholes CB-2026-0030', agency:'H2bid', city:'Houston, TX', due:'2026-09-20', scope:'Rehab of existing manholes using cementitious liners, CIPP liners, polymeric coatings. Point repairs to sewer mains.', url:'https://www.beaconbid.com/solicitations/city-of-houston/9f2e4bf2-7d31-4ec1-943c-10f0eeec95d0/wastewater-collection-system-rehabilitation-and-renewal-of-manholes', source:'H2bid' },
  { id:'h2bid-003', name:'City of Houston — Sims North WWTP Improvements Package 3', agency:'H2bid', city:'Houston, TX', due:'2026-09-25', scope:'Comprehensive mechanical and structural improvements at Sims North Wastewater Treatment Plant. Main Electrical Building included.', url:'https://www.beaconbid.com/solicitations/city-of-houston/d970dd10-3342-4999-b71c-c31d88edf5a8/sims-north-wastewater-treatment-plant-improvements-package', source:'H2bid' },
  { id:'h2bid-004', name:'City of Houston — Professional Engineering Services WW Regulatory Compliance', agency:'H2bid', city:'Houston, TX', due:'2026-10-01', scope:'Professional Engineering Services for regulatory permitting and compliance at various WWTP facilities. TPDES permit renewals, storm water, air permitting.', url:'https://www.beaconbid.com/solicitations/city-of-houston/bdccdb58-0dc2-45dc-9e43-d1c35f2d8b40/professional-engineering-services-for-regulatory-compliance-support-at-various-wastewater-facilities', source:'H2bid' },
  { id:'h2bid-005', name:'City of Houston — Water Distribution Repair & Improvement Program', agency:'H2bid', city:'Houston, TX', due:'2026-10-10', scope:'Program management and engineer-led design-build for Houston Water Distribution Program. Systematic rehabilitation of aging water distribution infrastructure.', url:'https://www.beaconbid.com/solicitations/city-of-houston/334da38b-c084-4235-a3d9-2e31155fcde7/water-distribution-repair-and-improvement-program', source:'H2bid' },
  { id:'h2bid-006', name:'City of Houston — Lift Station Renewal & Rehabilitation CB-2026-0026', agency:'H2bid', city:'Houston, TX', due:'2026-10-20', scope:'Lift Station Renewal and Rehabilitation — Green Dolphin, Sherwood Oaks, West subdivisions. Houston Public Works.', url:'https://www.beaconbid.com/solicitations/city-of-houston', source:'H2bid' },
  { id:'h2bid-007', name:'City of Houston — WW Process Unit Cleaning & Evaluation CB-2026-0029', agency:'H2bid', city:'Houston, TX', due:'2026-10-30', scope:'Wastewater Process Unit Cleaning and Evaluation. Houston Public Works CB-2026-0029.', url:'https://www.beaconbid.com/solicitations/city-of-houston', source:'H2bid' },
];

const CIVCAST_BIDS = [
  { id:'civcast-001', name:'HPW — Neighborhood Water Line Rehabilitation Central Park & Magnolia Park', agency:'CivCast', city:'Houston, TX', due:'2026-09-15', scope:'Houston Public Works Neighborhood Water Line Rehabilitation in Central Park and Magnolia Park Subdivisions. Harris County, TX.', url:'https://app.civcast.com/bid-opportunities/projects', source:'CivCast' },
  { id:'civcast-002', name:'HPW — New Replacement Water Well & Collection Line IAH Well No. 4', agency:'CivCast', city:'Houston, TX', due:'2026-09-20', scope:'Houston Public Works New Replacement of Water Well and Well Collection Line IAH Well No. 4 — 60% Submittal.', url:'https://app.civcast.com/bid-opportunities/projects', source:'CivCast' },
  { id:'civcast-003', name:'HPW — Transportation & Drainage Bridge Rehabilitation', agency:'CivCast', city:'Houston, TX', due:'2026-09-25', scope:'Houston Public Works Transportation and Drainage Operations Bridge Rehabilitation and Replacement Program.', url:'https://app.civcast.com/bid-opportunities/projects', source:'CivCast' },
  { id:'civcast-004', name:'Trinity River Authority — RFQ Professional Services FY 2027-2028', agency:'CivCast', city:'Arlington, TX', due:'2026-10-01', scope:'Trinity River Authority RFQ for Professional Services Fiscal Years 2027-2028. Water/Wastewater engineering services.', url:'https://www.civcastusa.com/publishers/5d6017908289a31a1c7febe1', source:'CivCast' },
  { id:'civcast-005', name:'HCMUD No. 525 — Water Plant No. 1 Expansion Sundance Cove', agency:'CivCast', city:'Harris County, TX', due:'2026-10-10', scope:'Harris County MUD No. 525 Water Plant No. 1 Expansion to serve Sundance Cove subdivision. Water treatment plant engineering.', url:'https://app.civcast.com/bid-opportunities/projects', source:'CivCast' },
  { id:'civcast-006', name:'Quiddity Engineering — Water Treatment E&I Engineering Services TX', agency:'CivCast', city:'Texas', due:'2026-10-20', scope:'Quiddity Engineering Texas Water Treatment Electrical & Instrumentation Engineering Services.', url:'https://www.civcastusa.com/publishers/5867827b01ec5a264c779277', source:'CivCast' },
  { id:'civcast-007', name:'City of Pflugerville — WW2401 Gilleland Creek WW Interceptor', agency:'CivCast', city:'Pflugerville, TX', due:'2026-10-30', scope:'City of Pflugerville RFP No. 2026-023 — WW2401 Gilleland Creek Wastewater Interceptor Engineering Design Services.', url:'https://app.civcast.com/bid-opportunities/projects', source:'CivCast' },
];

const ESBD_BIDS = [
  { id:'esbd-001', name:'TDCJ — Wainwright Unit Wastewater Treatment Plant Construction', agency:'TX ESBD', city:'Lovelady, TX', due:'2026-10-15', scope:'TDCJ construct new 2 MGD Wastewater Treatment Plant. Electrical, mechanical, structural. NIGP: 91359, 93677, 96895. Solicitation: 696-FD-26-P007.', url:'https://www.txsmartbuy.gov/esbd/696-FD-26-P007', source:'TX ESBD' },
  { id:'esbd-002', name:'TWC — Engineering & Professional Services Water/WW Infrastructure', agency:'TX ESBD', city:'Austin, TX', due:'2026-11-24', scope:'Professional Engineering Services for Water/WW Infrastructure. E&I design, structural, instrumentation. Solicitation: 3202600155.', url:'https://www.txsmartbuy.gov/esbd/3202600155', source:'TX ESBD' },
  { id:'esbd-003', name:'UT Austin — Water Feature VFD Pump & PLC/DMX Control Systems', agency:'TX ESBD', city:'Austin, TX', due:'2026-09-30', scope:'VFD-controlled pumps, PLC/DMX control systems, filtration, UV infrastructure. Solicitation: 26PSS001.', url:'https://www.txsmartbuy.gov/esbd/26PSS001', source:'TX ESBD' },
  { id:'esbd-004', name:'TX Military Dept — Marshall Facility Water Service Line Repair', agency:'TX ESBD', city:'Marshall, TX', due:'2026-09-30', scope:'Structural and plumbing repair of water service line. Solicitation: TMD26-FMO-0043352.', url:'https://www.txsmartbuy.gov/esbd/TMD26-FMO-0043352', source:'TX ESBD' },
  { id:'esbd-005', name:'Texas A&M — Professional Engineering Services RFP', agency:'TX ESBD', city:'College Station, TX', due:'2026-10-01', scope:'Professional Engineering Services RFP — structural, electrical, instrumentation design. Solicitation: TAMUS-RFP-02-3452.', url:'https://www.txsmartbuy.gov/esbd/TAMUS-RFP-02-3452', source:'TX ESBD' },
  { id:'esbd-006', name:'TPWD — Electrical Construction IDIQ Services Statewide Texas', agency:'TX ESBD', city:'Austin, TX', due:'2026-11-01', scope:'Multiple Award IDIQ — electrical construction, repairs, replacements statewide. NIGP: 914-38. Solicitation: 2025-ElectricConstruct-IDIQ.', url:'https://www.txsmartbuy.gov/esbd/2025-ElectricConstruct-IDIQ', source:'TX ESBD' },
  { id:'esbd-007', name:'TX ESBD — E&I Wastewater Engineering Open Solicitations', agency:'TX ESBD', city:'Texas', due:'2026-12-01', scope:'Browse all open TX ESBD electrical, instrumentation, wastewater and professional engineering solicitations. No login required.', url:'https://www.txsmartbuy.gov/esbd/3202600155', source:'TX ESBD' },
];

// TWDB — Post-Funding bids (show ONLY in TWDB tab, not in All Bids)
const TWDB_BIDS = [
  { id:'twdb-001', name:'TWDB — Water System Improvements CDBG-MIT Engineering (Karnes City)', agency:'TWDB', city:'Karnes City, TX', due:'Post-Funding', scope:'TWDB CDBG-MIT Water System Improvements — Replace 9,725 LF of existing water lines. Engineering design, electrical and instrumentation.', url:'https://www.twdb.texas.gov/financial/programs/CWSRF/index.asp', source:'TWDB', status:'prebid' },
  { id:'twdb-002', name:'TWDB — Drinking Water State Revolving Fund Engineering Services', agency:'TWDB', city:'Texas', due:'Post-Funding', scope:'TWDB DWSRF — Engineering services for water system improvements, electrical upgrades, instrumentation and controls for Texas water utilities.', url:'https://www.twdb.texas.gov/financial/programs/DWSRF/index.asp', source:'TWDB', status:'prebid' },
  { id:'twdb-003', name:'TWDB — Clean Water State Revolving Fund Wastewater Engineering', agency:'TWDB', city:'Texas', due:'Post-Funding', scope:'TWDB CWSRF — Wastewater treatment plant engineering, electrical and instrumentation design, SCADA systems for Texas utilities.', url:'https://www.twdb.texas.gov/financial/programs/CWSRF/index.asp', source:'TWDB', status:'prebid' },
  { id:'twdb-004', name:'TWDB — State Water Implementation Fund Texas (SWIFT) Projects', agency:'TWDB', city:'Texas', due:'Post-Funding', scope:'TWDB SWIFT Program — Engineering design services for major water supply projects. E&I engineering, pump stations, treatment facilities.', url:'https://www.twdb.texas.gov/financial/programs/swift/index.asp', source:'TWDB', status:'prebid' },
  { id:'twdb-005', name:'TWDB — Regional Water Planning Engineering Services', agency:'TWDB', city:'Texas', due:'Post-Funding', scope:'TWDB Regional Water Planning Group engineering and professional services. Water supply infrastructure design, E&I engineering.', url:'https://www.twdb.texas.gov/waterplanning/rwp/index.asp', source:'TWDB', status:'prebid' },
  { id:'twdb-006', name:'TWDB — HB 500 Water/WW Infrastructure Engineering', agency:'TWDB', city:'Texas', due:'Post-Funding', scope:'TWDB HB 500 Flood Infrastructure Fund — Water/Wastewater infrastructure engineering. Electrical design, instrumentation, control systems.', url:'https://www.twdb.texas.gov/financial/programs/FIF/index.asp', source:'TWDB', status:'prebid' },
  { id:'twdb-007', name:'TWDB — Economically Distressed Areas Program (EDAP) Engineering', agency:'TWDB', city:'Texas', due:'Post-Funding', scope:'TWDB EDAP — Engineering services for economically distressed communities. Water/wastewater system design, electrical, instrumentation and SCADA engineering.', url:'https://www.twdb.texas.gov/financial/programs/edap/index.asp', source:'TWDB', status:'prebid' },
];

const MANUAL_BIDS = [
  { id:'seed-1', name:'City of Austin — Water & Wastewater Facilities IDIQ', agency:'City of Austin – Austin Water', city:'Austin', due:'Check link', scope:'IDIQ E&I engineering design work assignments at water & wastewater facilities', value:'IDIQ / TBD', status:'active', region:'austin', url:'https://financeonline.austintexas.gov/afo/account_services/solicitation/solicitations.cfm', source:'Manual' },
  { id:'seed-2', name:'HCFCD — Harris County Flood Control E&I Engineering', agency:'Harris County Flood Control District', city:'Houston', due:'Check link', scope:'Electrical & Instrumentation engineering for flood control infrastructure', value:'TBD', status:'active', region:'houston', url:'https://www.harriscountyfcd.org/doing-business/professional-services', source:'Manual' },
  { id:'seed-3', name:'LNVA — Lower Neches Valley Authority Water Plant SCADA', agency:'Lower Neches Valley Authority', city:'Beaumont, TX', due:'Check link', scope:'SCADA system design and integration for water treatment plant', value:'TBD', status:'active', region:'statewide', url:'https://www.lnva.dst.tx.us/', source:'Manual' },
  { id:'seed-4', name:'BVWACS — Brazos Valley Water Authority Controls Engineering', agency:'Brazos Valley Water Authority', city:'Bryan, TX', due:'Check link', scope:'Controls and instrumentation engineering for water authority infrastructure', value:'TBD', status:'active', region:'statewide', url:'https://www.bvwacs.org/', source:'Manual' },
  { id:'seed-5', name:'City of Strawn — WTP SCADA & Electrical Engineering (Post-Funding)', agency:'City of Strawn (TWDB HB500)', city:'Strawn, TX', due:'Post-Funding', scope:'SCADA design, alternate power, electrical design for microfilter replacement', value:'~$1,085,000', status:'prebid', region:'statewide', url:'https://www.twdb.texas.gov/financial/programs/WSIG/index.asp', source:'TWDB' },
  { id:'seed-6', name:'SAWS — San Antonio Water System E&I Engineering Services', agency:'San Antonio Water System', city:'San Antonio, TX', due:'Check link', scope:'Electrical & Instrumentation engineering services for water and wastewater infrastructure', value:'TBD', status:'active', region:'statewide', url:'https://www.saws.org/business-center/purchasing/', source:'Manual' },
];

// ─── HELPERS ─────────────────────────────────────────────────

function detectRegion(city='') {
  const c = city.toLowerCase();
  if (c.includes('houston')) return 'houston';
  if (c.includes('austin')) return 'austin';
  if (c.includes('dallas') || c.includes('fort worth') || c.includes('dfw')) return 'dfw';
  if (c.includes('san antonio')) return 'sanantonio';
  return 'statewide';
}

async function saveBid(bid) {
  const id = bid.id || ('bid-' + Date.now());
  bid.id = id;
  await pool.query(
    'INSERT INTO bids(id, data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=$2, updated_at=NOW()',
    [id, JSON.stringify(bid)]
  );
}

async function seedAllBids() {
  try {
    const today = new Date().toISOString().split('T')[0];
    // Seed all sources
    for (const b of EBN_BIDS) await saveBid({ ...b, region: detectRegion(b.city), value:'TBD', status:'active', scrapedAt: new Date().toISOString() });
    for (const b of H2BID_BIDS) await saveBid({ ...b, region: detectRegion(b.city), value:'TBD', status:'active', scrapedAt: new Date().toISOString() });
    for (const b of CIVCAST_BIDS) await saveBid({ ...b, region: detectRegion(b.city), value:'TBD', status:'active', scrapedAt: new Date().toISOString() });
    for (const b of ESBD_BIDS) await saveBid({ ...b, region: detectRegion(b.city), value:'TBD', status:'active', scrapedAt: new Date().toISOString() });
    // TWDB bids — prebid/post-funding, show only in TWDB tab
    for (const b of TWDB_BIDS) await saveBid({ ...b, region: detectRegion(b.city), scrapedAt: new Date().toISOString() });
    // Manual bids — seed-5 is TWDB post-funding
    for (const b of MANUAL_BIDS) await saveBid({ ...b, region: detectRegion(b.city), scrapedAt: new Date().toISOString() });
    console.log('[Seed] All bids seeded successfully');
  } catch(e) { console.error('[Seed]', e.message); }
}

async function seedESBD() {
  for (const b of ESBD_BIDS) {
    await saveBid({ ...b, region: detectRegion(b.city), value:'TBD', status:'active', scrapedAt: new Date().toISOString() });
  }
}

async function seedH2bid() {
  for (const b of H2BID_BIDS) {
    await saveBid({ ...b, region: detectRegion(b.city), value:'TBD', status:'active', scrapedAt: new Date().toISOString() });
  }
}

// ─── AUTO-FETCH ──────────────────────────────────────────────

async function fetchFromBeacon() {
  try {
    const https = require('https');
    const data = await new Promise((resolve, reject) => {
      const req = https.get({ hostname:'www.beaconbid.com', path:'/api/solicitations?publisher=city-of-houston&status=open&limit=15', headers:{'User-Agent':'SRI/1.0','Accept':'application/json'} }, (res) => { let b=''; res.on('data',d=>b+=d); res.on('end',()=>resolve(b)); });
      req.on('error', reject); req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    });
    const result = JSON.parse(data);
    const bids = result.solicitations || result.data || [];
    if (!Array.isArray(bids)) return;
    const kw = ['water','wastewater','electrical','sewer','pump','scada','lift station','instrumentation'];
    let added = 0;
    for (const bid of bids.slice(0,10)) {
      const title = (bid.title||bid.name||'').toLowerCase();
      if (!kw.some(k=>title.includes(k))) continue;
      const due = (bid.due_date||bid.response_deadline||'').split('T')[0];
      if (!due || due < new Date().toISOString().split('T')[0]) continue;
      const bidId = 'beacon-' + (bid.id||Date.now());
      const ex = await pool.query('SELECT id FROM bids WHERE id=$1', [bidId]);
      if (ex.rows.length > 0) continue;
      await saveBid({ id:bidId, name:bid.title||'Houston Bid', agency:'H2bid', city:'Houston, TX', due, scope:bid.description||bid.title||'', url:bid.url||'https://www.beaconbid.com/solicitations/city-of-houston', source:'H2bid', value:'TBD', status:'active', region:'houston', scrapedAt:new Date().toISOString() });
      added++;
    }
    if (added > 0) console.log('[AutoFetch] BeaconBid:', added, 'new bids');
  } catch(e) { console.log('[AutoFetch] BeaconBid skipped:', e.message); }
}

async function autoFetchNewBids() {
  console.log('[AutoFetch] Running every 2 hours...');
  await fetchFromBeacon();
}

// ─── DB INIT ─────────────────────────────────────────────────

async function initDB() {
  await pool.query(`CREATE TABLE IF NOT EXISTS bids (id TEXT PRIMARY KEY, data JSONB NOT NULL, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`);
  await pool.query(`ALTER TABLE bids ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`).catch(()=>{});
  await pool.query(`CREATE TABLE IF NOT EXISTS emails (id SERIAL PRIMARY KEY, data JSONB, created_at TIMESTAMP DEFAULT NOW())`).catch(()=>{});
  console.log('[DB] Ready');
  // Delete and reseed all bids fresh
  await pool.query("DELETE FROM bids WHERE data->>'source' IN ('EnviroBidNet','H2bid','CivCast','TX ESBD','TWDB','Manual')");
  await seedAllBids();
}

// ─── ROUTES ──────────────────────────────────────────────────

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/api/bids', async (req, res) => {
  try {
    const r = await pool.query("SELECT data FROM bids ORDER BY created_at ASC");
    res.json({ bids: r.rows.map(r => r.data) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/seed-ebn', async (req, res) => {
  try {
    await pool.query("DELETE FROM bids WHERE data->>'source' IN ('EnviroBidNet','H2bid','CivCast','TX ESBD','TWDB')");
    await seedAllBids();
    const r = await pool.query('SELECT COUNT(*) FROM bids');
    res.json({ success: true, total: parseInt(r.rows[0].count) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/reset', async (req, res) => {
  try {
    await pool.query("DELETE FROM bids");
    await seedAllBids();
    const r = await pool.query('SELECT COUNT(*) FROM bids');
    res.json({ success: true, message: 'All bids deleted and reseeded', total: parseInt(r.rows[0].count) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/fetch-new', async (req, res) => {
  try {
    await autoFetchNewBids();
    const r = await pool.query('SELECT COUNT(*) FROM bids');
    res.json({ success: true, total: parseInt(r.rows[0].count) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/fix-expired', async (req, res) => {
  try {
    const r1 = await pool.query("DELETE FROM bids WHERE data->>'status' != 'prebid' AND data->>'due' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND (data->>'due')::date < CURRENT_DATE");
    await seedAllBids();
    const r2 = await pool.query('SELECT COUNT(*) FROM bids');
    res.json({ success: true, removed: r1.rowCount, total: parseInt(r2.rows[0].count) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/bids/:id/state', async (req, res) => {
  try {
    await pool.query("UPDATE bids SET data = jsonb_set(data, '{userState}', $1) WHERE id=$2", [JSON.stringify(req.body.state), req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/bids/:id/url', async (req, res) => {
  try {
    await pool.query("UPDATE bids SET data = jsonb_set(data, '{url}', $1) WHERE id=$2", [JSON.stringify(req.body.url), req.params.id]);
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

// ─── CRON ────────────────────────────────────────────────────
cron.schedule('0 */2 * * *', () => autoFetchNewBids()); // every 2 hours
cron.schedule('0 */2 * * *', () => autoExpireAndClean()); // expire + clean every 2 hours

// ─── START ───────────────────────────────────────────────────
// Auto-expire completed bids and clean 14-day-old deleted bids
async function autoExpireAndClean() {
  try {
    const today = new Date().toISOString().split('T')[0];
    // Step 1: Move expired bids to deleted — set userState='deleted' and deletedAt=today
    const expired = await pool.query(
      `UPDATE bids 
       SET data = jsonb_set(jsonb_set(data, '{userState}', '"deleted"'), '{deletedAt}', to_jsonb($1::text))
       WHERE data->>'status' != 'prebid'
       AND data->>'source' != 'TWDB'
       AND data->>'userState' != 'deleted'
       AND data->>'userState' != 'selected'
       AND data->>'due' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       AND (data->>'due')::date < CURRENT_DATE`,
      [today]
    );
    if (expired.rowCount > 0) console.log('[AutoExpire] Moved', expired.rowCount, 'expired bids to deleted');

    // Step 2: Permanently delete bids that have been deleted for 14+ days
    const cleaned = await pool.query(
      `DELETE FROM bids
       WHERE data->>'userState' = 'deleted'
       AND data->>'source' != 'Manual'
       AND data->>'deletedAt' IS NOT NULL
       AND (data->>'deletedAt')::date <= CURRENT_DATE - INTERVAL '14 days'`
    );
    if (cleaned.rowCount > 0) console.log('[AutoClean] Permanently deleted', cleaned.rowCount, 'bids older than 14 days');
  } catch(e) { console.error('[AutoExpire]', e.message); }
}

app.listen(PORT, '0.0.0.0', () => console.log('[SRI Bids] Listening on port', PORT));
initDB().then(() => { setTimeout(autoFetchNewBids, 15000); setTimeout(autoExpireAndClean, 20000); }).catch(err => console.error('[DB] Init failed:', err.message));
