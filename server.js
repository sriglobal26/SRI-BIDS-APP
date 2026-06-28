// Polyfill browser globals missing in Node 18 (required by axios 1.x)
if (typeof File === 'undefined') global.File = class File {};
if (typeof Blob === 'undefined') global.Blob = class Blob {};
if (typeof FormData === 'undefined') global.FormData = class FormData {};

const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
const fs = require('fs');

// Serve index.html with bids injected from database
app.get('/', async (req, res) => {
  try {
    let html = fs.readFileSync(__dirname + '/index.html', 'utf8');
    
    // Get bids from database
    const data = await readBids();
    const bidsJson = JSON.stringify(data.bids || []);
    
    // Replace ANY form of BIDS declaration with live data
    html = html
      .replace(/const BIDS=\[[\s\S]*?\];/, 'let BIDS=' + bidsJson + ';')
      .replace(/const BIDS = \[[\s\S]*?\];/, 'let BIDS=' + bidsJson + ';')
      .replace(/let BIDS = \[\];.*?\/\/ loaded from \/api\/bids/, 'let BIDS=' + bidsJson + ';')
      .replace(/let BIDS = \[\];/, 'let BIDS=' + bidsJson + ';');
    
    // Also inject lastUpdated
    if (data.lastUpdated) {
      html = html.replace(
        '</body>',
        '<script>document.addEventListener("DOMContentLoaded",function(){' +
        'var el=document.getElementById("last-pull-time");' +
        'if(el)el.textContent=new Date("' + data.lastUpdated + '").toLocaleString();' +
        '});</script></body>'
      );
    }
    
    res.send(html);
  } catch(e) {
    console.error('[Server] Serve error:', e.message);
    res.sendFile(__dirname + '/index.html');
  }
});

app.use(express.static(__dirname));

// ─── DATABASE ────────────────────────────────────────────────
// Use internal Railway URL (free, no egress fees)
// SSL disabled for internal Railway connections
const dbUrl = process.env.DATABASE_URL;

let poolConfig;
try {
  const u = new URL(dbUrl);
  poolConfig = {
    host: u.hostname,
    port: parseInt(u.port) || 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace('/', ''),
    ssl: false,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
    max: 10
  };
  console.log('[DB] Connecting to:', u.hostname + ':' + (u.port || 5432));
} catch(e) {
  console.error('[DB] URL parse error:', e.message);
  poolConfig = {
    connectionString: dbUrl,
    ssl: false
  };
}

const pool = new Pool(poolConfig);

async function initDB() {
  // Create tables if not exist
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS primes (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  // Migration — add updated_at if missing (old deployments)
  await pool.query(`
    ALTER TABLE bids ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()
  `).catch(() => {});
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
  // Include userState so frontend can restore select/delete status
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
    let body = { ...req.body };

    // Parse all fields from EnviroBidNet email HTML
    if (body.html) {
      const html = body.html.replace(/&amp;/g,'&').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
      const rawHtml = body.html.replace(/&amp;/g,'&');

      // Extract Bid ID
      if (!body.bidId) {
        const bidIdMatch = html.match(/[Bb]id\s*[#ID:]+\s*(\d+)/) ||
                           html.match(/[Ss]olicitation\s*[#:]+\s*([A-Z0-9-]+)/);
        if (bidIdMatch) body.bidId = bidIdMatch[1];
      }

      // Extract Bid Description / Name
      if (!body.name || body.name === 'Unnamed Bid' || body.name === '') {
        if (body.subject && body.subject.trim()) {
          body.name = body.subject.trim();
        } else {
          const descMatch = html.match(/[Bb]id\s*[Dd]escription[:\s]+([^\n]{10,100})/);
          if (descMatch) body.name = descMatch[1].trim();
        }
      }

      // Extract Expiration / Due Date
      if (!body.due || body.due === 'See email') {
        const expMatch = html.match(/[Ee]xpir\w*[:\s]+([0-9]{1,2}[/\-][0-9]{1,2}[/\-][0-9]{2,4})/) ||
                         html.match(/[Dd]ue\s*[Dd]ate[:\s]+([0-9]{1,2}[/\-][0-9]{1,2}[/\-][0-9]{2,4})/) ||
                         html.match(/[Cc]losing[:\s]+([0-9]{1,2}[/\-][0-9]{1,2}[/\-][0-9]{2,4})/) ||
                         html.match(/([0-9]{1,2}[/\-][0-9]{1,2}[/\-][0-9]{4})/);
        if (expMatch) body.due = expMatch[1];
      }

      // Extract Agency / Organization
      if (!body.agency || body.agency === 'Unknown Agency' || body.agency === '') {
        const agencyMatch = html.match(/[Aa]gency[:\s]+([^\n]{5,80})/) ||
                            html.match(/[Oo]rganization[:\s]+([^\n]{5,80})/) ||
                            html.match(/[Pp]osted\s+by[:\s]+([^\n]{5,80})/);
        if (agencyMatch) body.agency = agencyMatch[1].trim();
        else body.agency = 'EnviroBidNet';
      }

      // Extract scope/description
      if (!body.scope || body.scope === 'E&I Engineering — See RFQ link') {
        const scopeMatch = html.match(/[Dd]escription[:\s]+([^\n]{20,200})/);
        if (scopeMatch) body.scope = scopeMatch[1].trim();
      }

      // Extract View Bid URL - Priority order
      if (!body.url) {
        // EnviroBidNet subscriber view bid URL (exact format)
        const ebnViewMatch = rawHtml.match(/https?:\/\/(?:www\.)?envirobidnet\.com\/subscriber_view_bid\/\d+[^\s"<>'\)\]]*/) ||
                             rawHtml.match(/https?:\/\/(?:www\.)?envirobidnet\.com\/[^\s"<>'\)\]]+/i);
        if (ebnViewMatch) body.url = ebnViewMatch[0];
      }
      if (!body.url) {
        const ccMatch = rawHtml.match(/https?:\/\/(?:www\.)?civcastusa\.com\/[^\s"<>'\)\]]+/i);
        if (ccMatch) body.url = ccMatch[0];
      }
      if (!body.url) {
        body.url = 'https://www.envirobidnet.com/search_bids';
      }
    }

    // Default URL if still empty
    if (!body.url || body.url === '') {
      const from = (body.from || body.agency || body.name || '').toLowerCase();
      if (from.includes('civcast')) {
        body.url = 'https://www.civcastusa.com/bids';
      } else {
        body.url = 'https://www.envirobidnet.com/search_bids';
      }
    }

    // Fix name - replace Unnamed Bid
    if (!body.name || body.name.trim() === '' || body.name === 'Unnamed Bid') {
      const from = (body.from || body.agency || '').toLowerCase();
      body.name = body.subject && body.subject.trim() !== ''
        ? body.subject.trim()
        : from.includes('civcast')
          ? 'CivCast — Texas E&I Bid Alert'
          : 'EnviroBidNet — Texas E&I Bid Alert';
    }

    // Fix agency
    if (!body.agency || body.agency === 'Unknown Agency') {
      const from = (body.from || '').toLowerCase();
      body.agency = from.includes('civcast') ? 'CivCast USA' : 'EnviroBidNet';
    }

    const bid = { id: 'manual-' + Date.now(), source: 'Email Alert', addedAt: new Date().toISOString(), ...body };
    console.log('[POST /api/bids] Name:', bid.name, '| URL:', bid.url?.slice(0,60));
    await saveBid(bid);
    res.json({ success: true, bid });
  } catch(e) { 
    console.error('[POST /api/bids] Error:', e.message);
    res.status(500).json({ success: false, error: e.message }); 
  }
});

// Fix all existing unnamed bids
app.post('/api/fix-unnamed', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE bids SET data = jsonb_set(jsonb_set(jsonb_set(data,
        '{url}', to_jsonb('https://www.envirobidnet.com/search_bids'::text)),
        '{name}', to_jsonb('EnviroBidNet - Texas E&I Bid Alert'::text)),
        '{agency}', to_jsonb('EnviroBidNet'::text))
      WHERE (data->>'name' IS NULL OR data->>'name' = '' OR data->>'name' = 'Unnamed Bid')
      OR (data->>'url' IS NULL OR data->>'url' = '')`
    );
    console.log('[Fix] Updated', result.rowCount, 'unnamed bids');
    res.json({ success: true, updated: result.rowCount });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Parse multiple bids from one EnviroBidNet email ──
// Debug endpoint - shows what Make.com sends
app.get('/api/email-bids/debug', (req, res) => {
  res.json({ status: 'email-bids endpoint is active', method: 'POST required' });
});

// Store last received for debugging
let lastReceived = null;
app.get('/api/email-bids/last', (req, res) => {
  res.json(lastReceived || { message: 'No data received yet' });
});

app.post('/api/email-bids', async (req, res) => {
  lastReceived = {
    subject: req.body.subject,
    from: req.body.from,
    hasHtml: !!req.body.html,
    htmlLength: (req.body.html||'').length,
    hasText: !!req.body.text,
    textLength: (req.body.text||'').length,
    htmlPreview: (req.body.html||'').slice(0,200),
    receivedAt: new Date().toISOString()
  };
  console.log('[Email Bids] Received:', JSON.stringify(lastReceived));
  try {
    const { html, subject, from } = req.body;
    if (!html) return res.json({ success: false, error: 'No HTML provided' });

    const rawHtml = html.replace(/&amp;/g, '&');
    
    // Extract all subscriber_view_bid URLs with their bid IDs
    const bidUrlPattern = /https?:\/\/(?:www\.)?envirobidnet\.com\/subscriber_view_bid\/(\d+)[^\s"<>\)\]]*/gi;
    const matches = [...rawHtml.matchAll(bidUrlPattern)];
    
    // Remove duplicates by bid ID
    const seen = new Set();
    const uniqueMatches = matches.filter(m => {
      if (seen.has(m[1])) return false;
      seen.add(m[1]);
      return true;
    });

    if (uniqueMatches.length === 0) {
      // Fall back to single bid processing
      const singleUrl = rawHtml.match(/https?:\/\/(?:www\.)?envirobidnet\.com\/subscriber_view_bid\/\d+[^\s"<>\)\]]*/i);
      const bid = {
        id: 'ebn-' + Date.now(),
        name: subject || 'EnviroBidNet — Texas E&I Bid Alert',
        agency: 'EnviroBidNet',
        city: 'Texas',
        region: 'statewide',
        scope: 'E&I Engineering — See RFQ link',
        due: 'See link',
        value: 'TBD',
        status: 'active',
        source: 'EnviroBidNet',
        url: singleUrl ? singleUrl[0] : 'https://www.envirobidnet.com/search_bids',
        scrapedAt: new Date().toISOString()
      };
      await saveBid(bid);
      return res.json({ success: true, created: 1, bids: [bid] });
    }

    // Plain text for extracting descriptions and dates
    const plainText = rawHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    
    const createdBids = [];
    
    for (const match of uniqueMatches) {
      const bidId = match[1];
      const bidUrl = match[0];
      
      // Find bid description near this bid ID in plain text
      const bidIdPos = plainText.indexOf(bidId);
      let name = 'EnviroBidNet — Texas E&I Bid Alert';
      let due = 'See link';
      let agency = 'EnviroBidNet';
      let scope = 'E&I Engineering — See RFQ link';
      
      if (bidIdPos > -1) {
        // Get text around the bid ID (500 chars after)
        const context = plainText.substring(Math.max(0, bidIdPos - 20), bidIdPos + 500);

        // Extract description - text after bid ID
        const descMatch = context.match(new RegExp(bidId + '[^\\d]([^\n]{10,300})'));
        if (descMatch) {
          const rawDesc = descMatch[1].trim();
          name = rawDesc.slice(0, 200);
          scope = rawDesc.slice(0, 500);
        }

        // Extract expiration date - multiple formats
        const expMatch = context.match(/[Ee]xpir\w*[s]?[:\s]+(\d{4}-\d{2}-\d{2})/) ||
                         context.match(/[Ee]xpir\w*[s]?[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/) ||
                         context.match(/(\d{4}-\d{2}-\d{2})/) ||
                         context.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/);
        if (expMatch) due = expMatch[1];

        // Extract agency - text before colon at start
        const agencyMatch = name.match(/^([A-Za-z0-9]+(?:[\s\-][A-Za-z0-9]+)?)[:\s]/);
        if (agencyMatch) agency = agencyMatch[1].trim();
      }
      
      const bid = {
        id: 'ebn-' + bidId,
        name: (name || subject || 'EnviroBidNet Bid #' + bidId).slice(0, 200),
        agency: agency || 'EnviroBidNet',
        city: 'Texas',
        region: 'statewide',
        scope: scope || 'E&I Engineering — See RFQ link',
        due: due || 'See link',
        value: 'TBD',
        status: 'active',
        source: 'EnviroBidNet',
        bidId: '#' + bidId,
        url: bidUrl,
        scrapedAt: new Date().toISOString()
      };
      
      await saveBid(bid);
      createdBids.push(bid);
      console.log('[Email Bid] Created: #' + bidId, name.slice(0,50), '| Due:', due, '| URL:', bidUrl.slice(0,60));
    }
    
    res.json({ success: true, created: createdBids.length, bids: createdBids });
  } catch(e) {
    console.error('[Email Bids] Error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
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

// ─── PRIMES API ──────────────────────────────────────────────
app.get('/api/primes', async (req, res) => {
  try {
    const r = await pool.query('SELECT data FROM primes ORDER BY created_at ASC');
    res.json({ primes: r.rows.map(r => r.data) });
  } catch(e) { res.json({ primes: [] }); }
});

app.post('/api/primes', async (req, res) => {
  try {
    const prime = { ...req.body, updatedAt: new Date().toISOString() };
    await pool.query(
      'INSERT INTO primes (id, data, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (id) DO UPDATE SET data=$2, updated_at=NOW()',
      [prime.id, JSON.stringify(prime)]
    );
    res.json({ success: true, prime });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete('/api/primes/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM primes WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.patch('/api/primes/:id', async (req, res) => {
  try {
    await pool.query(
      'UPDATE primes SET data = data || $1, updated_at=NOW() WHERE id=$2',
      [JSON.stringify(req.body), req.params.id]
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
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
require('node-cron').schedule('0 23 * * *', () => runScrape());  // Daily 6 PM EST
require('node-cron').schedule('0 8 * * *', async () => {          // Cleanup 8 AM EST
  try {
    // Remove scraped bids older than 60 days
    const r1 = await pool.query("DELETE FROM bids WHERE updated_at < NOW() - INTERVAL '60 days' AND data->>'source' != 'Manual'");
    console.log('[Cleanup] Old bids removed:', r1.rowCount);

    // Remove deleted/expired bids every 15 days
    const r2 = await pool.query(`
      DELETE FROM bids 
      WHERE data->>'userState' = 'deleted'
      AND updated_at < NOW() - INTERVAL '15 days'
    `);
    console.log('[Cleanup] Deleted bids purged:', r2.rowCount);
  } catch(e) { console.error('[Cleanup]', e.message); }
});

// ─── START ────────────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, '0.0.0.0', async () => {
    console.log('[SRI Bids] Listening on port', PORT);
    // Auto-fix all unnamed bids with EnviroBidNet URL
    try {
      const r = await pool.query(
        `UPDATE bids SET data = jsonb_set(jsonb_set(jsonb_set(data,
          '{url}', '"https://www.envirobidnet.com/search_bids"'),
          '{name}', '"EnviroBidNet — Texas E&I Bid Alert"'),
          '{agency}', '"EnviroBidNet"')
        WHERE (data->>'name' IS NULL OR data->>'name' = '' OR data->>'name' = 'Unnamed Bid')
        OR (data->>'url' IS NULL OR data->>'url' = '')`
      );
      if(r.rowCount > 0) console.log('[AutoFix] Updated', r.rowCount, 'unnamed bids');
    } catch(e) { console.warn('[AutoFix]', e.message); }
    setTimeout(runScrape, 8000);
  });
}).catch(err => {
  console.error('[DB] Init failed:', err.message);
  app.listen(PORT, '0.0.0.0', () => console.log('[SRI Bids] Running (no DB) on port', PORT));
});
