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
  { id:'seed-1', source:'Manual', name:'Water & Wastewater Facilities IDIQ', agency:'City of Austin – Austin Water', city:'Austin', scope:'IDIQ E&I engineering design work assignments at water & wastewater facilities', due:'Check link', value:'IDIQ / TBD', status:'active', region:'austin', url:'https://publicbidtracker.com/texas/open-bids/' },
  { id:'seed-2', source:'Manual', name:'TCWSP Murphy Drive Pump Station – Generator Improvements', agency:'Trinity River Authority (TRA)', city:'DFW Region', scope:'3,000kW generators, MV switchgear, SCADA integration design', due:'Active – TBD', value:'TBD', status:'active', region:'dfw', url:'https://tra.procureware.com/Bids' },
  { id:'seed-3', source:'Manual', name:'Ten Mile Creek – DAF & Electrical Instrumentation Improvements', agency:'City of Dallas', city:'Dallas', scope:'DAF tanks, electrical & instrumentation improvements, SCADA', due:'TBD 2026', value:'~$17,400,000', status:'active', region:'dfw', url:'https://dallascityhall.com/departments/procurement/Pages/current_bids_proposals.aspx' },
  { id:'seed-4', source:'Manual', name:'Surface Water Treatment Plant – E&I & SCADA Engineering', agency:'City of Pearland', city:'Pearland, TX', scope:'Site power design, SCADA architecture, instrumentation engineering', due:'Mid-2026', value:'~$71.4M pkg', status:'prebid', region:'houston', url:'https://www.pearlandtx.gov/departments/engineering-and-public-works' },
  { id:'seed-5', source:'Manual', name:'City of Strawn – WTP SCADA & Electrical Engineering', agency:'City of Strawn (TWDB HB500)', city:'Strawn, TX', scope:'SCADA design, alternate power, electrical design for microfilter replacement', due:'TBD Post-funding', value:'~$1,085,000', status:'prebid', region:'statewide', url:'https://publicbidtracker.com/texas/open-bids/' },
  { id:'seed-6', source:'Manual', name:'Bandera Lift Station – SCADA & E&I Package', agency:'Harris County WCID No. 36', city:'Houston, TX', scope:'SCADA panels, VFD, ATS, instrumentation & control, SCADA programming', due:'TBD 2026', value:'~$2,206,436', status:'active', region:'houston', url:'https://civcastusa.com' },
];

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

if (typeof File === 'undefined') global.File = class File {};
if (typeof Blob === 'undefined') global.Blob = class Blob {};
if (typeof FormData === 'undefined') global.FormData = class FormData {};