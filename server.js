const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  await pool.query(`CREATE TABLE IF NOT EXISTS bids (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )`);
  console.log('[DB] Ready');
}

function normalizeBid(raw, idx) {
  return {
    id: raw.id || 'bid-'+idx,
    num: String(idx+1).padStart(2,'0'),
    name: raw.name||raw.title||raw.bidName||'Unnamed Bid',
    agency: raw.agency||raw.owner||raw.organization||'Unknown Agency',
    city: raw.city||raw.location||'Texas',
    scope: raw.scope||raw.description||'E&I Engineering — See RFQ link',
    due: raw.due||raw.dueDate||raw.closingDate||'See link',
    value: raw.value||raw.estimatedValue||'TBD',
    status: raw.status||'active',
    region: raw.region||'statewide',
    url: raw.url||raw.link||'',
    source: raw.source||'Unknown'
  };
}

// ── Serve index.html explicitly ──
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/primes.js', (req, res) => res.sendFile(path.join(__dirname, 'primes.js')));
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── API ──
app.get('/api/bids', async (req, res) => {
  try {
    const r = await pool.query('SELECT data FROM bids ORDER BY created_at DESC');
    res.json({ bids: r.rows.map((r,i) => normalizeBid(r.data,i)), lastUpdated: new Date().toISOString() });
  } catch(e) { res.json({ bids: [], lastUpdated: null }); }
});

app.post('/api/scrape', (req, res) => {
  res.json({ status: 'started' });
  runScrape();
});

app.post('/api/bids', async (req, res) => {
  const bid = { id:'manual-'+Date.now(), source:'manual', ...req.body };
  await pool.query('INSERT INTO bids(id,data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=$2', [bid.id, JSON.stringify(bid)]);
  res.json({ success:true, bid });
});

app.delete('/api/bids/:id', async (req, res) => {
  await pool.query('DELETE FROM bids WHERE id=$1', [req.params.id]);
  res.json({ success:true });
});

app.patch('/api/bids/:id', async (req, res) => {
  await pool.query('UPDATE bids SET data=data||$1 WHERE id=$2', [JSON.stringify(req.body), req.params.id]);
  res.json({ success:true });
});

async function runScrape() {
  try {
    console.log('[Scraper] Starting...');
    const { runAllScrapers } = require('./run.js');
    const scraped = await runAllScrapers();
    await pool.query("DELETE FROM bids WHERE data->>'source' != 'manual'");
    for (const bid of scraped) {
      await pool.query('INSERT INTO bids(id,data) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET data=$2', [bid.id, JSON.stringify(bid)]);
    }
    console.log('[Scraper] Done:', scraped.length, 'bids saved');
  } catch(e) { console.error('[Scraper]', e.message); }
}

require('node-cron').schedule('0 7 * * *', runScrape);

initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('SRI Global — Port:', PORT);
    setTimeout(runScrape, 5000);
  });
}).catch(e => {
  console.error('DB failed:', e.message);
  app.listen(PORT, '0.0.0.0', () => console.log('Running — Port:', PORT));
});
