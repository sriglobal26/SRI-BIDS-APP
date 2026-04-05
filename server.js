const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bids (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  console.log('[DB] Ready');
}

// Normalize ANY bid format into frontend-expected format
function normalizeBid(raw, idx) {
  return {
    id: raw.id || 'bid-' + idx,
    num: String(idx + 1).padStart(2, '0'),
    name: raw.name || raw.title || raw.bidName || raw.projectName || 'Unnamed Bid',
    agency: raw.agency || raw.owner || raw.organization || raw.entity || 'Unknown Agency',
    city: raw.city || raw.location || raw.state || 'Texas',
    scope: raw.scope || raw.description || raw.workDescription || 'E&I Engineering — See RFQ link',
    due: raw.due || raw.dueDate || raw.closingDate || raw.deadline || 'See link',
    value: raw.value || raw.estimatedValue || raw.amount || 'TBD',
    status: raw.status || 'active',
    region: raw.region || detectRegion(raw.city || raw.location || ''),
    url: raw.url || raw.link || raw.bidUrl || raw.sourceUrl || '',
    source: raw.source || 'Unknown'
  };
}

function detectRegion(city) {
  const c = (city || '').toLowerCase();
  if (['houston','pearland','baytown','katy','sugar land','conroe','galveston','pasadena','league city'].some(h => c.includes(h))) return 'houston';
  if (c.includes('dallas') || c.includes('fort worth') || c.includes('plano')) return 'dfw';
  if (c.includes('austin')) return 'austin';
  if (c.includes('san antonio')) return 'sa';
  return 'statewide';
}

async function readBids() {
  const r = await pool.query('SELECT data FROM bids ORDER BY created_at DESC');
  const bids = r.rows.map((r, i) => normalizeBid(r.data, i));
  return { bids, lastUpdated: new Date().toISOString() };
}

async function saveBid(bid) {
  await pool.query(
    'INSERT INTO bids (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data=$2',
    [bid.id, JSON.stringify(bid)]
  );
}

async function clearScrapedBids() {
  await pool.query("DELETE FROM bids WHERE data->>'source' != 'manual'");
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/primes.js', (req, res) => res.sendFile(path.join(__dirname, 'primes.js')));

// Main bids endpoint — normalized format
app.get('/api/bids', async (req, res) => {
  try {
    res.json(await readBids());
  } catch(e) {
    console.error('[API] bids error:', e.message);
    res.json({ bids: [], lastUpdated: null });
  }
});

app.post('/api/scrape', (req, res) => {
  res.json({ status: 'started' });
  runScrape();
});

app.post('/api/bids', async (req, res) => {
  const bid = { id: 'manual-' + Date.now(), source: 'manual', addedAt: new Date().toISOString(), ...req.body };
  await saveBid(bid);
  res.json({ success: true, bid });
});

app.delete('/api/bids/:id', async (req, res) => {
  await pool.query('DELETE FROM bids WHERE id=$1', [req.params.id]);
  res.json({ success: true });
});

app.patch('/api/bids/:id', async (req, res) => {
  await pool.query(
    'UPDATE bids SET data = data || $1 WHERE id=$2',
    [JSON.stringify(req.body), req.params.id]
  );
  res.json({ success: true });
});

async function runScrape() {
  try {
    console.log('[Scraper] Starting...');
    const { runAllScrapers } = require('./run.js');
    const scraped = await runAllScrapers();
    await clearScrapedBids();
    for (const bid of scraped) {
      await saveBid(bid);
    }
    console.log('[Scraper] Done:', scraped.length, 'bids saved to DB');
  } catch(e) {
    console.error('[Scraper] Error:', e.message);
  }
}

// Auto-delete bids older than 30 days at 8 AM
require('node-cron').schedule('0 8 * * *', async () => {
  try {
    const r = await pool.query(
      "DELETE FROM bids WHERE created_at < NOW() - INTERVAL '30 days' AND data->>'source' != 'manual'"
    );
    console.log('[Cleanup]', r.rowCount, 'old bids deleted');
  } catch(e) { console.error('[Cleanup]', e.message); }
});

require('node-cron').schedule('0 7 * * *', runScrape);

initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('SRI Global Bids — Port:', PORT);
    setTimeout(runScrape, 5000);
  });
}).catch(err => {
  console.error('DB init failed:', err.message);
  app.listen(PORT, '0.0.0.0', () => console.log('Running — Port:', PORT));
});
