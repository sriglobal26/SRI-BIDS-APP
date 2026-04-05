const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// ─── DATABASE ────────────────────────────────────────────────
// Use DATABASE_PUBLIC_URL first (avoids Railway internal IPv6 issues)
const dbUrl = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;

// Parse connection string into explicit fields — more reliable than connectionString alone
let poolConfig;
try {
  const u = new URL(dbUrl);
  poolConfig = {
    host: u.hostname,
    port: parseInt(u.port) || 5432,
    user: u.username,
    password: u.password,
    database: u.pathname.replace('/', ''),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
    max: 10
  };
} catch(e) {
  poolConfig = {
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  };
}

const pool = new Pool(poolConfig);

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bids (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scrape_log (
      id SERIAL PRIMARY KEY,
      ran_at TIMESTAMP DEFAULT NOW(),
      source TEXT,
      count INTEGER,
      status TEXT,
      message TEXT
    )
  `);
  console.log('[DB] Ready');

  // Seed known bids if DB is empty
  const { rows } = await pool.query('SELECT COUNT(*) FROM bids');
  if (parseInt(rows[0].count) === 0) {
    console.log('[DB] Seeding known bids...');
    for (const bid of SEED_BIDS) await saveBid(bid);
    console.log('[DB] Seeded', SEED_BIDS.length, 'bids');
  }
}

// ─── SEED BIDS ───────────────────────────────────────────────
const SEED_BIDS = [
  { id:'seed-1', source:'Manual', name:'Water & Wastewater Facilities IDIQ', agency:'City of Austin – Austin Water', city:'Austin', scope:'IDIQ task-order contract; E&I engineering design work assignments at multiple water & wastewater facilities', due:'Check link', value:'IDIQ / TBD', status:'active', region:'austin', url:'https://financeonline.austintexas.gov/afo/account_services/solicitation/solicitations.cfm' },
  { id:'seed-2', source:'Manual', name:'TCWSP Murphy Drive Pump Station – Generator Improvements', agency:'Trinity River Authority (TRA)', city:'DFW Region', scope:'Two 3,000kW generators, MV switchgear, paralleling switchgear, underground duct banks; full SCADA integration design', due:'Active – TBD', value:'TBD', status:'active', region:'dfw', url:'https://tra.procureware.com/Bids' },
  { id:'seed-3', source:'Manual', name:'Ten Mile Creek – DAF & Electrical / Instrumentation Improvements', agency:'City of Dallas', city:'Dallas', scope:'Decommission DAF tanks; electrical & instrumentation improvements; RAS/WAS & thickener electrical upgrades', due:'TBD 2026', value:'~$17,400,000', status:'active', region:'dfw', url:'https://dallascityhall.com/departments/procurement/Pages/current_bids_proposals.aspx' },
  { id:'seed-4', source:'Manual', name:'Surface Water Treatment Plant – E&I & SCADA Engineering Design', agency:'City of Pearland', city:'Pearland (S. Houston)', scope:'Main site power & distribution system design; SCADA system architecture; instrumentation engineering for treatment trains, pump station, ground storage tanks', due:'CMAR GMP Mid-2026', value:'Part of ~$71.4M pkg', status:'prebid', region:'houston', url:'https://www.pearlandtx.gov/departments/engineering-and-public-works' },
  { id:'seed-5', source:'Manual', name:'City of Strawn – WTP SCADA & Electrical Engineering Design', agency:'City of Strawn (TWDB HB500)', city:'Strawn, TX', scope:'Open-source SCADA system design, alternate power supply engineering, electrical design for microfilter replacement; TWDB grant funded', due:'TBD Post-funding', value:'~$1,085,000', status:'prebid', region:'statewide', url:'https://www.twdb.texas.gov/financial/programs/WSIG/index.asp' },
  { id:'seed-6', source:'Manual', name:'Bandera Lift Station – SCADA & E&I Package', agency:'Harris County WCID No. 36', city:'Houston (Harris Co.)', scope:'SCADA & network panels, VFD, ATS, instrumentation & control devices, conduit, wire; SCADA programming', due:'TBD 2026', value:'~$2,206,436', status:'active', region:'houston', url:'https://civcastusa.com' },
];

// ─── NORMALIZE ───────────────────────────────────────────────
function normalizeBid(raw, idx) {
  return {
    id: raw.id || 'bid-' + idx,
    num: String(idx + 1).padStart(2, '0'),
    name: raw.name || raw.title || raw.bidName || 'Unnamed Bid',
    agency: raw.agency || raw.owner || raw.organization || 'Unknown Agency',
    city: raw.city || raw.location || 'Texas',
    scope: raw.scope || raw.description || 'E&I Engineering — See RFQ link',
    due: raw.due || raw.dueDate || raw.closingDate || 'See link',
    value: raw.value || raw.estimatedValue || 'TBD',
    status: raw.status || 'active',
    region: raw.region || detectRegion(raw.city || raw.location || ''),
    url: raw.url || raw.link || raw.bidUrl || '',
    source: raw.source || 'Unknown',
    scrapedAt: raw.scrapedAt || new Date().toISOString()
  };
}

function detectRegion(city) {
  const c = (city || '').toLowerCase();
  if (['houston','pearland','baytown','katy','sugar land','conroe','galveston','pasadena','league city','friendswood','la porte','missouri city'].some(h => c.includes(h))) return 'houston';
  if (['dallas','fort worth','plano','arlington','denton','frisco','mckinney'].some(h => c.includes(h))) return 'dfw';
  if (c.includes('austin')) return 'austin';
  if (c.includes('san antonio')) return 'sa';
  return 'statewide';
}

// ─── DB HELPERS ──────────────────────────────────────────────
async function readBids() {
  const r = await pool.query('SELECT data, created_at FROM bids ORDER BY created_at DESC');
  const bids = r.rows.map((row, i) => normalizeBid({ ...row.data, created_at: row.created_at }, i));
  const logR = await pool.query('SELECT ran_at FROM scrape_log ORDER BY ran_at DESC LIMIT 1');
  return { bids, lastUpdated: logR.rows[0]?.ran_at || null, total: bids.length };
}

async function saveBid(bid) {
  await pool.query(
    'INSERT INTO bids (id, data, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (id) DO UPDATE SET data=$2, updated_at=NOW()',
    [bid.id, JSON.stringify(bid)]
  );
}

async function clearScrapedBids() {
  await pool.query("DELETE FROM bids WHERE data->>'source' NOT IN ('Manual', 'manual')");
}

// ─── SCRAPE STATE ─────────────────────────────────────────────
let scrapeStatus = { running: false, startedAt: null, results: [], lastFinished: null };

// ─── ROUTES ──────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: Math.round(process.uptime()) }));

app.get('/api/bids', async (req, res) => {
  try { res.json(await readBids()); }
  catch(e) { res.json({ bids: [], lastUpdated: null, total: 0, error: e.message }); }
});

app.get('/api/scrape/status', (req, res) => res.json(scrapeStatus));

app.post('/api/scrape', (req, res) => {
  if (scrapeStatus.running) return res.json({ status: 'already_running' });
  res.json({ status: 'started' });
  runScrape();
});

app.post('/api/bids', async (req, res) => {
  try {
    const bid = { id: 'manual-' + Date.now(), source: 'Manual', ...req.body };
    await saveBid(bid);
    res.json({ success: true, bid });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete('/api/bids/:id', async (req, res) => {
  await pool.query('DELETE FROM bids WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

app.patch('/api/bids/:id', async (req, res) => {
  await pool.query('UPDATE bids SET data = data || $1, updated_at=NOW() WHERE id=$2', [JSON.stringify(req.body), req.params.id]);
  res.json({ success: true });
});

app.get('/api/scrape/log', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM scrape_log ORDER BY ran_at DESC LIMIT 100');
    res.json(r.rows);
  } catch(e) { res.json([]); }
});

// ─── SCRAPE ENGINE ────────────────────────────────────────────
async function runScrape() {
  if (scrapeStatus.running) return;
  scrapeStatus = { running: true, startedAt: new Date().toISOString(), results: [], lastFinished: null };
  console.log('[Scraper] Starting...');
  try {
    const { runAllScrapers } = require('./run.js');
    const { scraped, results } = await runAllScrapers();
    scrapeStatus.results = results;
    await clearScrapedBids();
    for (const bid of scraped) {
      try { await saveBid(bid); } catch(e) {}
    }
    for (const r of results) {
      await pool.query('INSERT INTO scrape_log (source, count, status, message) VALUES ($1,$2,$3,$4)',
        [r.source, r.count, r.status, r.message || '']).catch(() => {});
    }
    console.log('[Scraper] Done:', scraped.length, 'bids');
  } catch(e) {
    console.error('[Scraper] Error:', e.message);
    await pool.query('INSERT INTO scrape_log (source, count, status, message) VALUES ($1,$2,$3,$4)',
      ['All', 0, 'error', e.message]).catch(() => {});
  }
  scrapeStatus.running = false;
  scrapeStatus.lastFinished = new Date().toISOString();
}

// ─── CRON ─────────────────────────────────────────────────────
require('node-cron').schedule('0 7 * * *', () => runScrape());   // Daily 7 AM
require('node-cron').schedule('0 8 * * *', async () => {          // Cleanup 8 AM
  try {
    const r = await pool.query("DELETE FROM bids WHERE updated_at < NOW() - INTERVAL '60 days' AND data->>'source' != 'Manual'");
    console.log('[Cleanup]', r.rowCount, 'old bids removed');
  } catch(e) {}
});

// ─── START ────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('[SRI Bids] Listening on port', PORT);
    setTimeout(runScrape, 8000);
  });
}).catch(err => {
  console.error('[DB] Init failed:', err.message);
  app.listen(PORT, '0.0.0.0', () => console.log('[SRI Bids] Running (no DB) on port', PORT));
});
