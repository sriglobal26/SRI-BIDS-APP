const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json({limit:'5mb'}));
app.use(express.urlencoded({extended:true,limit:'5mb'}));
app.use(express.static(path.join(__dirname)));

if(!process.env.DATABASE_URL) console.error('[DB] WARNING: DATABASE_URL is not set - link the Postgres service to this service in Railway (Variables tab).');
let usingSsl = true;
function makePool(ssl){
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: ssl ? {rejectUnauthorized:false} : false,
    max:3, idleTimeoutMillis:30000, connectionTimeoutMillis:15000
  });
}
let pool = makePool(true);

const SEED_BIDS = [
      { id:'fedbid-007', name:'USIBWC — SCADA Lifecycle Support Services (W912BV-26-R-0012)', agency:'US International Boundary and Water Commission', city:'El Paso, TX', posted:'2026-08-01', due:'2026-09-30', solicitationNo:'W912BV-26-R-0012', responseDate:'2026-09-30', setAside:'Small Business', scope:'SCADA Lifecycle Support for water infrastructure. Instrumentation, controls, PLC/HMI maintenance and upgrades along US-Mexico border.', url:'https://sam.gov/opp/86f857e87eaa41e5aed1eebce062e685/view', source:'FedBids', value:'TBD', status:'active', region:'statewide', userState:'active', category:'SCADA' },
      { id:'fedbid-008', name:'NAVFAC SW — Wastewater Treatment Plant E&I Upgrades (N6247326R0012)', agency:'Naval Facilities Engineering Systems Command Southwest', city:'San Diego, CA / Nationwide', posted:'2026-08-20', due:'2026-10-15', solicitationNo:'N6247326R0012', responseDate:'2026-10-15', setAside:'Small Business', scope:'Electrical and instrumentation upgrades to WWTP. Motor control centers, switchgear, instrumentation, SCADA integration, controls, commissioning.', url:'https://sam.gov/search?index=opp&q=N6247326R0012&is_active=true', source:'FedBids', value:'TBD', status:'active', region:'statewide', userState:'active', category:'Electrical' },
      { id:'fedbid-009', name:'Army Corps of Engineers — Water Treatment SCADA & Controls IDIQ (W912P6-26-R-0045)', agency:'US Army Corps of Engineers (USACE)', city:'Nationwide', posted:'2026-08-15', due:'2026-10-01', solicitationNo:'W912P6-26-R-0045', responseDate:'2026-10-01', setAside:'Total Small Business', scope:'IDIQ for water treatment plant SCADA and controls upgrades. Electrical, instrumentation, PLC/HMI programming, SCADA integration, startup and commissioning.', url:'https://sam.gov/search?index=opp&q=W912P6-26-R-0045&is_active=true', source:'FedBids', value:'TBD', status:'active', region:'statewide', userState:'active', category:'Water' },
  { id:'ebn-882894', name:'City of Liberty Hill — North Fork WWTP Improvements (882894)', agency:'City of Liberty Hill', city:'Liberty Hill, TX', posted:'2026-09-04', due:'2026-10-15', solicitationNo:'882894', scope:'Addenda 1-2, Due Date Extended — North Fork Wastewater Treatment Plant Improvements. New primary and secondary headworks, MBR treatment process, electrical systems, instrumentation and controls, SCADA integration. 6 bid specifications available. Est. construction value $15M+. Search Bid #882894 in EnviroBidNet for full plans and specifications.', url:'https://www.envirobidnet.com', source:'EnviroBidNet', value:'~$15M', status:'active', region:'texas' },
  { id:'h2bid-005', name:'City of Houston — Sims North WWTP Improvements Package 3 (CB-2026-0022)', agency:'H2bid', city:'Houston, TX', posted:'2026-04-01', due:'2026-09-25', scope:'Comprehensive improvements at Sims North WWTP. Main Electrical Building, Thickened Sludge Electrical Building, mechanical systems. Est. $15M. Site Visit: 05/27/2026. FEMA reimbursement. Houston Public Works.', url:'https://www.beaconbid.com/solicitations/city-of-houston/d970dd10-3342-4999-b71c-c31d88edf5a8/sims-north-wastewater-treatment-plant-improvements-package', source:'H2bid' },
  { id:'h2bid-007', name:'City of Houston — East Water Purification Plant (EWPP) Mechanical & Electrical Improvements', agency:'H2bid', city:'Houston, TX', posted:'2026-01-16', due:'2026-10-01', scope:'East Water Purification Plant — mechanical and electrical improvements. Electrical systems, instrumentation upgrades. Posted: 01/16/2026. Houston Public Works.', url:'https://www.beaconbid.com/solicitations/city-of-houston/a14610b8-d60a-4d4a-be27-bd9c490eaf7c/east-water-purification-plant-ewpp-mechanical-and-electrical-improvements-for-plants-and', source:'H2bid' },
  // New H2bid bids added Aug 25 2026
  { id:'h2bid-017', name:'City of Houston — Professional Engineering Services Regulatory Compliance Support Various WWTP Facilities (RFQ-2026-HPW)', agency:'City of Houston Public Works & Engineering', city:'Houston, TX', posted:'2026-08-25', due:'2026-10-01', scope:'Professional Engineering Services for regulatory permitting and compliance at various WWTP facilities. TPDES permit renewals and amendments, storm water and air permitting support, laboratory testing coordination, pretreatment and regulatory compliance programs.', url:'https://www.beaconbid.com/solicitations/city-of-houston/bdccdb58-0dc2-45dc-9e43-d1c35f2d8b40/professional-engineering-services-for-regulatory-compliance-support-at-various-wastewater-facilities', source:'H2bid', value:'TBD', status:'active', region:'houston' },
  { id:'h2bid-016', name:'City of Houston — On-Call Electrical Repair & Replacement Services Water/WW Facilities (CB-2026-0049)', agency:'City of Houston Public Works & Engineering', city:'Houston, TX', posted:'2026-08-15', due:'2026-09-25', scope:'On-call electrical repair and replacement services at water and wastewater treatment facilities. Includes motor control centers, switchgear, transformers, panels, wiring, conduit, instrumentation, controls, SCADA integration. Est. value $5M.', url:'https://www.beaconbid.com/solicitations/city-of-houston/open', source:'H2bid', value:'~$5,000,000', status:'active', region:'houston' },
  { id:'h2bid-015', name:'City of Austin — Gilleland Wastewater Interceptor Construction (RFQS-6100-CLMP400)', agency:'City of Austin — Austin Water Department', city:'Austin, TX', posted:'2026-08-01', due:'2026-09-24', scope:'Construction of 7,730 LF of 30-inch and 7,610 LF of 36-inch gravity interceptor in the Western Gilleland Basin. Electrical, instrumentation, controls, SCADA integration.', url:'https://financeonline.austintexas.gov/afo/account_services/solicitation/solicitation_details.cfm?sid=144532', source:'H2bid', value:'TBD', status:'active', region:'texas' },
  { id:'civcast-003', name:'HPW — Transportation & Drainage Bridge Rehabilitation Program', agency:'CivCast', city:'Houston, TX', posted:'2026-07-15', due:'2026-09-25', scope:'Houston Public Works — Transportation and Drainage Operations Bridge Rehabilitation and Replacement Program.', url:'https://app.civcast.com/bid-opportunities/projects', source:'CivCast' },
  { id:'civcast-004', name:'Trinity River Authority — RFQ Professional Engineering FY 2027-2028', agency:'CivCast', city:'Arlington, TX', posted:'2026-07-15', due:'2026-10-01', scope:'Trinity River Authority of Texas RFQ for Professional Engineering Services FY 2027-2028. Electrical, instrumentation, SCADA design.', url:'https://www.civcastusa.com/publishers/5d6017908289a31a1c7febe1', source:'CivCast' },
  { id:'civcast-005', name:'HCMUD No. 525 — Water Plant No. 1 Expansion Sundance Cove', agency:'CivCast', city:'Harris County, TX', posted:'2026-08-01', due:'2026-10-10', scope:'Harris County MUD No. 525 — Water Plant No. 1 Expansion to serve Sundance Cove subdivision. Water treatment plant engineering.', url:'https://app.civcast.com/bid-opportunities/projects', source:'CivCast' },
  { id:'civcast-006', name:'City of Pflugerville — WW2401 Gilleland Creek WW Interceptor (RFP 2026-023)', agency:'CivCast', city:'Pflugerville, TX', posted:'2026-08-01', due:'2026-10-20', scope:'City of Pflugerville RFP No. 2026-023 — WW2401 Gilleland Creek Wastewater Interceptor Engineering Design Services.', url:'https://app.civcast.com/bid-opportunities/projects', source:'CivCast' },
  { id:'civcast-007', name:'Quiddity Engineering — Water Treatment E&I Engineering Services Texas', agency:'CivCast', city:'Texas', posted:'2026-08-01', due:'2026-10-30', scope:'Quiddity Engineering Texas — Water Treatment Electrical & Instrumentation Engineering Services for Texas water utilities.', url:'https://www.civcastusa.com/publishers/5867827b01ec5a264c779277', source:'CivCast' },
  { id:'esbd-001', name:'TDCJ — Wainwright Unit Wastewater Treatment Plant (696-FD-26-P007)', agency:'TX ESBD', city:'Lovelady, TX', posted:'2026-06-01', due:'2026-10-15', scope:'TDCJ construct new 2 MGD WW Treatment Plant at Wainwright Unit. NIGP: 91359,91391,93677-Substation/High Voltage Electrical,96895. Amendment A-003 posted 07/31/2026. Amendment A-002 posted 06/29/2026. Solicitation: 696-FD-26-P007. Source: txsmartbuy.gov/esbd/696-FD-26-P007.', url:'https://www.txsmartbuy.gov/esbd/696-FD-26-P007', source:'TX ESBD' },
  { id:'esbd-002', name:'TWC — Open Enrollment Orientation & Mobility Services Statewide (3202600155)', agency:'TX ESBD', city:'Austin, TX', posted:'2026-05-28', due:'2026-11-24', scope:'Texas Workforce Commission Open Enrollment for Orientation and Mobility Services statewide. Status: Addendum Posted. Contact: Meghan Osborn (737)295-0326. procurement.oe@twc.texas.gov. Posting Date: 05/28/2026. Response Due: 11/24/2026 at 10:00 AM.', url:'https://www.txsmartbuy.gov/esbd/3202600155', source:'TX ESBD' },
  { id:'esbd-005', name:'UT Austin — Water Feature VFD Pump & PLC/DMX Control Systems (26PSS001)', agency:'TX ESBD', city:'Austin, TX', posted:'2026-05-15', due:'2026-09-30', scope:'UT Austin — VFD-controlled pumps, PLC/DMX control systems, filtration, UV infrastructure commissioning. Instrumentation & Controls. Contact: trina.bickford@austin.utexas.edu. Posting Date: 05/15/2026. Due: 09/30/2026.', url:'https://www.txsmartbuy.gov/esbd/26PSS001', source:'TX ESBD' },
  { id:'esbd-006', name:'Texas A&M — Professional Engineering Services RFP (TAMUS-RFP-02-3452)', agency:'TX ESBD', city:'College Station, TX', posted:'2026-06-15', due:'2026-10-01', scope:'Texas A&M University System Professional Services RFP for Engineering. Structural, electrical, instrumentation. Contact: dwilkinson@tamus.edu. Posting Date: 06/15/2026. Due: 10/01/2026.', url:'https://www.txsmartbuy.gov/esbd/TAMUS-RFP-02-3452', source:'TX ESBD' },
  { id:'esbd-007', name:'TPWD — Electrical Construction IDIQ Services Statewide (2025-ElectricConstruct-IDIQ)', agency:'TX ESBD', city:'Austin, TX', posted:'2026-07-01', due:'2026-11-01', scope:'Texas Parks & Wildlife — Multiple Award IDIQ for electrical construction, repairs and replacements statewide. NIGP: 914-38. Solicitation: 2025-ElectricConstruct-IDIQ. Posting Date: 07/01/2026. Due: 11/01/2026.', url:'https://www.txsmartbuy.gov/esbd/2025-ElectricConstruct-IDIQ', source:'TX ESBD' },
  { id:'twdb-001', posted:'2026-01-01', name:'TWDB — Water System Improvements CDBG-MIT Engineering (Karnes City)', agency:'TWDB', city:'Karnes City, TX', due:'Post-Funding', scope:'TWDB CDBG-MIT Water System Improvements — Replace 9,725 LF of existing water lines. Engineering design, electrical and instrumentation.', url:'https://www.twdb.texas.gov/financial/programs/CWSRF/index.asp', source:'TWDB', status:'prebid' },
  { id:'twdb-002', posted:'2026-01-01', name:'TWDB — Drinking Water State Revolving Fund Engineering Services', agency:'TWDB', city:'Texas', due:'Post-Funding', scope:'TWDB DWSRF — Engineering services for water system improvements, electrical upgrades, instrumentation and controls for Texas water utilities.', url:'https://www.twdb.texas.gov/financial/programs/DWSRF/index.asp', source:'TWDB', status:'prebid' },
  { id:'twdb-003', posted:'2026-01-01', name:'TWDB — Clean Water State Revolving Fund Wastewater Engineering', agency:'TWDB', city:'Texas', due:'Post-Funding', scope:'TWDB CWSRF — Wastewater treatment plant engineering, electrical and instrumentation design, SCADA systems for Texas utilities.', url:'https://www.twdb.texas.gov/financial/programs/CWSRF/index.asp', source:'TWDB', status:'prebid' },
  { id:'twdb-004', posted:'2026-01-01', name:'TWDB — State Water Implementation Fund Texas (SWIFT) Projects', agency:'TWDB', city:'Texas', due:'Post-Funding', scope:'TWDB SWIFT Program — Engineering design services for major water supply projects. E&I engineering, pump stations, treatment facilities.', url:'https://www.twdb.texas.gov/financial/programs/swift/index.asp', source:'TWDB', status:'prebid' },
  { id:'twdb-005', posted:'2026-01-01', name:'TWDB — Regional Water Planning Engineering Services', agency:'TWDB', city:'Texas', due:'Post-Funding', scope:'TWDB Regional Water Planning Group engineering and professional services. Water supply infrastructure design, E&I engineering.', url:'https://www.twdb.texas.gov/waterplanning/rwp/index.asp', source:'TWDB', status:'prebid' },
  { id:'twdb-006', posted:'2026-01-01', name:'TWDB — HB 500 Water/WW Infrastructure Engineering', agency:'TWDB', city:'Texas', due:'Post-Funding', scope:'TWDB HB 500 Flood Infrastructure Fund — Water/Wastewater infrastructure engineering. Electrical design, instrumentation, control systems.', url:'https://www.twdb.texas.gov/financial/programs/FIF/index.asp', source:'TWDB', status:'prebid' },
  { id:'twdb-007', posted:'2026-01-01', name:'TWDB — Economically Distressed Areas Program (EDAP) Engineering', agency:'TWDB', city:'Texas', due:'Post-Funding', scope:'TWDB EDAP — Engineering services for economically distressed communities. Water/wastewater system design, electrical, instrumentation and SCADA engineering.', url:'https://www.twdb.texas.gov/financial/programs/edap/index.asp', source:'TWDB', status:'prebid' },
  { id:'seed-1', posted:'2026-08-01', name:'City of Austin — Water & Wastewater Facilities IDIQ', agency:'City of Austin – Austin Water', city:'Austin', due:'Check link', scope:'IDIQ E&I engineering design work assignments at water & wastewater facilities', value:'IDIQ / TBD', status:'active', region:'austin', url:'https://financeonline.austintexas.gov/afo/account_services/solicitation/solicitations.cfm', source:'Manual' },
  { id:'seed-2', posted:'2026-08-01', name:'HCFCD — Harris County Flood Control E&I Engineering', agency:'Harris County Flood Control District', city:'Houston', due:'Check link', scope:'Electrical & Instrumentation engineering for flood control infrastructure', value:'TBD', status:'active', region:'houston', url:'https://www.harriscountyfcd.org/doing-business/professional-services', source:'Manual' },
  { id:'seed-3', posted:'2026-08-01', name:'LNVA — Lower Neches Valley Authority Water Plant SCADA', agency:'Lower Neches Valley Authority', city:'Beaumont, TX', due:'Check link', scope:'SCADA system design and integration for water treatment plant', value:'TBD', status:'active', region:'statewide', url:'https://www.lnva.dst.tx.us/', source:'Manual' },
  { id:'seed-4', posted:'2026-08-01', name:'BVWACS — Brazos Valley Water Authority Controls Engineering', agency:'Brazos Valley Water Authority', city:'Bryan, TX', due:'Check link', scope:'Controls and instrumentation engineering for water authority infrastructure', value:'TBD', status:'active', region:'statewide', url:'https://www.bvwacs.org/', source:'Manual' },
  { id:'seed-5', posted:'2026-08-01', name:'City of Strawn — WTP SCADA & Electrical Engineering (Post-Funding)', agency:'City of Strawn (TWDB HB500)', city:'Strawn, TX', due:'Post-Funding', scope:'SCADA design, alternate power, electrical design for microfilter replacement', value:'~$1,085,000', status:'prebid', region:'statewide', url:'https://www.twdb.texas.gov/financial/programs/WSIG/index.asp', source:'TWDB' },
  { id:'seed-7', name:'SAWS — Walden Height Booster Station Improvements & W Grosenbacher Rd Pressure Reducing Valve (PS-00188-YR)', agency:'San Antonio Water System (SAWS)', city:'San Antonio, TX', posted:'2026-08-01', due:'2026-09-30', scope:'Improvements to Walden Height Booster Station including electrical, instrumentation, controls, and pressure reducing valve improvements on W Grosenbacher Rd. Pumping station electrical and controls upgrade scope.', url:'https://apps.saws.org/business_center/ContractSol/', source:'Manual', value:'TBD', status:'active', region:'texas' },
  { id:'seed-6', posted:'2026-08-01', name:'SAWS — San Antonio Water System E&I Engineering Services', agency:'San Antonio Water System', city:'San Antonio, TX', due:'Check link', scope:'Electrical & Instrumentation engineering services for water and wastewater infrastructure', value:'TBD', status:'active', region:'statewide', url:'https://www.saws.org/business-center/purchasing/', source:'Manual' },
  // ── Added Nov 24 2026 — open bids found on the source sites (confirm scope/dates on the link before bidding) ──
  { id:'h2bid-920310', name:'Irrigation Pump Station No. 1 and No. 2 Reuse System (H2bid #920310)', agency:'H2bid listing — Texas (owner shown on H2bid)', city:'Texas', posted:'2026-11-24', due:'2026-12-11', scope:'Texas pump station / reuse system project listed on H2bid (ID 920310), closing 12/11/2026. Open the link, search the ID for owner, scope and documents — check for electrical and instrumentation scope.', url:'https://h2bid.com/Bids/BidsSearchPreview?keyword=Irrigation%20Pump%20Station%20Reuse', source:'H2bid', value:'TBD', status:'active', region:'statewide' },
  { id:'h2bid-houston-rfq-2026-0010', name:'City of Houston — Pre-Qualification Pool for Professional Engineering Services (RFQ-2026-0010)', agency:'City of Houston Public Works', city:'Houston, TX', posted:'2026-11-24', due:'2026-12-03', scope:'Houston Public Works pre-qualification pool for professional engineering services, E-Bid due 12/3/2026. Getting into the pool is how firms get Houston WWTP / water E&I task orders. Confirm requirements on BeaconBid.', url:'https://www.beaconbid.com/solicitations/city-of-houston/open', source:'H2bid', value:'Pool', status:'active', region:'houston' },
  { id:'civcast-20W09161', name:'City of Bay City — North Water Treatment Plant (ID 20W09161)', agency:'City of Bay City, TX', city:'Bay City, TX', posted:'2026-11-24', due:'2026-12-16', scope:'Construction of the North Water Treatment Plant: site work, well and well pump, two ground storage tanks, booster pump station and related work. Competitive sealed proposals; pre-bid was 11/18/2026; bid opening 12/16/2026 at City Hall. Look for electrical / instrumentation subcontract scope.', url:'https://app.civcast.com/bid-opportunities/projects/6aea16db251dba42419c9995', source:'CivCast', value:'TBD', status:'active', region:'statewide' },
];

async function saveBid(bid) {
  const id = bid.id || ('bid-'+Date.now());
  bid.id = id;
  await pool.query(
    'INSERT INTO bids(id,data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=$2',
    [id, JSON.stringify(bid)]
  );
}

// The tables are created/seeded once, but if the database is not reachable yet at startup
// (Railway starts the web service before Postgres is ready) the old code gave up forever and
// the app showed no bids. Now every /api request waits for the DB, and startup retries until it works.
let dbReady = false, dbInit = null, lastDbError = null;
function ensureDB() {
  if(dbReady) return Promise.resolve();
  if(!dbInit) {
    dbInit = initDB().then(() => { dbReady = true; }).finally(() => { dbInit = null; });
  }
  return dbInit;
}
app.use('/api', async (req,res,next) => {
  try { await ensureDB(); next(); }
  catch(e) { res.status(503).json({error:'Database not ready: '+e.message}); }
});
async function initDBWithRetry(attempt) {
  try {
    await ensureDB();
    console.log('[DB] Connected and ready');
  } catch(e) {
    lastDbError = e.message;
    console.error('[DB] init failed (attempt '+attempt+'):', e.message);
    // Some databases (e.g. Railway private network) do not support SSL - fall back once.
    if(usingSsl && /does not support SSL|SSL/i.test(e.message) && !/self.signed|certificate/i.test(e.message)) {
      usingSsl = false;
      try { await pool.end(); } catch(_) {}
      pool = makePool(false);
      console.log('[DB] Retrying without SSL');
    }
    setTimeout(() => initDBWithRetry(attempt+1), Math.min(30000, 3000*attempt));
  }
}

// Adds any bid from SEED_BIDS that is not in the database yet and has not expired.
// Never overwrites an existing row (so Selected / Deleted choices are kept) and never
// re-adds expired seeds (so purged bids do not keep coming back).
function seedStillOpen(b) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(b.due||''));
  if(!m) return true;
  return new Date(m[1]+'-'+m[2]+'-'+m[3]+'T23:59:59') >= new Date();
}
async function seedMissing() {
  let added = 0;
  for(const b of SEED_BIDS) {
    if(!seedStillOpen(b)) continue;
    const bid = {...b, scrapedAt:new Date().toISOString()};
    const r = await pool.query('INSERT INTO bids(id,data) VALUES($1,$2) ON CONFLICT(id) DO NOTHING', [b.id, JSON.stringify(bid)]);
    added += r.rowCount || 0;
  }
  if(added) console.log('[DB] Added', added, 'new seed bids');
}

async function initDB() {
  await pool.query(`CREATE TABLE IF NOT EXISTS bids(
    id TEXT PRIMARY KEY, data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  const cnt = await pool.query('SELECT COUNT(*) FROM bids');
  if(parseInt(cnt.rows[0].count)===0) {
    for(const b of SEED_BIDS) await saveBid({...b, scrapedAt:new Date().toISOString()});
    console.log('[DB] Seeded', SEED_BIDS.length, 'bids');
  } else {
    console.log('[DB] Ready. Bids:', cnt.rows[0].count);
    await seedMissing();
  }
}

app.get('/health', (req,res) => res.json({status:'ok'}));

// Open /status in the browser to see why bids are (or are not) showing.
// Works even when the database is down, so it can say what is wrong.
app.get('/status', async (req,res) => {
  const out = { server:'ok', version:(process.env.RAILWAY_GIT_COMMIT_SHA||'unknown').slice(0,7), time:new Date().toISOString(), hasDatabaseUrl:!!process.env.DATABASE_URL, dbReady, usingSsl, lastDbError };
  try {
    const r = await pool.query('SELECT data FROM bids');
    const now = Date.now();
    out.totalInDatabase = r.rows.length;
    out.bySource = {};
    for(const row of r.rows) {
      const d = row.data || {};
      const src = d.source || 'unknown';
      const o = out.bySource[src] || (out.bySource[src] = {open:0, expiredOrDeleted:0});
      const due = parseDueServer(d.due);
      const expired = !(d.userState==='selected' || d.source==='TWDB' || d.status==='prebid') && due && due.getTime() < now;
      if(expired || d.userState==='deleted') o.expiredOrDeleted++; else o.open++;
    }
    out.openBids = Object.values(out.bySource).reduce((a,o)=>a+o.open,0);
    out.note = out.openBids===0 ? 'Database is connected but every bid is expired or deleted. New bids arrive via Make.com (FedBids, EnviroBidNet) or the +Add Bid button.' : 'Database is connected and has open bids. TWDB bids only show after clicking the TWDB button.';
  } catch(e) { out.databaseError = e.message; }
  res.json(out);
});

// Debug: shows the last raw payload received by ebn-ingest, so we can see
// exactly what Make.com is sending and confirm the parser is matching it correctly
let lastEbnPayload = null;
app.get('/api/debug/last-ebn', (req,res) => res.json(lastEbnPayload || {message:'No EBN ingest received yet since last deploy'}));
app.get('/', (req,res) => res.sendFile(path.join(__dirname,'index.html')));

// ── Duplicate detection (shared by /api/bids and /api/dedupe-bids) ──
// Two bids are the same when, within one source, they have the same solicitation / bid number
// or the same name (ignoring "(123456)"
// bid numbers and punctuation). Preferred copy: see dupBetter.
const dupNz = v => String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
function dupKey(id, d){
  const src = d.source || '';
  const sol = dupNz(d.solicitationNo);
  if(sol) return src+'|sol:'+sol;
  const name = dupNz(String(d.name||'').replace(/\(\s*[#\w-]*\d[#\w-]*\s*\)/g,' '));
  return name.length >= 12 ? src+'|name:'+name : src+'|id:'+id;
}
// Higher = better copy to show: selected, then still open (not expired), then has a due date,
// then the LATEST due date (an extension), then the oldest copy (first one seen).
function dupBetter(x, y){
  const sc = d => (d.userState==='selected' ? 4 : 0) + (isOpenDue(d) ? 2 : 0) + (d.due ? 1 : 0);
  const a = sc(x), b = sc(y);
  if(a !== b) return a > b;
  return String(x.due||'') > String(y.due||'');
}
function isOpenDue(d){
  if(d.source === 'TWDB' || d.status === 'prebid') return true;
  const due = parseDueServer(d.due);
  return !due || due.getTime() >= Date.now();
}
function pickKeepers(rows){
  const keep = new Map();
  for(const row of rows){
    const d = row.data || {};
    const k = dupKey(row.id, d);
    const cur = keep.get(k);
    if(!cur || dupBetter(d, cur.data||{})) keep.set(k,row);
  }
  return new Set([...keep.values()].map(x=>x.id));
}

app.get('/api/bids', async (req,res) => {
  try {
    const r = await pool.query('SELECT id, data FROM bids ORDER BY created_at ASC, id ASC');
    // Expired bids are always reported as Deleted, so every version of the page shows them
    // under Deleted (TWDB / pre-bid bids never expire; Selected bids stay Selected).
    const now = Date.now();
    // Never show duplicates (see dupKey). Nothing is deleted here.
    const keepIds = pickKeepers(r.rows);
    const bids = r.rows.filter(row=>keepIds.has(row.id)).map(row => {
      const d = row.data || {};
      if(d.userState === 'selected' || d.source === 'TWDB' || d.status === 'prebid') return d;
      const due = parseDueServer(d.due);
      if(due && due.getTime() < now && d.userState !== 'deleted') return {...d, userState:'deleted'};
      return d;
    });
    res.json({bids});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.delete('/api/bids/:id', async (req,res) => {
  try {
    await pool.query('DELETE FROM bids WHERE id=$1',[req.params.id]);
    res.json({success:true});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.post('/api/bids/:id/state', async (req,res) => {
  try {
    const r = await pool.query('SELECT data FROM bids WHERE id=$1',[req.params.id]);
    if(!r.rows.length) return res.status(404).json({error:'not found'});
    const bid = r.rows[0].data;
    bid.userState = req.body.state;
    if(req.body.state === 'deleted') bid.deletedAt = new Date().toISOString();
    else delete bid.deletedAt;
    await pool.query('UPDATE bids SET data=$1 WHERE id=$2',[JSON.stringify(bid),req.params.id]);
    res.json({success:true});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// The page calls PATCH /api/bids/:id when you click Select / Delete / Restore or edit a link.
// Saves those changes so they survive a refresh, and records the day a bid was deleted
// (the 14-day auto-purge counts from that day).
app.patch('/api/bids/:id', async (req,res) => {
  try {
    const r = await pool.query('SELECT data FROM bids WHERE id=$1',[req.params.id]);
    if(!r.rows.length) return res.status(404).json({error:'not found'});
    const bid = r.rows[0].data;
    const b = req.body || {};
    if(typeof b.userState === 'string' && ['active','selected','deleted'].includes(b.userState)){
      bid.userState = b.userState;
      if(b.userState === 'deleted') bid.deletedAt = new Date().toISOString();
      else delete bid.deletedAt;
    }
    if(typeof b.url === 'string') bid.url = b.url;
    await pool.query('UPDATE bids SET data=$1 WHERE id=$2',[JSON.stringify(bid),req.params.id]);
    res.json({success:true});
  } catch(e) { res.status(500).json({error:e.message}); }
});

async function fedbidsIngestOne(b) {
    const subject = b.subject||b.Subject||b.name||'';
    const emailBody = b.body||b.Body||b.text||b.Text||b.snippet||b.content||'';
    const allText = subject+' '+emailBody;
    const pkM = allText.match(/pk=([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    const url = pkM
      ? 'https://secure.fedbidspeed.com/Handler.ashx?act=nvgt&req=nav&mop=opportunity!main&pk='+pkM[1]
      : 'https://secure.fedbidspeed.com/Handler.ashx?act=inip&req=nav&mop=fbo-home!home';
    const solM = allText.match(/\b([A-Z][A-Z0-9]{3,9}-?[0-9]{2}-[A-Z]{1,2}-?[0-9]{4,6}|[A-Z]{1,6}-?[0-9]{2,6}-[A-Z]{1,2}-?[0-9]{4,6})/);
    // Fallback for solicitation numbers written without dashes, e.g. 140SS127R0012 or W912BV26R0012
    const solAlt = solM ? null : allText.match(/\b((?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{10,18})\b/);
    const solNo = solM ? solM[1] : (solAlt ? solAlt[1] : '');
    const id = 'fedbid-'+(solNo.replace(/[^a-zA-Z0-9]/g,'')||String(Date.now()).slice(-10));
    // Find the response/due date. Accepts "Response Date: 12/30/2026", "due 12/30/2026",
    // "closing 2026-12-30" and "Response due Dec 30, 2026" (with or without the colon).
    let due='';
    const DATE_RX = '([0-9]{1,2}\\/[0-9]{1,2}\\/20[2-9][0-9]|20[2-9][0-9]-[0-9]{2}-[0-9]{2}|[A-Za-z]{3,9}\\.? [0-9]{1,2},? 20[2-9][0-9])';
    const dM = allText.match(new RegExp('(?:response|due|closing|close|deadline|offers? due)[^0-9A-Za-z]{0,3}(?:[A-Za-z ]{0,25}[^0-9A-Za-z]{0,6})?'+DATE_RX,'i'))
            || allText.match(/(?:response|due)[^:]*:[^0-9]*([0-9]{1,2}\/[0-9]{1,2}\/20[2-9][0-9])/i);
    if(dM){
      const raw = dM[1];
      const us = /^(\d{1,2})\/(\d{1,2})\/(20\d\d)$/.exec(raw);
      if(us) due = us[3]+'-'+us[1].padStart(2,'0')+'-'+us[2].padStart(2,'0');
      else { const dt = new Date(raw+(/^20\d\d-/.test(raw)?'T12:00:00':' 12:00:00')); if(!isNaN(dt)) due = dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0'); }
    }
    // Already have this bid? Skip it, unless the new email carries a LATER due date (extension) -
    // then update the saved bid so it shows as open again.
    const sameNo = solNo ? await pool.query("SELECT id,data FROM bids WHERE data->>'solicitationNo'=$1 OR id=$2",[solNo,id])
                         : await pool.query('SELECT id,data FROM bids WHERE id=$1',[id]);
    if(sameNo.rows.length>0){
      const ex = sameNo.rows[0].data || {};
      if(due && due > String(ex.due||'') && ex.userState !== 'selected'){
        ex.due = due; ex.userState = 'active'; ex.scrapedAt = new Date().toISOString();
        await saveBid(ex);
        return {success:true,updated:true,bid:{id:ex.id,solNo,due}};
      }
      return {success:true,skipped:true};
    }
    await saveBid({id,name:(subject||'FedBid').substring(0,200),agency:'Federal Agency',
      city:'Nationwide',posted:new Date().toISOString().split('T')[0],due,solicitationNo:solNo,
      scope:emailBody.substring(0,400),url,source:'FedBids',value:'TBD',
      status:'active',region:'statewide',userState:'active',scrapedAt:new Date().toISOString()});
  return {success:true,bid:{id,solNo,due}};
}

app.post('/api/bids/fedbids-ingest', async (req,res) => {
  try {
    res.json(await fedbidsIngestOne(req.body||{}));
  } catch(e) { res.status(500).json({error:e.message}); }
});

// ── EnviroBidNet email parsing ──
// The alert email is a table: Bid ID | description (+ link) | Expiration date | VIEW BID.
// Works on the HTML email and on plain text copied from it.
function ebnCleanName(v, fallback){
  const t = String(v||'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ')
    .replace(/https?:\/\/\S+/g,' ').replace(/\(\s*\d+\s*bids?[^)]*\)/gi,' ').replace(/\b20[2-9]\d-\d{2}-\d{2}\b/g,' ')
    .replace(/\s+/g,' ').trim().slice(0,200);
  return t || fallback;
}
function ebnParse(text, bidNum){
  const row = new RegExp('<td[^>]*>\\s*'+bidNum+'\\s*</td>\\s*<td[^>]*>([\\s\\S]*?)</td>\\s*<td[^>]*>\\s*(20[2-9]\\d-\\d{2}-\\d{2})\\s*</td>','i');
  const m = text.match(row);
  if(m) return {name:ebnCleanName(m[1],'EBN Bid '+bidNum), due:m[2]};
  const link = text.indexOf('subscriber_view_bid/'+bidNum);
  let due = '';
  if(link >= 0){
    // Look from this bid's link up to the NEXT bid's link (or 6000 chars). Tags are removed first,
    // because the real email has long inline styles between the link and the date.
    const rest = text.slice(link);
    const nx = rest.search(new RegExp('subscriber_view_bid/(?!'+bidNum+'(?![0-9]))[0-9]'));
    const win = rest.slice(0, nx > 0 ? nx : 6000).slice(0, 6000);
    const after = win.replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')
      .replace(/&nbsp;/gi,' ').replace(/&#\d+;/g,' ').replace(/\s+/g,' ');
    const rx = /(20[2-9]\d)\s*-\s*(\d{2})\s*-\s*(\d{2})/;
    const lab = after.match(/Expires?\W{0,40}(20[2-9]\d)\s*-\s*(\d{2})\s*-\s*(\d{2})/i);
    const any = lab || after.match(rx);
    if(any) due = any[1]+'-'+any[2]+'-'+any[3];
  }
  const before = link >= 0 ? text.slice(Math.max(0,link-2500), link) : text.slice(0,700);
  const plain = before.replace(/<[^>]*$/,' ').replace(/^[^<]*>/,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
  const pos = plain.lastIndexOf(bidNum);
  const name = ebnCleanName(pos >= 0 ? plain.slice(pos+bidNum.length) : plain.slice(-200), 'EBN Bid '+bidNum);
  return {name, due};
}
function ebnExpired(due){ return !!due && new Date(due+'T23:59:59') < new Date(); }

// Repairs EnviroBidNet bids that were saved without a due date (the date ended up inside the
// name text). Fills in the due date and cleans the name. Safe to run again; only touches bids
// with an empty due date.
async function fixEbnBids(dryRun){
  const r = await pool.query("SELECT id,data FROM bids WHERE data->>'source'='EnviroBidNet'");
  const changed = [];
  for(const row of r.rows){
    const d = row.data || {};
    if(d.due) continue;
    const num = String(row.id).replace(/^ebn-/,'');
    const text = (d.name||'')+' '+(d.scope||'');
    let due = '';
    const exact = text.match(new RegExp('subscriber_view_bid/'+num+'\\s+(20[2-9]\\d-\\d{2}-\\d{2})'));
    if(exact) due = exact[1];
    else {
      const at = text.lastIndexOf('subscriber_view_bid/'+num);
      const dm = at >= 0 ? text.slice(at).match(/(20[2-9]\d-\d{2}-\d{2})/) : null;
      if(dm) due = dm[1];
    }
    if(!due) continue;
    const nm = d.name || '';
    const p = nm.indexOf(num);
    const name = ebnCleanName(p >= 0 ? nm.slice(p+num.length) : nm, 'EBN Bid '+num);
    changed.push({id:row.id, name, due});
    if(!dryRun){ d.due = due; d.name = name; d.scope = name; await saveBid(d); }
  }
  return changed;
}
// Preview: /api/fix-ebn      Apply: /api/fix-ebn?confirm=1
app.get('/api/fix-ebn', async (req,res) => {
  try {
    const confirmed = req.query.confirm === '1';
    const changed = await fixEbnBids(!confirmed);
    res.json({success:true, confirmed, count:changed.length, bids:changed.slice(0,50)});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// Adds a bid, or - if it is already saved WITHOUT a due date - fills in its due date and name.
async function ebnUpsert(text, bidNum){
  const id = 'ebn-'+bidNum;
  const parsed = ebnParse(text, bidNum);
  const ex = await pool.query('SELECT data FROM bids WHERE id=$1',[id]);
  if(ex.rows.length){
    const d = ex.rows[0].data || {};
    if(!d.due && parsed.due){
      d.due = parsed.due; d.name = parsed.name; d.scope = parsed.name;
      await saveBid(d);
      return {id, updated:true, due:parsed.due};
    }
    return {id, skipped:true, reason:'Duplicate'};
  }
  if(ebnExpired(parsed.due)) return {id, skipped:true, reason:'Expired'};
  await saveBid({id, name:parsed.name.slice(0,200), agency:'EnviroBidNet', city:'Texas',
    posted:new Date().toISOString().split('T')[0], due:parsed.due, scope:parsed.name.slice(0,400),
    url:'https://envirobidnet.com/subscriber_view_bid/'+bidNum, source:'EnviroBidNet', value:'TBD',
    status:'active', region:'texas', userState:'active', scrapedAt:new Date().toISOString()});
  return {id, due:parsed.due, created:true};
}

// Removes test/placeholder bids left behind by Make mapping mistakes (names like "Subject").
async function cleanJunkBids(dryRun){
  const r = await pool.query('SELECT id,data FROM bids');
  const junk = r.rows.filter(row => {
    const n = String((row.data||{}).name||'').trim();
    return /^(\[?\s*\d*\.?\s*subject\s*\]?|fedbid|text content|\[?\s*\d*\.?\s*text content\s*\]?)$/i.test(n) && row.data.userState !== 'selected';
  }).map(row => ({id:row.id, name:row.data.name}));
  if(!dryRun) for(const j of junk) await pool.query('DELETE FROM bids WHERE id=$1',[j.id]);
  return junk;
}

// Preview: /api/clean-junk      Delete: /api/clean-junk?confirm=1
app.get('/api/clean-junk', async (req,res) => {
  try {
    const confirmed = req.query.confirm === '1';
    const junk = await cleanJunkBids(!confirmed);
    res.json({success:true, confirmed, count:junk.length, bids:junk});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.post('/api/bids/ebn-ingest', async (req,res) => {
  try {
    const b = req.body||{};
    lastEbnPayload = {receivedAt:new Date().toISOString(), body:b};
    const subject = b.subject||b.Subject||'';
    // Use EVERY text field Make sends (plain text AND html): the plain-text part of an
    // EnviroBidNet email has only the links, the Expires dates are in the html part.
    const emailBody = [b.body,b.Body,b.text,b.Text,b.snippet,b.html,b.Html,b.htmlContent].filter(x=>typeof x==='string'&&x).join('\n');
    const combined = subject+' '+emailBody;

    // EnviroBidNet alert emails are a DIGEST: one email lists MANY bids, each with its
    // own https://envirobidnet.com/subscriber_view_bid/<id> link. Find every one, not just the first.
    const linkPattern = /subscriber_view_bid\/([0-9]{5,15})/gi;
    const idsFound = [...combined.matchAll(linkPattern)].map(m => m[1]);
    const uniqueIds = [...new Set(idsFound)];

    let created = 0, skipped = 0;
    const results = [];

    if(uniqueIds.length > 0){
      for(const bidNum of uniqueIds){
        const r = await ebnUpsert(combined, bidNum);
        if(r.created || r.updated) created++; else skipped++;
        results.push(r);
      }
      console.log('[EBN] Digest processed:', created, 'added,', skipped, 'skipped. Subject:', subject);
      return res.json({success:true, created, skipped, results});
    }

    // Fallback: no subscriber_view_bid links found at all. Don't silently drop a
    // genuine EnviroBidNet email — save it under a subject-hash id so it's still visible.
    const looksLikeEBN = /envirobidnet/i.test(combined) || /envirobidnet/i.test(b.from||b.From||'');
    if(!looksLikeEBN) return res.json({success:true,skipped:true,reason:'Not an EnviroBidNet email'});
    const bidNum = crypto.createHash('md5').update(subject||emailBody.slice(0,200)).digest('hex').slice(0,10);
    const id = 'ebn-'+bidNum;
    const dup = await pool.query('SELECT id FROM bids WHERE id=$1',[id]);
    if(dup.rows.length>0) return res.json({success:true,skipped:true,reason:'Duplicate'});
    console.log('[EBN] No subscriber_view_bid links found — using subject-hash fallback. Subject:', subject);
    await saveBid({id,name:subject||'EBN Bid '+bidNum,agency:'EnviroBidNet',city:'Texas',
      posted:new Date().toISOString().split('T')[0],due:'',scope:emailBody.substring(0,400),
      url:'https://www.envirobidnet.com',source:'EnviroBidNet',
      value:'TBD',status:'active',region:'texas',userState:'active',scrapedAt:new Date().toISOString()});
    res.json({success:true,created:1,fallback:true});
  } catch(e) { console.error('[EBN] ingest error:', e.message); res.status(500).json({error:e.message}); }
});


app.get('/api/reset', async (req,res) => {
  try {
    // Non-destructive: upsert the known static bids without deleting anything else.
    // This refreshes/repairs the 33 baked-in bids without wiping out bids that were
    // added live via email ingestion (e.g. EnviroBidNet/FedBids alerts) and aren't
    // part of this hardcoded list.
    for(const b of SEED_BIDS) await saveBid({...b,scrapedAt:new Date().toISOString()});
    res.json({success:true,seeded:SEED_BIDS.length});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// Full wipe + reseed — only the static 33, deletes everything else including
// any live-ingested bids. Use only when you intentionally want a clean slate.
app.get('/api/hard-reset', async (req,res) => {
  try {
    await pool.query('DELETE FROM bids');
    for(const b of SEED_BIDS) await saveBid({...b,scrapedAt:new Date().toISOString()});
    res.json({success:true,seeded:SEED_BIDS.length});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// Manual bid add — used by the "Add Bid" modal in the UI
app.post('/api/bids', async (req,res) => {
  try {
    const b = req.body||{};
    if(!b.name) return res.status(400).json({error:'name required'});
    const id = b.id || ('manual-'+Date.now());
    await saveBid({...b, id, source:b.source||'Manual', status:b.status||'active',
      userState:'active', scrapedAt:new Date().toISOString()});
    res.json({success:true, id});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// Paste-an-EnviroBidNet-email add — used by the "Paste EnviroBidNet Email" modal.
// Scans the pasted text for every subscriber_view_bid/<number> link it can find
// (an alert email often lists several bids) and adds each one not already saved.
app.post('/api/email-bids', async (req,res) => {
  try {
    const b = req.body||{};
    const text = [b.text,b.html,b.body].filter(x=>typeof x==='string'&&x).join('\n');
    const matches = [...text.matchAll(/subscriber_view_bid\/([0-9]{5,15})/gi)];
    // No EnviroBidNet links but it looks like a BidSpeed (FedBids) email -> save it as a FedBid
    if(!matches.length && /fedbid|bidspeed/i.test(text)) {
      const lines = text.split(/\r?\n/).map(x=>x.replace(/<[^>]+>/g,' ').trim()).filter(Boolean);
      const subject = (typeof b.subject==='string' && !/^EnviroBidNet/i.test(b.subject) && b.subject) || lines.find(l=>!/^(from|to|sent|date|cc)\s*:/i.test(l)) || 'FedBid';
      const r = await fedbidsIngestOne({subject, body:text});
      return res.json({success:true, created:r.skipped?0:1, skipped:r.skipped?1:0, results:[r]});
    }
    const seen = new Set();
    let created = 0, skipped = 0;
    const results = [];
    for(const m of matches){
      const bidNum = m[1];
      if(seen.has(bidNum)) continue;
      seen.add(bidNum);
      const r = await ebnUpsert(text, bidNum);
      if(r.created || r.updated) created++; else skipped++;
      results.push(r);
    }
    res.json({success:true, created, skipped, results});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.get('/api/clean-ebn', async (req,res) => {
  try {
    await pool.query("DELETE FROM bids WHERE data->>'source'='EnviroBidNet' AND data->>'due'!='' AND (data->>'due')::date < CURRENT_DATE");
    res.json({success:true});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.get('/api/dedupe-fedbids', async (req,res) => {
  try {
    // Only remove TRUE duplicates (same solicitation number, keep the oldest).
    // The previous version deleted every live-ingested FedBids bid on each call.
    await pool.query(`DELETE FROM bids a USING bids b
      WHERE a.data->>'source'='FedBids' AND b.data->>'source'='FedBids'
      AND COALESCE(a.data->>'solicitationNo','')<>''
      AND a.data->>'solicitationNo'=b.data->>'solicitationNo'
      AND (a.created_at,a.id) > (b.created_at,b.id)`);
    res.json({success:true});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// Remove duplicate bids (any source). Same solicitation number, or same name + due date,
// counts as a duplicate; the OLDEST copy is kept.
// Preview first:  /api/dedupe-bids        (shows what would be removed, deletes nothing)
// Then delete:    /api/dedupe-bids?confirm=1
app.get('/api/dedupe-bids', async (req,res) => {
  try {
    const r = await pool.query('SELECT id,data FROM bids ORDER BY created_at ASC, id ASC');
    const keepIds = pickKeepers(r.rows);
    const byKey = new Map(r.rows.filter(x=>keepIds.has(x.id)).map(x=>[dupKey(x.id,x.data||{}),x.id]));
    const dups = r.rows.filter(x=>!keepIds.has(x.id)).map(x=>({id:x.id, name:(x.data||{}).name, source:(x.data||{}).source, duplicateOf:byKey.get(dupKey(x.id,x.data||{}))}));
    const confirmed = req.query.confirm === '1';
    if(confirmed){ for(const x of dups) await pool.query('DELETE FROM bids WHERE id=$1',[x.id]); }
    res.json({success:true, confirmed, duplicatesFound:dups.length, duplicates:dups});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// ── Auto-purge: a bid that has been in Deleted for more than 14 days is removed for good ──
// A bid is "in Deleted" when (a) its due date has passed (TWDB / pre-bid bids never expire), or
// (b) it was deleted by hand. For (a) the 14 days count from the due date; for (b) from the day it
// was deleted. Selected bids are never purged.
const PURGE_AFTER_DAYS = 14;
function parseDueServer(due){
  if(!due) return null;
  const v = String(due).trim();
  let m = v.match(/^(20[2-9]\d)-(\d{2})-(\d{2})/);
  if(m) return new Date(m[1]+'-'+m[2]+'-'+m[3]+'T23:59:59');
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(20[2-9]\d)$/);
  if(m) return new Date(m[3]+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0')+'T23:59:59');
  if(/[A-Za-z]{3,}\s+\d{1,2},?\s+20[2-9]\d/.test(v)){
    const dt = new Date(v);
    if(!isNaN(dt)){ dt.setHours(23,59,59,0); return dt; }
  }
  return null;
}
async function purgeDeleted(dryRun){
  const now = Date.now();
  const cutoff = now - PURGE_AFTER_DAYS*24*60*60*1000;
  const r = await pool.query('SELECT id,data FROM bids');
  const removed = [];
  let stamped = 0;
  for(const row of r.rows){
    const d = row.data || {};
    if(d.userState === 'selected') continue;
    const neverExpires = d.source === 'TWDB' || d.status === 'prebid';
    const dueDate = parseDueServer(d.due);
    const expired = !neverExpires && !!dueDate && dueDate.getTime() < now;
    let since = null;
    if(d.userState === 'deleted'){
      if(d.deletedAt) since = Date.parse(d.deletedAt);
      else if(expired) since = dueDate.getTime();
      else {
        // deleted by hand before dates were recorded: start the 14 days from now
        stamped++;
        if(!dryRun){ d.deletedAt = new Date().toISOString(); await saveBid(d); }
        continue;
      }
    } else if(expired){
      since = dueDate.getTime();
    }
    if(since !== null && !isNaN(since) && since < cutoff){
      removed.push({id:row.id, name:d.name, source:d.source, due:d.due});
      if(!dryRun) await pool.query('DELETE FROM bids WHERE id=$1',[row.id]);
    }
  }
  return {removed, stamped};
}
// Preview:  /api/purge-deleted            (shows what would be removed, deletes nothing)
// Delete:   /api/purge-deleted?confirm=1
app.get('/api/purge-deleted', async (req,res) => {
  try {
    const confirmed = req.query.confirm === '1';
    const out = await purgeDeleted(!confirmed);
    res.json({success:true, confirmed, afterDays:PURGE_AFTER_DAYS, wouldRemoveOrRemoved:out.removed.length, bids:out.removed});
  } catch(e) { res.status(500).json({error:e.message}); }
});

process.on('uncaughtException', e => console.error('[Crash]',e.message));
process.on('unhandledRejection', e => console.error('[Reject]',String(e)));

app.listen(PORT, '0.0.0.0', () => {
  console.log('[SRI Bids] Running on port', PORT);
  setTimeout(() => initDBWithRetry(1), 2000);
  const runPurge = async () => {
    try {
      const junk = await cleanJunkBids(false);
      if(junk.length) console.log('[Clean] Removed', junk.length, 'placeholder bids');
      const fixed = await fixEbnBids(false);
      if(fixed.length) console.log('[EBN] Repaired', fixed.length, 'bids with missing due dates');
      const o = await purgeDeleted(false);
      if(o.removed.length) console.log('[Purge] Removed', o.removed.length, 'bids deleted for more than', PURGE_AFTER_DAYS, 'days');
    } catch(e) { console.error('[Purge]', e.message); }
  };
  setTimeout(runPurge, 20000);
  setInterval(runPurge, 6*60*60*1000);
});
