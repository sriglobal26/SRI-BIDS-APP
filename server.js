const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// ── Database setup ──
const { Pool } = require('pg');
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

async function readBids() {
  const r = await pool.query('SELECT data FROM bids ORDER BY created_at DESC');
  return {
    bids: r.rows.map(r => r.data),
    lastUpdated: new Date().toISOString()
  };
}

async function saveBids(bids) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM bids WHERE data->>\'source\' != \'manual\'');
    for (const bid of bids) {
      await client.query(
        'INSERT INTO bids (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data=$2',
        [bid.id, JSON.stringify(bid)]
      );
    }
    await client.query('COMMIT');
  } catch(e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function addBid(bid) {
  await pool.query(
    'INSERT INTO bids (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data=$2',
    [bid.id, JSON.stringify(bid)]
  );
}

async function deleteBid(id) {
  await pool.query('DELETE FROM bids WHERE id=$1', [id]);
}

async function updateBid(id, updates) {
  await pool.query(
    'UPDATE bids SET data = data || $1 WHERE id=$2',
    [JSON.stringify(updates), id]
  );
}

// ── Routes ──
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/primes.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, 'primes.js'));
});

app.get('/api/bids', async (req, res) => {
  try { res.json(await readBids()); }
  catch(e) { res.json({ bids: [], lastUpdated: null, error: e.message }); }
});

app.post('/api/scrape', (req, res) => {
  res.json({ status: 'started' });
  runScrape();
});

// ── Dynamics ──
async function buildDynamicsResponse() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const r = await pool.query(
    `SELECT data FROM bids
     WHERE (data->>'scrapedAt') IS NULL
        OR (data->>'scrapedAt')::timestamp >= $1::timestamp
     ORDER BY created_at DESC`,
    [cutoff]
  );
  const activeBids = r.rows.map(row => row.data);
  const seen = new Set();
  const primeContractors = activeBids
    .map(b => b.agency)
    .filter(a => a && a !== 'Unknown' && !seen.has(a) && seen.add(a));
  return {
    activeBids,
    primeContractors,
    lastUpdated: new Date().toISOString(),
    totalBids: activeBids.length,
    totalContractors: primeContractors.length
  };
}

app.get('/dynamics', async (req, res) => {
  try {
    res.json(await buildDynamicsResponse());
  } catch (e) {
    res.status(500).json({ error: e.message, activeBids: [], primeContractors: [], totalBids: 0, totalContractors: 0 });
  }
});

app.post('/dynamics', async (req, res) => {
  try {
    await runScrape();
    res.json(await buildDynamicsResponse());
  } catch (e) {
    res.status(500).json({ error: e.message, activeBids: [], primeContractors: [], totalBids: 0, totalContractors: 0 });
  }
});

app.post('/api/bids', async (req, res) => {
  const bid = { id: 'manual-' + Date.now(), source: 'manual', addedAt: new Date().toISOString(), ...req.body };
  await addBid(bid);
  res.json({ success: true, bid });
});

app.delete('/api/bids/:id', async (req, res) => {
  await deleteBid(req.params.id);
  res.json({ success: true });
});

app.patch('/api/bids/:id', async (req, res) => {
  await updateBid(req.params.id, req.body);
  res.json({ success: true });
});

// ── Scraper ──
async function runScrape() {
  try {
    console.log('[Scraper] Starting...');
    const { runAllScrapers } = require('./run.js');
    const scraped = await runAllScrapers();

    // Get existing manual bids from DB
    const existing = await readBids();
    const manuals = existing.bids.filter(b => b.source === 'manual');

    const seen = new Set();
    const merged = [...scraped, ...manuals].filter(b => {
      const k = (b.name + b.agency).toLowerCase().replace(/\s+/g,'');
      return seen.has(k) ? false : seen.add(k);
    });

    await saveBids(merged);
    console.log('[Scraper] Done:', merged.length, 'bids saved to DB');
  } catch(e) {
    console.error('[Scraper] Error:', e.message);
  }
}

require('node-cron').schedule('0 7 * * *', runScrape);

// Auto-delete bids older than 30 days — runs daily at 8 AM
require('node-cron').schedule('0 8 * * *', async () => {
  try {
    const r = await pool.query(
      "DELETE FROM bids WHERE (data->>'scrapedAt')::timestamp < NOW() - INTERVAL '30 days' AND data->>'source' != 'manual'"
    );
    console.log('[Cleanup] Deleted', r.rowCount, 'bids older than 30 days');
  } catch(e) {
    console.error('[Cleanup] Error:', e.message);
  }
});

// ── Start ──
initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('SRI Global Bids — Port:', PORT);
    setTimeout(runScrape, 10000);
  });
}).catch(err => {
  console.error('DB init failed:', err.message);
  // Start anyway without DB
  app.listen(PORT, '0.0.0.0', () => console.log('Running without DB — Port:', PORT));
});
