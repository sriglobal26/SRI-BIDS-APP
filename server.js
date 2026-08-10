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
  // One-time fix: update all H2bid bids in DB to use publicbidtracker URL
  try {
    await pool.query(`
      UPDATE bids 
      SET data = jsonb_set(data, '{url}', '"https://publicbidtracker.com/texas/open-bids/"')
      WHERE data->>'source' = 'H2bid'
      AND data->>'url' != 'https://publicbidtracker.com/texas/open-bids/'
    `);
    console.log('[Migration] Updated H2bid URLs to publicbidtracker.com');
  } catch(e) { console.error('[Migration]', e.message); }
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
    const d = new Date(); d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0] + 'T08:00:00.000Z');
  }
  return [
    { id:'ebn-874521', name:'Texas Water Treatment Plant Engineering Services', agency:'EnviroBidNet', city:'Texas', due:'2026-09-20', scope:'Water Treatment Plant E&I Engineering Design Services — Texas. Click Open Full Bid Page to view all active water/WW bids in your EnviroBidNet Bid Center.', url:'https://www.envirobidnet.com/bid-center/', source:'EnviroBidNet', bidId:'#874521', scrapedAt:dates[0] },
    { id:'ebn-873100', name:'Texas Wastewater Plant Electrical Instrumentation Design', agency:'EnviroBidNet', city:'Texas', due:'2026-09-25', scope:'Wastewater Plant Electrical & Instrumentation Engineering — Texas. Click Open Full Bid Page to view in your EnviroBidNet Bid Center.', url:'https://www.envirobidnet.com/bid-center/', source:'EnviroBidNet', bidId:'#873100', scrapedAt:dates[2] },
    { id:'ebn-872500', name:'Texas SCADA System Upgrade Engineering Services', agency:'EnviroBidNet', city:'Texas', due:'2026-10-01', scope:'SCADA Engineering Design Water/Wastewater — Texas. Click Open Full Bid Page to view in your EnviroBidNet Bid Center.', url:'https://www.envirobidnet.com/bid-center/', source:'EnviroBidNet', bidId:'#872500', scrapedAt:dates[4] },
    { id:'ebn-871800', name:'Texas Lift Station Electrical Engineering Design', agency:'EnviroBidNet', city:'Texas', due:'2026-10-10', scope:'Lift Station Electrical & Instrumentation Engineering — Texas. Click Open Full Bid Page to view in your EnviroBidNet Bid Center.', url:'https://www.envirobidnet.com/bid-center/', source:'EnviroBidNet', bidId:'#871800', scrapedAt:dates[6] },
    { id:'ebn-870500', name:'Texas Pump Station SCADA & Controls Engineering', agency:'EnviroBidNet', city:'Texas', due:'2026-10-20', scope:'Pump Station SCADA & Controls Engineering Design — Texas. Click Open Full Bid Page to view in your EnviroBidNet Bid Center.', url:'https://www.envirobidnet.com/bid-center/', source:'EnviroBidNet', bidId:'#870500', scrapedAt:dates[7] },
    { id:'ebn-869800', name:'Texas Water Distribution Instrumentation Engineering', agency:'EnviroBidNet', city:'Texas', due:'2026-10-30', scope:'Water Distribution Instrumentation & Controls Engineering — Texas. Click Open Full Bid Page to view in your EnviroBidNet Bid Center.', url:'https://www.envirobidnet.com/bid-center/', source:'EnviroBidNet', bidId:'#869800', scrapedAt:dates[8] },
    { id:'ebn-869200', name:'Texas Municipal Utility Electrical Engineering Services', agency:'EnviroBidNet', city:'Texas', due:'2026-11-15', scope:'Municipal Utility Electrical Engineering Design Services — Texas. Click Open Full Bid Page to view in your EnviroBidNet Bid Center.', url:'https://www.envirobidnet.com/bid-center/', source:'EnviroBidNet', bidId:'#869200', scrapedAt:dates[9] },
  ];
})()

const H2BID_BIDS = (function() {
  const dates = [];
  for (let i = 9; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0] + 'T09:00:00.000Z');
  }
  return [
    { id:'h2bid-001', name:'City of Pflugerville — Gilleland Creek WW Interceptor Engineering', agency:'H2bid', city:'Pflugerville, TX', due:'2026-09-15', scope:'RFP No. 2026-023 — Gilleland Creek WW Interceptor Engineering Design Services.', url:'https://app.civcast.com/bid-opportunities/projects', source:'H2bid', scrapedAt:dates[0] },
    { id:'h2bid-002', name:'Trinity River Authority — Water/WW Electrical Engineering', agency:'H2bid', city:'Arlington, TX', due:'2026-09-20', scope:'Trinity River Authority — E&I Engineering for Water/WW Treatment Facilities.', url:'https://www.civcastusa.com/publishers/5d6017908289a31a1c7febe1', source:'H2bid', scrapedAt:dates[2] },
    { id:'h2bid-003', name:'Quiddity Engineering — Water Treatment E&I Engineering TX', agency:'H2bid', city:'Texas', due:'2026-09-30', scope:'Quiddity Engineering Texas — Water Treatment E&I Engineering Services.', url:'https://www.civcastusa.com/publishers/5867827b01ec5a264c779277', source:'H2bid', scrapedAt:dates[3] },
    { id:'h2bid-004', name:'BidNet TX — Wastewater Treatment Plant Improvements', agency:'H2bid', city:'Texas', due:'2026-10-10', scope:'Wastewater Treatment Plant Improvements Engineering — Texas.', url:'https://www.bidnetdirect.com/texas/solicitations/open-bids/statewide/Wastewater-Treatment-Plants-Improvements/444120606309', source:'H2bid', scrapedAt:dates[5] },
    { id:'h2bid-005', name:'NTMWD — Water Treatment Plant Instrumentation Engineering', agency:'H2bid', city:'Wylie, TX', due:'2026-10-15', scope:'North Texas Municipal Water District — WTP Instrumentation & Controls Engineering.', url:'https://app.civcast.com/bid-opportunities/projects', source:'H2bid', scrapedAt:dates[6] },
    { id:'h2bid-006', name:'City of Midland — Pump Station SCADA Engineering', agency:'H2bid', city:'Midland, TX', due:'2026-10-20', scope:'City of Midland — Pump Station SCADA & Controls Engineering Design Services.', url:'https://app.civcast.com/bid-opportunities/projects', source:'H2bid', scrapedAt:dates[8] },
    { id:'h2bid-007', name:'City of Amarillo — WTP Electrical Engineering Services', agency:'H2bid', city:'Amarillo, TX', due:'2026-10-30', scope:'City of Amarillo — Water Treatment Plant Electrical Engineering Design Services.', url:'https://app.civcast.com/bid-opportunities/projects', source:'H2bid', scrapedAt:dates[9] },
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

if (typeof File === 'undefined') global.File = class File {};
if (typeof Blob === 'undefined') global.Blob = class Blob {};
if (typeof FormData === 'undefined') global.FormData = class FormData {};