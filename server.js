const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json({limit:'5mb'}));
app.use(express.static(path.join(__dirname)));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {rejectUnauthorized:false},
  max:3, idleTimeoutMillis:30000, connectionTimeoutMillis:15000
});

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
];

async function saveBid(bid) {
  const id = bid.id || ('bid-'+Date.now());
  bid.id = id;
  await pool.query(
    'INSERT INTO bids(id,data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=$2',
    [id, JSON.stringify(bid)]
  );
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
  }
}

app.get('/health', (req,res) => res.json({status:'ok'}));

// Debug: shows the last raw payload received by ebn-ingest, so we can see
// exactly what Make.com is sending and confirm the parser is matching it correctly
let lastEbnPayload = null;
app.get('/api/debug/last-ebn', (req,res) => res.json(lastEbnPayload || {message:'No EBN ingest received yet since last deploy'}));
app.get('/', (req,res) => res.sendFile(path.join(__dirname,'index.html')));

app.get('/api/bids', async (req,res) => {
  try {
    const r = await pool.query('SELECT data FROM bids ORDER BY created_at ASC');
    res.json({bids: r.rows.map(r=>r.data)});
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
    await pool.query('UPDATE bids SET data=$1 WHERE id=$2',[JSON.stringify(bid),req.params.id]);
    res.json({success:true});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.post('/api/bids/fedbids-ingest', async (req,res) => {
  try {
    const b = req.body||{};
    const subject = b.subject||b.Subject||b.name||'';
    const emailBody = b.body||b.Body||b.text||b.Text||b.snippet||b.content||'';
    const allText = subject+' '+emailBody;
    const pkM = allText.match(/pk=([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    const url = pkM
      ? 'https://secure.fedbidspeed.com/Handler.ashx?act=nvgt&req=nav&mop=opportunity!main&pk='+pkM[1]
      : 'https://secure.fedbidspeed.com/Handler.ashx?act=inip&req=nav&mop=fbo-home!home';
    const solM = allText.match(/([A-Z]{1,6}-?[0-9]{2,6}-[A-Z]{1,2}-?[0-9]{4,6})/);
    const solNo = solM ? solM[1] : '';
    const id = 'fedbid-'+(solNo.replace(/[^a-zA-Z0-9]/g,'')||String(Date.now()).slice(-10));
    if(solNo) {
      const dup = await pool.query("SELECT id FROM bids WHERE data->>'solicitationNo'=$1",[solNo]);
      if(dup.rows.length>0) return res.json({success:true,skipped:true});
    }
    const dup2 = await pool.query('SELECT id FROM bids WHERE id=$1',[id]);
    if(dup2.rows.length>0) return res.json({success:true,skipped:true});
    let due='';
    const dM = allText.match(/(?:response|due)[^:]*:[^0-9]*([0-9]{1,2}\/[0-9]{1,2}\/20[2-9][0-9])/i);
    if(dM){try{const dt=new Date(dM[1]);if(!isNaN(dt))due=dt.toISOString().split('T')[0];}catch(e2){}}
    await saveBid({id,name:(subject||'FedBid').substring(0,200),agency:'Federal Agency',
      city:'Nationwide',posted:new Date().toISOString().split('T')[0],due,solicitationNo:solNo,
      scope:emailBody.substring(0,400),url,source:'FedBids',value:'TBD',
      status:'active',region:'statewide',userState:'active',scrapedAt:new Date().toISOString()});
    res.json({success:true,bid:{id,solNo,due}});
  } catch(e) { res.status(500).json({error:e.message}); }
});

app.post('/api/bids/ebn-ingest', async (req,res) => {
  try {
    const b = req.body||{};
    lastEbnPayload = {receivedAt:new Date().toISOString(), body:b};
    const subject = b.subject||b.Subject||'';
    const emailBody = b.body||b.Body||b.text||b.Text||b.snippet||b.html||b.Html||'';
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
        const id = 'ebn-'+bidNum;
        const dup = await pool.query('SELECT id FROM bids WHERE id=$1',[id]);
        if(dup.rows.length>0){ skipped++; results.push({id,skipped:true,reason:'Duplicate'}); continue; }

        // Look at the text right around this specific bid's link to get its own
        // description and expiration date, not a neighboring row's.
        const idx = combined.indexOf('subscriber_view_bid/'+bidNum);
        const windowText = combined.slice(Math.max(0, idx-600), idx+200);
        // The "Expires:" date for a row appears AFTER its own link in EnviroBidNet's
        // layout — searching backward risks grabbing the previous row's date instead.
        const forwardText = combined.slice(idx, idx+250);

        const dateM = forwardText.match(/Expires?[:\s]+(\d{4}-\d{2}-\d{2})/i);
        let due='';
        if(dateM){try{const dt=new Date(dateM[1]);if(!isNaN(dt))due=dt.toISOString().split('T')[0];}catch(e2){}}
        if(due && new Date(due) < new Date()){ skipped++; results.push({id,skipped:true,reason:'Expired'}); continue; }

        // Best-effort name: the bid number is usually immediately followed/preceded by its
        // description in the row; strip tags/whitespace and take a reasonable chunk.
        const stripped = windowText.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
        const bidNumIdx = stripped.indexOf(bidNum);
        let nameGuess = bidNumIdx >= 0 ? stripped.slice(bidNumIdx + bidNum.length, bidNumIdx + bidNum.length + 200).trim() : '';
        if(!nameGuess) nameGuess = 'EBN Bid '+bidNum;

        const fullUrl = 'https://envirobidnet.com/subscriber_view_bid/'+bidNum;
        await saveBid({id, name:nameGuess.slice(0,200), agency:'EnviroBidNet', city:'Texas',
          posted:new Date().toISOString().split('T')[0], due, scope:stripped.slice(0,400),
          url:fullUrl, source:'EnviroBidNet', value:'TBD', status:'active', region:'texas',
          userState:'active', scrapedAt:new Date().toISOString()});
        created++;
        results.push({id,due,created:true});
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
    const text = (b.text||b.html||'').toString();
    const matches = [...text.matchAll(/subscriber_view_bid\/([0-9]{5,15})/gi)];
    const seen = new Set();
    let created = 0;
    for(const m of matches){
      const bidNum = m[1];
      if(seen.has(bidNum)) continue;
      seen.add(bidNum);
      const id = 'ebn-'+bidNum;
      const dup = await pool.query('SELECT id FROM bids WHERE id=$1',[id]);
      if(dup.rows.length>0) continue;
      const windowText = text.slice(Math.max(0, m.index-500), m.index+500);
      const dateM = windowText.match(/Expires?[:\s]+(\d{4}-\d{2}-\d{2})/i);
      let due='';
      if(dateM){try{const dt=new Date(dateM[1]);if(!isNaN(dt))due=dt.toISOString().split('T')[0];}catch(e2){}}
      if(due && new Date(due) < new Date()) continue;
      const fullUrlM = windowText.match(/https?:\/\/(?:www\.)?envirobidnet\.com\/subscriber_view_bid\/[^\s"<>]+/i);
      const nameGuess = (windowText.split('\n').map(l=>l.trim()).find(l=>l.length>10) || ('EBN Bid '+bidNum)).slice(0,200);
      await saveBid({id, name:nameGuess, agency:'EnviroBidNet', city:'Texas',
        posted:new Date().toISOString().split('T')[0], due, scope:windowText.slice(0,400),
        url: fullUrlM ? fullUrlM[0] : 'https://www.envirobidnet.com',
        source:'EnviroBidNet', value:'TBD', status:'active', region:'texas',
        userState:'active', scrapedAt:new Date().toISOString()});
      created++;
    }
    res.json({success:true, created});
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
    await pool.query("DELETE FROM bids WHERE data->>'source'='FedBids' AND id NOT LIKE 'fedbid-00%'");
    res.json({success:true});
  } catch(e) { res.status(500).json({error:e.message}); }
});

process.on('uncaughtException', e => console.error('[Crash]',e.message));
process.on('unhandledRejection', e => console.error('[Reject]',String(e)));

app.listen(PORT, '0.0.0.0', () => {
  console.log('[SRI Bids] Running on port', PORT);
  setTimeout(() => initDB().catch(e => console.error('[DB]',e.message)), 2000);
});
