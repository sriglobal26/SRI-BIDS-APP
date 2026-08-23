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
  { id:'ebn-881931', name:'CLCWA — Water Plant No. 1 Recoating', agency:'EnviroBidNet', city:'Texas', posted:'2026-08-09', due:'2026-08-25', scope:'CLCWA Water Plant No. 1 Recoating — Water Treatment Plant Maintenance Engineering Services. Plans Available: 08/09/2026. Bid Expiration: 08/25/2026. Contact: Adrian Bustios 713-821-0332. Zip: 77058.', url:'https://envirobidnet.com/subscriber_view_bid/881931', source:'EnviroBidNet', bidId:'#881931' },
  { id:'ebn-881877', name:'HHSC — Lead Sample Analysis Services Dept of Health Services', agency:'EnviroBidNet', city:'Austin, TX', posted:'2026-08-09', due:'2026-08-25', scope:'Texas HHSC — Lead Sample Analysis Services for Dept of State Health Services. Plans Available: 08/09/2026. Bid Expiration: 08/25/2026. Zip: 77058. Contact: 713-821-0332.', url:'https://envirobidnet.com/subscriber_view_bid/881877', source:'EnviroBidNet', bidId:'#881877' },
  { id:'ebn-881891', name:'Pinehurst — RFQ Administration/Professional & Engineering Services', agency:'EnviroBidNet', city:'Pinehurst, TX', posted:'2026-08-05', due:'2026-08-25', scope:'City of Pinehurst RFQ for Administration/Professional Services and Engineering Services. Mitigation Reallocation Program. Posted: 08/05/2026. Due: 08/25/2026.', url:'https://envirobidnet.com/subscriber_view_bid/881891', source:'EnviroBidNet', bidId:'#881891' },
  { id:'ebn-881932', name:'HCMUD No. 406 — Lift Station No. 1 Rehabilitation', agency:'EnviroBidNet', city:'Houston, TX', posted:'2026-08-01', due:'2026-09-01', scope:'HCMUD No. 406 Lift Station No. 1 Rehabilitation — cleaning, abrasive blasting and rehabilitation of lift station components. Harris County MUD. Posted: 08/01/2026. Due: 09/01/2026.', url:'https://envirobidnet.com/subscriber_view_bid/881932', source:'EnviroBidNet', bidId:'#881932' },
  { id:'ebn-881930', name:'Texas A&M — RFQ A/E Ballistic Aero-Optics Phase 2', agency:'EnviroBidNet', city:'College Station, TX', posted:'2026-08-01', due:'2026-09-01', scope:'Texas A&M University System RFQ for A/E services for the Ballistic Aero-Optics and Materials Range Phase 2 Project. Posted: 08/01/2026. Due: 09/01/2026.', url:'https://envirobidnet.com/subscriber_view_bid/881930', source:'EnviroBidNet', bidId:'#881930' },
  { id:'ebn-881890', name:'Northwest ISD — CM at Risk NISD Steele ECHS Renovation', agency:'EnviroBidNet', city:'Texas', posted:'2026-08-04', due:'2026-09-03', scope:'Northwest ISD Construction Manager at Risk for NISD Steele Early College High School Renovation & Addition. Posted: 08/04/2026. Due: 09/03/2026.', url:'https://envirobidnet.com/subscriber_view_bid/881890', source:'EnviroBidNet', bidId:'#881890' },
  { id:'ebn-881778', name:'La Marque — RFQ Third-Party Building Plan Review & Inspection', agency:'EnviroBidNet', city:'La Marque, TX', posted:'2026-08-07', due:'2026-09-07', scope:'City of La Marque RFQ for Third-Party Building Plan Review and Inspection Services. Posted: 08/07/2026. Due: 09/07/2026.', url:'https://envirobidnet.com/subscriber_view_bid/881778', source:'EnviroBidNet', bidId:'#881778' },
];

const H2BID_BIDS = [
  { id:'h2bid-001', name:'City of Houston — Clinton Park Wastewater Treatment Plant Improvements', agency:'H2bid', city:'Houston, TX', posted:'2026-08-17', due:'2026-09-03', scope:'Clinton Park Wastewater Treatment Plant Improvements — NAICS: 221320 Sewage Treatment Facilities, 237110 Water and Sewer Line Construction. Posted: 08/17/2026. Due: 09/03/2026. Source: govcb.com. City of Houston.', url:'https://www.beaconbid.com/solicitations/city-of-houston', source:'H2bid' },
  { id:'h2bid-002', name:'City of Sugar Land — Wastewater Treatment Plants Improvements (RFQ-2026-036)', agency:'H2bid', city:'Sugar Land, TX', posted:'2026-08-05', due:'2026-09-04', scope:'City of Sugar Land Wastewater Treatment Plants Improvements. Project ID: 2026-RFQ-036. Addenda: 0. Release Date: 08/05/2026. Due: 09/04/2026. Professional engineering services.', url:'https://www.govcb.com/government-bids/WASTEWATER-TREATMENT-PLANTS-IMPROVEMENTS-23800101.htm', source:'H2bid' },
  { id:'h2bid-003', name:'City of Houston — WW Collection System Rehabilitation & Renewal (CB-2026-0048)', agency:'H2bid', city:'Houston, TX', posted:'2026-05-29', due:'2026-09-15', scope:'On-call rehabilitation and renewal of wastewater collection system. Point repairs, sewer replacement, sliplining, CIPP, manholes. Est. $4.3M. Release: 05/29/2026. Houston Public Works.', url:'https://www.beaconbid.com/solicitations/city-of-houston/085f5cae-deb4-4ccd-aae0-d070ae461214/wastewater-collection-system-rehabilitation-and-renewal', source:'H2bid' },
  { id:'h2bid-004', name:'City of Houston — WW Collection System Rehabilitation of Manholes (CB-2026-0030)', agency:'H2bid', city:'Houston, TX', posted:'2026-05-29', due:'2026-09-20', scope:'Rehabilitation of existing manholes using cementitious liners, CIPP liners, polymeric coatings. Point repairs to sewer mains. Posted: 05/29/2026. Last Updated: 06/22/2026. Houston Public Works.', url:'https://www.beaconbid.com/solicitations/city-of-houston/9f2e4bf2-7d31-4ec1-943c-10f0eeec95d0/wastewater-collection-system-rehabilitation-and-renewal-of-manholes', source:'H2bid' },
  { id:'h2bid-005', name:'City of Houston — Sims North WWTP Improvements Package 3 (CB-2026-0022)', agency:'H2bid', city:'Houston, TX', posted:'2026-04-01', due:'2026-09-25', scope:'Comprehensive improvements at Sims North WWTP. Main Electrical Building, Thickened Sludge Electrical Building, mechanical systems. Est. $15M. Site Visit: 05/27/2026. FEMA reimbursement. Houston Public Works.', url:'https://www.beaconbid.com/solicitations/city-of-houston/d970dd10-3342-4999-b71c-c31d88edf5a8/sims-north-wastewater-treatment-plant-improvements-package', source:'H2bid' },
  { id:'h2bid-006', name:'San Antonio Water System (SAWS) — Lateral Renewal & Repair Construction Services', agency:'H2bid', city:'San Antonio, TX', posted:'2026-08-01', due:'2026-09-19', scope:'SAWS Distribution and Collection Operations — outsourced construction for lateral renewal and repair. Wastewater collection, CIPP lining, pipe inspection. Bexar County. Posted: 08/01/2026. Due: 09/19/2026.', url:'https://www.saws.org/business-center/purchasing/', source:'H2bid' },
  { id:'h2bid-007', name:'City of Houston — East Water Purification Plant (EWPP) Mechanical & Electrical Improvements', agency:'H2bid', city:'Houston, TX', posted:'2026-01-16', due:'2026-10-01', scope:'East Water Purification Plant — mechanical and electrical improvements. Electrical systems, instrumentation upgrades. Posted: 01/16/2026. Houston Public Works.', url:'https://www.beaconbid.com/solicitations/city-of-houston/a14610b8-d60a-4d4a-be27-bd9c490eaf7c/east-water-purification-plant-ewpp-mechanical-and-electrical-improvements-for-plants-and', source:'H2bid' },
];

const CIVCAST_BIDS = [
  { id:'civcast-001', name:'HPW — Neighborhood Water Line Rehab Central Park & Magnolia Park', agency:'CivCast', city:'Houston, TX', posted:'2026-07-01', due:'2026-09-15', scope:'Houston Public Works — Neighborhood Water Line Rehabilitation in Central Park and Magnolia Park Subdivisions. Harris County, TX.', url:'https://app.civcast.com/bid-opportunities/projects', source:'CivCast' },
  { id:'civcast-002', name:'HPW — New Replacement Water Well & Collection Line IAH Well No. 4', agency:'CivCast', city:'Houston, TX', posted:'2026-07-15', due:'2026-09-20', scope:'Houston Public Works — New Replacement of Water Well and Well Collection Line IAH Well No. 4. Harris County, TX.', url:'https://app.civcast.com/bid-opportunities/projects', source:'CivCast' },
  { id:'civcast-003', name:'HPW — Transportation & Drainage Bridge Rehabilitation Program', agency:'CivCast', city:'Houston, TX', posted:'2026-07-15', due:'2026-09-25', scope:'Houston Public Works — Transportation and Drainage Operations Bridge Rehabilitation and Replacement Program.', url:'https://app.civcast.com/bid-opportunities/projects', source:'CivCast' },
  { id:'civcast-004', name:'Trinity River Authority — RFQ Professional Engineering FY 2027-2028', agency:'CivCast', city:'Arlington, TX', posted:'2026-07-15', due:'2026-10-01', scope:'Trinity River Authority of Texas RFQ for Professional Engineering Services FY 2027-2028. Electrical, instrumentation, SCADA design.', url:'https://www.civcastusa.com/publishers/5d6017908289a31a1c7febe1', source:'CivCast' },
  { id:'civcast-005', name:'HCMUD No. 525 — Water Plant No. 1 Expansion Sundance Cove', agency:'CivCast', city:'Harris County, TX', posted:'2026-08-01', due:'2026-10-10', scope:'Harris County MUD No. 525 — Water Plant No. 1 Expansion to serve Sundance Cove subdivision. Water treatment plant engineering.', url:'https://app.civcast.com/bid-opportunities/projects', source:'CivCast' },
  { id:'civcast-006', name:'City of Pflugerville — WW2401 Gilleland Creek WW Interceptor (RFP 2026-023)', agency:'CivCast', city:'Pflugerville, TX', posted:'2026-08-01', due:'2026-10-20', scope:'City of Pflugerville RFP No. 2026-023 — WW2401 Gilleland Creek Wastewater Interceptor Engineering Design Services.', url:'https://app.civcast.com/bid-opportunities/projects', source:'CivCast' },
  { id:'civcast-007', name:'Quiddity Engineering — Water Treatment E&I Engineering Services Texas', agency:'CivCast', city:'Texas', posted:'2026-08-01', due:'2026-10-30', scope:'Quiddity Engineering Texas — Water Treatment Electrical & Instrumentation Engineering Services for Texas water utilities.', url:'https://www.civcastusa.com/publishers/5867827b01ec5a264c779277', source:'CivCast' },
];

const ESBD_BIDS = [
  { id:'esbd-001', name:'TDCJ — Wainwright Unit Wastewater Treatment Plant (696-FD-26-P007)', agency:'TX ESBD', city:'Lovelady, TX', posted:'2026-06-01', due:'2026-10-15', scope:'TDCJ construct new 2 MGD WW Treatment Plant at Wainwright Unit. NIGP: 91359,91391,93677-Substation/High Voltage Electrical,96895. Amendment A-003 posted 07/31/2026. Amendment A-002 posted 06/29/2026. Solicitation: 696-FD-26-P007. Source: txsmartbuy.gov/esbd/696-FD-26-P007.', url:'https://www.txsmartbuy.gov/esbd/696-FD-26-P007', source:'TX ESBD' },
  { id:'esbd-002', name:'TWC — Open Enrollment Orientation & Mobility Services Statewide (3202600155)', agency:'TX ESBD', city:'Austin, TX', posted:'2026-05-28', due:'2026-11-24', scope:'Texas Workforce Commission Open Enrollment for Orientation and Mobility Services statewide. Status: Addendum Posted. Contact: Meghan Osborn (737)295-0326. procurement.oe@twc.texas.gov. Posting Date: 05/28/2026. Response Due: 11/24/2026 at 10:00 AM.', url:'https://www.txsmartbuy.gov/esbd/3202600155', source:'TX ESBD' },
  { id:'esbd-003', name:'TX ESBD — New Engineering RFQ Due September 9, 2026', agency:'TX ESBD', city:'Texas', posted:'2026-08-05', due:'2026-09-09', scope:'Texas Electronic State Business Daily (ESBD) new engineering RFQ. Posted August 2026. Due: September 9, 2026. Source: txsmartbuy.gov/esbd. Register through CMBL for Texas state opportunities. No login required to view solicitation details.', url:'https://www.txsmartbuy.gov/esbd', source:'TX ESBD' },
  { id:'esbd-004', name:'GLO/VLB — Professional Services RFQ Statewide Engineering (RFQ No. 7532-LP)', agency:'TX ESBD', city:'Austin, TX', posted:'2026-03-18', due:'2026-09-01', scope:'Texas General Land Office & Veterans Land Board — RFQ No. 7532-LP. Contract: 09/01/2026–08/31/2031. Statewide engineering services. Agency Code 305. Addendum posted. Questions: email GLO team contacts. Source: media.governmentnavigator.com/media/bid/1773859511_2026-03-18_RFQ-7532-LP.pdf', url:'https://www.txsmartbuy.gov/esbd', source:'TX ESBD' },
  { id:'esbd-005', name:'UT Austin — Water Feature VFD Pump & PLC/DMX Control Systems (26PSS001)', agency:'TX ESBD', city:'Austin, TX', posted:'2026-05-15', due:'2026-09-30', scope:'UT Austin — VFD-controlled pumps, PLC/DMX control systems, filtration, UV infrastructure commissioning. Instrumentation & Controls. Contact: trina.bickford@austin.utexas.edu. Posting Date: 05/15/2026. Due: 09/30/2026.', url:'https://www.txsmartbuy.gov/esbd/26PSS001', source:'TX ESBD' },
  { id:'esbd-006', name:'Texas A&M — Professional Engineering Services RFP (TAMUS-RFP-02-3452)', agency:'TX ESBD', city:'College Station, TX', posted:'2026-06-15', due:'2026-10-01', scope:'Texas A&M University System Professional Services RFP for Engineering. Structural, electrical, instrumentation. Contact: dwilkinson@tamus.edu. Posting Date: 06/15/2026. Due: 10/01/2026.', url:'https://www.txsmartbuy.gov/esbd/TAMUS-RFP-02-3452', source:'TX ESBD' },
  { id:'esbd-007', name:'TPWD — Electrical Construction IDIQ Services Statewide (2025-ElectricConstruct-IDIQ)', agency:'TX ESBD', city:'Austin, TX', posted:'2026-07-01', due:'2026-11-01', scope:'Texas Parks & Wildlife — Multiple Award IDIQ for electrical construction, repairs and replacements statewide. NIGP: 914-38. Solicitation: 2025-ElectricConstruct-IDIQ. Posting Date: 07/01/2026. Due: 11/01/2026.', url:'https://www.txsmartbuy.gov/esbd/2025-ElectricConstruct-IDIQ', source:'TX ESBD' },
];

// TWDB — Post-Funding bids (show ONLY in TWDB tab, not in All Bids)
const TWDB_BIDS = [
  { id:'twdb-001', posted:'2026-01-01', name:'TWDB — Water System Improvements CDBG-MIT Engineering (Karnes City)', agency:'TWDB', city:'Karnes City, TX', due:'Post-Funding', scope:'TWDB CDBG-MIT Water System Improvements — Replace 9,725 LF of existing water lines. Engineering design, electrical and instrumentation.', url:'https://www.twdb.texas.gov/financial/programs/CWSRF/index.asp', source:'TWDB', status:'prebid' },
  { id:'twdb-002', posted:'2026-01-01', name:'TWDB — Drinking Water State Revolving Fund Engineering Services', agency:'TWDB', city:'Texas', due:'Post-Funding', scope:'TWDB DWSRF — Engineering services for water system improvements, electrical upgrades, instrumentation and controls for Texas water utilities.', url:'https://www.twdb.texas.gov/financial/programs/DWSRF/index.asp', source:'TWDB', status:'prebid' },
  { id:'twdb-003', posted:'2026-01-01', name:'TWDB — Clean Water State Revolving Fund Wastewater Engineering', agency:'TWDB', city:'Texas', due:'Post-Funding', scope:'TWDB CWSRF — Wastewater treatment plant engineering, electrical and instrumentation design, SCADA systems for Texas utilities.', url:'https://www.twdb.texas.gov/financial/programs/CWSRF/index.asp', source:'TWDB', status:'prebid' },
  { id:'twdb-004', posted:'2026-01-01', name:'TWDB — State Water Implementation Fund Texas (SWIFT) Projects', agency:'TWDB', city:'Texas', due:'Post-Funding', scope:'TWDB SWIFT Program — Engineering design services for major water supply projects. E&I engineering, pump stations, treatment facilities.', url:'https://www.twdb.texas.gov/financial/programs/swift/index.asp', source:'TWDB', status:'prebid' },
  { id:'twdb-005', posted:'2026-01-01', name:'TWDB — Regional Water Planning Engineering Services', agency:'TWDB', city:'Texas', due:'Post-Funding', scope:'TWDB Regional Water Planning Group engineering and professional services. Water supply infrastructure design, E&I engineering.', url:'https://www.twdb.texas.gov/waterplanning/rwp/index.asp', source:'TWDB', status:'prebid' },
  { id:'twdb-006', posted:'2026-01-01', name:'TWDB — HB 500 Water/WW Infrastructure Engineering', agency:'TWDB', city:'Texas', due:'Post-Funding', scope:'TWDB HB 500 Flood Infrastructure Fund — Water/Wastewater infrastructure engineering. Electrical design, instrumentation, control systems.', url:'https://www.twdb.texas.gov/financial/programs/FIF/index.asp', source:'TWDB', status:'prebid' },
  { id:'twdb-007', posted:'2026-01-01', name:'TWDB — Economically Distressed Areas Program (EDAP) Engineering', agency:'TWDB', city:'Texas', due:'Post-Funding', scope:'TWDB EDAP — Engineering services for economically distressed communities. Water/wastewater system design, electrical, instrumentation and SCADA engineering.', url:'https://www.twdb.texas.gov/financial/programs/edap/index.asp', source:'TWDB', status:'prebid' },
];

const MANUAL_BIDS = [
  { id:'seed-1', posted:'2026-08-01', name:'City of Austin — Water & Wastewater Facilities IDIQ', agency:'City of Austin – Austin Water', city:'Austin', due:'Check link', scope:'IDIQ E&I engineering design work assignments at water & wastewater facilities', value:'IDIQ / TBD', status:'active', region:'austin', url:'https://financeonline.austintexas.gov/afo/account_services/solicitation/solicitations.cfm', source:'Manual' },
  { id:'seed-2', posted:'2026-08-01', name:'HCFCD — Harris County Flood Control E&I Engineering', agency:'Harris County Flood Control District', city:'Houston', due:'Check link', scope:'Electrical & Instrumentation engineering for flood control infrastructure', value:'TBD', status:'active', region:'houston', url:'https://www.harriscountyfcd.org/doing-business/professional-services', source:'Manual' },
  { id:'seed-3', posted:'2026-08-01', name:'LNVA — Lower Neches Valley Authority Water Plant SCADA', agency:'Lower Neches Valley Authority', city:'Beaumont, TX', due:'Check link', scope:'SCADA system design and integration for water treatment plant', value:'TBD', status:'active', region:'statewide', url:'https://www.lnva.dst.tx.us/', source:'Manual' },
  { id:'seed-4', posted:'2026-08-01', name:'BVWACS — Brazos Valley Water Authority Controls Engineering', agency:'Brazos Valley Water Authority', city:'Bryan, TX', due:'Check link', scope:'Controls and instrumentation engineering for water authority infrastructure', value:'TBD', status:'active', region:'statewide', url:'https://www.bvwacs.org/', source:'Manual' },
  { id:'seed-5', posted:'2026-08-01', name:'City of Strawn — WTP SCADA & Electrical Engineering (Post-Funding)', agency:'City of Strawn (TWDB HB500)', city:'Strawn, TX', due:'Post-Funding', scope:'SCADA design, alternate power, electrical design for microfilter replacement', value:'~$1,085,000', status:'prebid', region:'statewide', url:'https://www.twdb.texas.gov/financial/programs/WSIG/index.asp', source:'TWDB' },
  { id:'seed-6', posted:'2026-08-01', name:'SAWS — San Antonio Water System E&I Engineering Services', agency:'San Antonio Water System', city:'San Antonio, TX', due:'Check link', scope:'Electrical & Instrumentation engineering services for water and wastewater infrastructure', value:'TBD', status:'active', region:'statewide', url:'https://www.saws.org/business-center/purchasing/', source:'Manual' },
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
    // After seed, delete any FedBids that got in (FedBids managed separately)
    await pool.query("DELETE FROM bids WHERE data->>'source' = 'FedBids'");
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

// FedBids email ingest endpoint — accepts raw email data from Make.com
app.post('/api/bids/fedbids-ingest', async (req, res) => {
  try {
    const body = req.body;
    const subject = body.subject || body.name || 'FedBid Opportunity';
    const emailBody = body.body || body.text || body.snippet || body.content || '';
    const allText = subject + ' ' + emailBody;

    // ── BULLETPROOF DATE PARSER ──────────────────────────────
    const MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
      january:1,february:2,march:3,april:4,june:6,july:7,august:8,september:9,october:10,november:11,december:12 };
    function parseDate(str) {
      if (!str) return '';
      str = str.trim();
      // YYYY-MM-DD
      let m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) return str;
      // MM/DD/YYYY or MM-DD-YYYY
      m = str.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
      if (m) { const yr = m[3].length===2?'20'+m[3]:m[3]; return yr+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0'); }
      // "Month DD, YYYY" or "Month DD YYYY"
      m = str.match(/([a-zA-Z]+)\.?\s+(\d{1,2}),?\s+(\d{4})/i);
      if (m) { const mo = MONTHS[m[1].toLowerCase().slice(0,3)]; if(mo) return m[3]+'-'+String(mo).padStart(2,'0')+'-'+m[2].padStart(2,'0'); }
      // "DD Month YYYY"
      m = str.match(/(\d{1,2})\s+([a-zA-Z]+)\.?\s+(\d{4})/i);
      if (m) { const mo = MONTHS[m[2].toLowerCase().slice(0,3)]; if(mo) return m[3]+'-'+String(mo).padStart(2,'0')+'-'+m[1].padStart(2,'0'); }
      return '';
    }

    // Try to find due date — check body.due first, then search email text
    let due = '';
    if (body.due) { due = parseDate(body.due); }
    if (!due) {
      // Look for "Due:" "Deadline:" "Response Date:" "Closing:" "Due Date:" patterns
      const duePat = allText.match(/(?:due\s*(?:date)?|deadline|response\s*date|closing\s*(?:date)?|solicitation\s*closes?)[:\s]+([^
<]{4,30})/i);
      if (duePat) due = parseDate(duePat[1].trim());
    }
    if (!due) {
      // Scan all text for any date pattern
      const allDates = allText.match(/(?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4})/gi);
      if (allDates && allDates.length > 0) {
        // Pick the latest date (most likely to be the due date)
        const parsed = allDates.map(d => parseDate(d)).filter(Boolean).sort();
        due = parsed[parsed.length - 1] || '';
      }
    }

    // ── URL BUILDER — extract direct bid page URL from email ──
    // Get ALL URLs from email body
    const allUrls = (emailBody.match(/https?:\/\/[^\s<>"\)]+/g) || []);
    // Filter out tracking/unsubscribe/image URLs — keep real bid page URLs
    const skipDomains = ['unsubscribe','tracking','click','open','img','pixel','mail','email','list-manage','mailchimp','constantcontact','sendgrid','fedbidspeed.com/t/','fedbidspeed.com/track'];
    const bidUrls = allUrls.filter(u => !skipDomains.some(s => u.toLowerCase().includes(s)));
    // Prefer non-SAM direct agency portal URLs (sam.gov search is last resort)
    const directUrl = bidUrls.find(u =>
      !u.includes('sam.gov/search') &&
      !u.includes('beta.sam.gov/search') &&
      u.length > 20
    ) || bidUrls[0] || '';
    // Solicitation number from subject
    const solMatch = subject.match(/([A-Z]{1,6}-?[0-9]{2,6}-[A-Z]{1,2}-?[0-9]{4,6})/);
    let rfqUrl;
    if (directUrl && directUrl.startsWith('http')) {
      // Use direct agency portal URL from email — best option
      rfqUrl = directUrl.replace('https://sam.gov/opp/', 'https://beta.sam.gov/opp/');
    } else if (solMatch) {
      rfqUrl = 'https://beta.sam.gov/search?index=opp&keywords=' + encodeURIComponent(solMatch[1]) + '&is_active=true&sort=-modifiedDate';
    } else if (body.url && body.url.startsWith('http')) {
      rfqUrl = body.url;
    } else {
      const kw = subject.replace(/[^a-zA-Z0-9 ]/g,' ').trim().split(/\s+/).slice(0,5).join(' ');
      rfqUrl = 'https://beta.sam.gov/search?index=opp&keywords=' + encodeURIComponent(kw) + '&is_active=true';
    }

    // ── DUPLICATE CHECK — skip if same solicitationNo or name already exists ──
    const dupKey = solMatch ? solMatch[0] : subject;
    const dupCheck = await pool.query(
      "SELECT id FROM bids WHERE data->>'source' = 'FedBids' AND (data->>'solicitationNo' = $1 OR data->>'name' = $2) LIMIT 1",
      [dupKey, subject]
    );
    if (dupCheck.rows.length > 0) {
      console.log('[FedBids Ingest] Duplicate skipped:', dupKey);
      return res.json({ success: true, skipped: true, reason: 'Duplicate bid already exists', key: dupKey });
    }

    const bid = {
      id: 'fedbid-' + Date.now(),
      name: subject,
      agency: body.agency || body.from || body.sender || 'FedBidSpeed',
      city: body.city || 'Texas',
      posted: body.posted || new Date().toISOString().split('T')[0],
      due: due || 'Check Link',
      scope: (emailBody || subject).substring(0, 500),
      url: rfqUrl,
      solicitationNo: body.solicitationNo || solMatch ? solMatch[0] : '',
      location: body.location || body.city || 'Texas',
      responseDate: due || body.responseDate || '',
      setAside: body.setAside || 'See Solicitation',
      source: 'FedBids',
      value: body.value || 'TBD',
      status: 'active',
      region: 'texas',
      scrapedAt: new Date().toISOString()
    };
    await saveBid(bid);
    res.json({ success: true, bid });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Fix ALL FedBids URLs in DB to use BidSpeed
// Fix ALL FedBids URLs in DB to use SAM.gov search with sol number
app.get('/api/fix-fedbids-urls', async (req, res) => {
  try {
    const fixes = [
      { id:'fedbid-001', url:'https://sam.gov/search?index=opp&q=N4008524R2674&is_active=true',    sol:'N4008524R2674' },
      { id:'fedbid-002', url:'https://sam.gov/search?index=opp&q=CLMP395A&is_active=true',         sol:'RFQS-6100-CLMP395A' },
      { id:'fedbid-003', url:'https://sam.gov/search?index=opp&q=GTG3007&is_active=true',          sol:'RFP-2200-GTG3007' },
      { id:'fedbid-004', url:'https://sam.gov/search?index=opp&q=MMH3047&is_active=true',          sol:'RFP-1100-MMH3047' },
      { id:'fedbid-005', url:'https://sam.gov/search?index=opp&q=CLMP400&is_active=true',          sol:'RFQS-6100-CLMP400' },
    ];
    let total = 0;
    for (const fix of fixes) {
      const r = await pool.query(
        `UPDATE bids SET data = jsonb_set(jsonb_set(data,'{url}',to_jsonb($1::text)),'{solicitationNo}',to_jsonb($2::text)) WHERE data->>'id'=$3`,
        [fix.url, fix.sol, fix.id]
      );
      total += r.rowCount;
    }
    res.json({ success:true, fixed:total, message: total+' FedBid URLs fixed to SAM.gov search' });
  } catch(e) { res.status(500).json({error:e.message}); }
});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Fix existing FedBids with missing due dates — set to 'Check Link'
app.get('/api/fix-fedbids-dates', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE bids
       SET data = jsonb_set(data, '{due}', '"Check Link"')
       WHERE data->>'source' = 'FedBids'
       AND (data->>'due' IS NULL OR data->>'due' = '' OR data->>'due' = 'undefined')`
    );
    res.json({ success: true, fixed: result.rowCount, message: result.rowCount + ' FedBids due dates fixed' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Deduplicate FedBids — aggressive: delete ALL then reseed 5 clean bids
app.get('/api/dedupe-fedbids', async (req, res) => {
  try {
    // Step 1: Nuke ALL FedBids
    const del = await pool.query("DELETE FROM bids WHERE data->>'source' = 'FedBids'");

    // Step 2: Reseed only 5 verified open bids
    const clean5 = [
      { id:'fedbid-001', name:'NAVFAC Mid-Atlantic — IDIQ A-E MEP & SCADA Engineering (N4008524R2674)', agency:'Naval Facilities Engineering Systems Command (NAVFAC) Mid-Atlantic', city:'NC / SC / Nationwide', posted:'2026-07-15', due:'2026-09-15', solicitationNo:'N4008524R2674', location:'MCAS Cherry Point, Camp Lejeune NC / MCAS Beaufort, MCRD Parris Island SC', responseDate:'2026-09-15', setAside:'Total Small Business Set-Aside (NAICS 541330)', scope:'IDIQ A-E multi-discipline: SCADA, cybersecurity, LAN, control systems, electrical, mechanical, plumbing, fire protection. 5-year IDIQ. NAVFAC Mid-Atlantic Marine Corps installations.', url:'https://sam.gov/search?index=opp&q=N4008524R2674&is_active=true', source:'FedBids', value:'$60M IDIQ', status:'active', region:'statewide', userState:'active' },
      { id:'fedbid-002', name:'City of Austin — Northeast WWTP Expansions (RFQS-6100-CLMP395A)', agency:'City of Austin — Austin Water Department', city:'Austin, TX', posted:'2026-07-15', due:'2026-09-03', solicitationNo:'RFQS-6100-CLMP395A', location:'Austin, TX', responseDate:'2026-09-03', setAside:'Open Competition', scope:'Expansion of Wildhorse, Pearce Lane and Taylor Lane wastewater treatment plants. Electrical, instrumentation, controls, SCADA upgrades.', url:'https://sam.gov/search?index=opp&q=CLMP395A&is_active=true', source:'FedBids', value:'TBD', status:'active', region:'texas', userState:'active' },
      { id:'fedbid-003', name:'City of Austin — Enterprise Asset Management EAM CMMS Austin Water (RFP-2200-GTG3007)', agency:'City of Austin — Austin Water Department', city:'Austin, TX', posted:'2026-07-20', due:'2026-09-10', solicitationNo:'RFP-2200-GTG3007', location:'Austin, TX', responseDate:'2026-09-10', setAside:'Open Competition', scope:'Cloud-based EAM/CMMS for Austin Water. SCADA integration, asset reliability, data-driven decision-making across water and wastewater infrastructure.', url:'https://sam.gov/search?index=opp&q=GTG3007&is_active=true', source:'FedBids', value:'TBD', status:'active', region:'texas', userState:'active' },
      { id:'fedbid-004', name:'City of Austin — Large Industrial Motors Repairs Austin Energy Austin Water (RFP-1100-MMH3047)', agency:'City of Austin — Austin Energy & Austin Water', city:'Austin, TX', posted:'2026-07-10', due:'2026-09-17', solicitationNo:'RFP-1100-MMH3047', location:'Austin, TX', responseDate:'2026-09-17', setAside:'Open Competition', scope:'Maintenance, repair, overhaul and rewinding of large industrial motors for Austin Energy and Austin Water pumping stations and treatment facilities.', url:'https://sam.gov/search?index=opp&q=MMH3047&is_active=true', source:'FedBids', value:'TBD', status:'active', region:'texas', userState:'active' },
      { id:'fedbid-005', name:'City of Austin — Gilleland Wastewater Interceptor Construction (RFQS-6100-CLMP400)', agency:'City of Austin — Austin Water Department', city:'Austin, TX', posted:'2026-08-01', due:'2026-09-24', solicitationNo:'RFQS-6100-CLMP400', location:'Austin, TX — Western Gilleland Basin', responseDate:'2026-09-24', setAside:'Open Competition', scope:'Construction of approximately 7,730 LF of 30-inch and 7,610 LF of 36-inch gravity interceptor. Electrical, instrumentation, controls, SCADA integration.', url:'https://sam.gov/search?index=opp&q=CLMP400&is_active=true', source:'FedBids', value:'TBD', status:'active', region:'texas', userState:'active' },
    ];
    let seeded = 0;
    for (const b of clean5) {
      await pool.query("INSERT INTO bids (data) VALUES ($1)", [JSON.stringify({...b, scrapedAt:new Date().toISOString()})]);
      seeded++;
    }
    res.json({ success:true, deleted:del.rowCount, seeded, message:`Deleted ${del.rowCount} duplicate FedBids — reseeded ${seeded} clean bids` });
  } catch(e) { res.status(500).json({error:e.message}); }
});

// Clean all FedBids from DB — delete everything and reseed only 5 verified bids
app.get('/api/clean-fedbids', async (req, res) => {
  try {
    // Step 1: Delete ALL FedBids from DB (including all duplicates)
    const del = await pool.query("DELETE FROM bids WHERE data->>'source' = 'FedBids'");
    console.log('[CleanFedBids] Deleted all:', del.rowCount, 'FedBids');
    console.log('[CleanFedBids] Deleted', del.rowCount, 'FedBids');

    // Step 2: Reseed only the 5 verified open bids
    const verifiedBids = [
      { id:'fedbid-001', name:'NAVFAC Mid-Atlantic — IDIQ A-E MEP & SCADA Engineering (N4008524R2674)', agency:'Naval Facilities Engineering Systems Command (NAVFAC) Mid-Atlantic — US Navy', city:'NC / SC / Nationwide', posted:'2026-07-15', due:'2026-09-15', solicitationNo:'N4008524R2674', location:'MCAS Cherry Point, Camp Lejeune NC / MCAS Beaufort, MCRD Parris Island SC', responseDate:'2026-09-15', setAside:'Total Small Business Set-Aside (NAICS 541330)', scope:'IDIQ A-E multi-discipline: SCADA, cybersecurity, LAN, control systems, electrical, mechanical, plumbing, fire protection. 5-year IDIQ. NAVFAC Mid-Atlantic Marine Corps installations.', url:'https://sam.gov/search?index=opp&q=N4008524R2674&is_active=true', source:'FedBids', value:'$60M IDIQ', status:'active', region:'statewide' },
      { id:'fedbid-002', name:'City of Austin — Northeast WWTP Expansions Wildhorse Pearce Lane Taylor Lane (RFQS-6100-CLMP395A)', agency:'City of Austin — Austin Water Department', city:'Austin, TX', posted:'2026-07-15', due:'2026-09-03', solicitationNo:'RFQS-6100-CLMP395A', location:'Austin, TX — Wildhorse, Pearce Lane, Taylor Lane WWTP Sites', responseDate:'2026-09-03', setAside:'Open Competition', scope:'Expansion of Wildhorse, Pearce Lane and Taylor Lane wastewater treatment plants. Electrical, instrumentation, controls, SCADA upgrades, civil and process engineering.', url:'https://sam.gov/search?index=opp&q=CLMP395A&is_active=true', source:'FedBids', value:'TBD', status:'active', region:'texas' },
      { id:'fedbid-003', name:'City of Austin — Enterprise Asset Management EAM CMMS for Austin Water (RFP-2200-GTG3007)', agency:'City of Austin — Austin Water Department', city:'Austin, TX', posted:'2026-07-20', due:'2026-09-10', solicitationNo:'RFP-2200-GTG3007', location:'Austin, TX — Austin Water Department', responseDate:'2026-09-10', setAside:'Open Competition', scope:'Cloud-based EAM/CMMS for Austin Water. Replace existing asset management platforms. SCADA integration, asset reliability, data-driven decision-making across water and wastewater infrastructure.', url:'https://sam.gov/search?index=opp&q=GTG3007&is_active=true', source:'FedBids', value:'TBD', status:'active', region:'texas' },
      { id:'fedbid-004', name:'City of Austin — Large Industrial Motors Repairs Austin Energy Austin Water (RFP-1100-MMH3047)', agency:'City of Austin — Austin Energy & Austin Water', city:'Austin, TX', posted:'2026-07-10', due:'2026-09-17', solicitationNo:'RFP-1100-MMH3047', location:'Austin, TX — Austin Energy & Austin Water Facilities', responseDate:'2026-09-17', setAside:'Open Competition', scope:'Maintenance, repair, overhaul and rewinding of large industrial motors for Austin Energy and Austin Water pumping stations, water treatment and wastewater treatment facilities.', url:'https://sam.gov/search?index=opp&q=MMH3047&is_active=true', source:'FedBids', value:'TBD', status:'active', region:'texas' },
      { id:'fedbid-005', name:'City of Austin — Gilleland Wastewater Interceptor Construction (RFQS-6100-CLMP400)', agency:'City of Austin — Austin Water Department', city:'Austin, TX', posted:'2026-08-01', due:'2026-09-24', solicitationNo:'RFQS-6100-CLMP400', location:'Austin, TX — Western Gilleland Basin', responseDate:'2026-09-24', setAside:'Open Competition', scope:'Construction of approximately 7,730 LF of 30-inch gravity interceptor and 7,610 LF of 36-inch gravity interceptor in the Western Gilleland Basin. Electrical, instrumentation, controls, SCADA integration.', url:'https://sam.gov/search?index=opp&q=CLMP400&is_active=true', source:'FedBids', value:'TBD', status:'active', region:'texas' },
    ];

    let seeded = 0;
    for (const bid of verifiedBids) {
      await pool.query(
        "INSERT INTO bids (data) VALUES ($1) ON CONFLICT DO NOTHING",
        [JSON.stringify({ ...bid, userState:'active', scrapedAt: new Date().toISOString() })]
      );
      seeded++;
    }

    res.json({ success: true, deleted: del.rowCount, seeded, message: `Deleted ${del.rowCount} FedBids, reseeded ${seeded} verified bids` });
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

    // Step 1a: FedBids only — permanently delete when due date is 4 days or less away
    // i.e. delete when due date < today + 4 days
    const fedExpired = await pool.query(
      `DELETE FROM bids
       WHERE data->>'source' = 'FedBids'
       AND data->>'due' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       AND (data->>'due')::date < (CURRENT_DATE + INTERVAL '4 days')`
    );
    if (fedExpired.rowCount > 0) console.log('[FedBids] Auto-deleted', fedExpired.rowCount, 'FedBids due within 4 days');

    // Step 1b: All other sources — move expired bids to deleted tab
    const expired = await pool.query(
      `UPDATE bids 
       SET data = jsonb_set(jsonb_set(data, '{userState}', 'deleted'), '{deletedAt}', to_jsonb($1::text))
       WHERE data->>'status' != 'prebid'
       AND data->>'source' != 'TWDB'
       AND data->>'source' != 'FedBids'
       AND data->>'userState' != 'deleted'
       AND data->>'userState' != 'selected'
       AND data->>'due' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       AND (data->>'due')::date < CURRENT_DATE`,
      [today]
    );
    if (expired.rowCount > 0) console.log('[AutoExpire] Moved', expired.rowCount, 'expired bids to deleted');

    // Step 2: Permanently purge deleted bids after 14 days
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
initDB().then(async () => {
  // On every startup: wipe all FedBids and reseed exactly 5 clean verified bids
  await cleanFedBidsOnStartup();
  setTimeout(autoFetchNewBids, 15000);
  setTimeout(autoExpireAndClean, 20000);
}).catch(err => console.error('[DB] Init failed:', err.message));
