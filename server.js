const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/primes.js', (req, res) => {
  res.type('application/javascript');
  res.sendFile(require('path').join(__dirname, 'primes.js'));
});

let bids = [];
app.get('/api/bids', (req, res) => res.json({ bids, lastUpdated: new Date().toISOString() }));
app.post('/api/bids', (req, res) => {
  const bid = { id: 'manual-' + Date.now(), source: 'manual', ...req.body };
  bids.unshift(bid); res.json({ success: true, bid });
});
app.delete('/api/bids/:id', (req, res) => {
  bids = bids.filter(b => b.id !== req.params.id); res.json({ success: true });
});
app.patch('/api/bids/:id', (req, res) => {
  const i = bids.findIndex(b => b.id === req.params.id);
  if (i >= 0) bids[i] = { ...bids[i], ...req.body }; res.json({ success: true });
});
app.post('/api/scrape', (req, res) => {
  res.json({ status: 'started' }); runScrape();
});

async function runScrape() {
  try {
    const { runAllScrapers } = require('./run');
    const scraped = await runAllScrapers();
    const manuals = bids.filter(b => b.source === 'manual');
    const seen = new Set();
    bids = [...scraped, ...manuals].filter(b => {
      const k = (b.name+b.agency).toLowerCase().replace(/\s+/g,'');
      return seen.has(k) ? false : seen.add(k);
    });
    console.log('Done:', bids.length, 'bids');
  } catch(e) { console.error('Scrape error:', e.message); }
}

require('node-cron').schedule('0 7 * * *', runScrape);
app.listen(PORT, '0.0.0.0', () => console.log('Port:', PORT));
