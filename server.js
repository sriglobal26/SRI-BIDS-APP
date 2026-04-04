const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// Use /tmp for storage on Railway (writable)
const DATA_FILE = '/tmp/bids.json';

function readBids() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch(e) {}
  return { bids: [], lastUpdated: null };
}

function writeBids(data) {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(data)); } catch(e) {}
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/primes.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, 'primes.js'));
});

app.get('/api/bids', (req, res) => res.json(readBids()));

app.post('/api/scrape', (req, res) => {
  res.json({ status: 'started' });
  runScrape();
});

app.post('/api/bids', (req, res) => {
  const data = readBids();
  const bid = { id: 'manual-' + Date.now(), source: 'manual', ...req.body };
  data.bids.unshift(bid);
  data.lastUpdated = new Date().toISOString();
  writeBids(data);
  res.json({ success: true, bid });
});

app.delete('/api/bids/:id', (req, res) => {
  const data = readBids();
  data.bids = data.bids.filter(b => b.id !== req.params.id);
  writeBids(data);
  res.json({ success: true });
});

app.patch('/api/bids/:id', (req, res) => {
  const data = readBids();
  const i = data.bids.findIndex(b => b.id === req.params.id);
  if (i >= 0) data.bids[i] = { ...data.bids[i], ...req.body };
  writeBids(data);
  res.json({ success: true });
});

async function runScrape() {
  try {
    console.log('[Scraper] Starting...');
    const { runAllScrapers } = require('./run.js');
    const scraped = await runAllScrapers();
    const data = readBids();
    const manuals = data.bids.filter(b => b.source === 'manual');
    const seen = new Set();
    const merged = [...scraped, ...manuals].filter(b => {
      const k = (b.name + b.agency).toLowerCase().replace(/\s+/g,'');
      return seen.has(k) ? false : seen.add(k);
    });
    writeBids({ bids: merged, lastUpdated: new Date().toISOString() });
    console.log('[Scraper] Done:', merged.length, 'bids saved');
  } catch(e) {
    console.error('[Scraper] Error:', e.message);
  }
}

require('node-cron').schedule('0 7 * * *', runScrape);

app.listen(PORT, '0.0.0.0', () => {
  console.log('SRI Global Bids — Port:', PORT);
  // Auto-scrape on startup after 10s
  setTimeout(runScrape, 10000);
});
