// Polyfill browser globals missing in Node 18 (required by axios 1.x)
if (typeof File === 'undefined') global.File = class File {};
if (typeof Blob === 'undefined') global.Blob = class Blob {};
if (typeof FormData === 'undefined') global.FormData = class FormData {};

const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const https = require('https');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(__dirname, { index: false }));

// ─── DATABASE ────────────────────────────────────────────────
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
  poolConfig = { connectionString: dbUrl, ssl: false };
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS primes (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE bids ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`).catch(() => {});
  console.log('[DB] Ready');

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
    scrapedAt: raw.scrapedAt || new Date().toISOString(),
    // EnviroBidNet detail fields
    bidNumber: raw.bidNumber || '',
    address: raw.address || '',
    state: raw.state || '',
    zip: raw.zip || '',
    plansAvailable: raw.plansAvailable || '',
    contactName: raw.contactName || '',
    contactPhone: raw.contactPhone || '',
    contactEmail: raw.contactEmail || '',
    category: raw.category || '',
    fullDescription: raw.fullDescription || ''
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

// ─── ENVIROBIDNET DETAIL SCRAPER ─────────────────────────────
// Fetches full bid details from EnviroBidNet using your session cookies
// Since you are logged in on your browser, we scrape the page server-side
function fetchUrl(url, cookies) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cookie': cookies || '',
        'Referer': 'https://www.envirobidnet.com/'
      },
      timeout: 15000
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ html: data, status: res.statusCode, headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

function parseEnviroBidNetPage(html) {
  // Extract fields from the VIEW BID page
  const get = (label) => {
    // Match label followed by value in table cell
    const patterns = [
      new RegExp(label + '[:\\s]*<\\/[^>]+>\\s*<[^>]+>([^<]{1,300})', 'i'),
      new RegExp('<td[^>]*>' + label + '[^<]*<\\/td>\\s*<td[^>]*>([^<]{1,300})', 'i'),
      new RegExp(label + '[^<]*<\\/[^>]+>[^<]*<[^>]+>([^<]{1,300})', 'i')
    ];
    for (const p of patterns) {
      const m = html.match(p);
      if (m && m[1].trim()) return m[1].trim();
    }
    return '';
  };

  // Extract plain text for easier parsing
  const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  const extract = (label) => {
    const m = plain.match(new RegExp(label + '[:\\s]+([^\\|]{2,200}?)(?:\\s{2,}|Bid |Agency|Address|City|State|Zip|Plans|Contact|Phone|Email|Fax|$)', 'i'));
    return m ? m[1].trim().replace(/\s+/g, ' ') : '';
  };

  return {
    bidNumber:       extract('Bid Number'),
    category:        extract('Categor(?:y|ies)'),
    fullDescription: extract('Bid Description'),
    agency:          extract('Agency\\/Organization Name') || extract('Agency'),
    address:         extract('Address'),
    city:            extract('City'),
    state:           extract('State(?:s)?'),
    zip:             extract('Zip Code'),
    plansAvailable:  extract('Plans Available'),
    due:             extract('Bid Expiration') || extract('Expiration'),
    contactName:     extract('Contact Name'),
    contactPhone:    extract('Phone Number') || extract('Phone'),
    contactEmail:    extract('Email'),
  };
}

// Store EnviroBidNet cookies (set via API)
let ebnCookies = process.env.EBN_COOKIES || '';

// ─── ROUTES ──────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: Math.round(process.uptime()), timestamp: new Date().toISOString() });
});

// Set EnviroBidNet cookies for scraping
app.post('/api/ebn-cookies', (req, res) => {
  ebnCookies = req.body.cookies || '';
  res.json({ success: true, length: ebnCookies.length });
});

// Serve index.html with bids injected from database
const fs = require('fs');
app.get('/', async (req, res) => {
  try {
    let html = fs.readFileSync(__dirname + '/index.html', 'utf8');
    const r = await pool.query('SELECT data FROM bids ORDER BY created_at DESC');
    const seen = new Set();
    const bids = r.rows
      .map((row, i) => {
        const b = row.data;
        return {
          id: b.id || 'bid-'+i,
          num: String(i+1).padStart(2,'0'),
          name: b.name || 'Unnamed Bid',
          agency: b.agency || 'Unknown',
          city: b.city || 'Texas',
          scope: b.scope || 'E&I Engineering',
          due: b.due || 'See link',
          value: b.value || 'TBD',
          status: b.status || 'active',
          region: b.region || 'statewide',
          url: b.url || '',
          source: b.source || 'Unknown',
          bidId: b.bidId || '',
          userState: b.userState || 'active',
          // Full detail fields
          bidNumber: b.bidNumber || '',
          category: b.category || '',
          fullDescription: b.fullDescription || '',
          address: b.address || '',
          state: b.state || '',
          zip: b.zip || '',
          plansAvailable: b.plansAvailable || '',
          contactName: b.contactName || '',
          contactPhone: b.contactPhone || '',
          contactEmail: b.contactEmail || ''
        };
      })
      .filter(b => {
        const key = b.name + '|' + b.agency;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    const bidsJson = JSON.stringify(bids);
    html = html.replace('let BIDS=[];', 'let BIDS=' + bidsJson + ';');
    res.send(html);
  } catch(e) {
    console.error('[Serve]', e.message);
    res.sendFile(__dirname + '/index.html');
  }
});

// Clean up duplicate bids
app.get('/api/cleanup', async (req, res) => {
  try {
    const r = await pool.query(`
      DELETE FROM bids WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY data->>'name' ORDER BY created_at DESC) rn
          FROM bids
          WHERE data->>'source' != 'EnviroBidNet' OR data->>'name' != 'EnviroBidNet — Texas E&I Bid Alert'
        ) t WHERE rn > 1
      )
    `);
    const r2 = await pool.query(`DELETE FROM bids WHERE data->>'name' = 'EnviroBidNet — Texas E&I Bid Alert'`);
    res.json({ success: true, removed: r.rowCount + r2.rowCount });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/bids', async (req, res) => {
  try { res.json(await readBids()); }
  catch(e) { res.json({ bids: [], lastUpdated: null, total: 0, error: e.message }); }
});

// ── NEW: Get full bid details for a specific EnviroBidNet bid ──
app.get('/api/bid-detail/:bidId', async (req, res) => {
  try {
    const bidId = req.params.bidId;

    // First check if we already have full details in DB
    const dbResult = await pool.query("SELECT data FROM bids WHERE id = $1 OR data->>'bidId' = $2", ['ebn-' + bidId, '#' + bidId]);
    if (dbResult.rows.length > 0) {
      const b = dbResult.rows[0].data;
      // If we already have full description, return it
      if (b.fullDescription && b.fullDescription.length > 20) {
        return res.json({ success: true, source: 'cache', data: b });
      }
    }

    // Scrape fresh from EnviroBidNet
    const url = `https://www.envirobidnet.com/subscriber_view_bid/${bidId}`;
    console.log('[EBN Detail] Fetching:', url);

    const result = await fetchUrl(url, ebnCookies);

    if (result.status === 302 || result.html.includes('Log into Envirobidnet')) {
      return res.json({
        success: false,
        error: 'login_required',
        message: 'EnviroBidNet requires login. Please set cookies via /api/ebn-cookies',
        url: url
      });
    }

    const details = parseEnviroBidNetPage(result.html);
    console.log('[EBN Detail] Parsed:', JSON.stringify(details).slice(0, 200));

    // Update the bid in database with full details
    if (dbResult.rows.length > 0) {
      const existing = dbResult.rows[0].data;
      const updated = { ...existing, ...details, url };
      await saveBid(updated);
    }

    res.json({ success: true, source: 'live', data: details, url });
  } catch(e) {
    console.error('[EBN Detail] Error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
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

// Debug helpers
let lastEmailReceived = null;
app.get('/api/email-bids/debug', (req, res) => {
  res.json({ status: 'email-bids endpoint is active', method: 'POST required', ebnCookiesSet: ebnCookies.length > 0 });
});
app.get('/api/email-bids/last', (req, res) => {
  res.json(lastEmailReceived || { message: 'No data received yet' });
});

// Debug: show full email content to check what Make.com sends
app.get('/api/email-bids/full', (req, res) => {
  if(!lastEmailReceived) return res.json({message: 'No email received yet'});
  res.json({
    ...lastEmailReceived,
    fullHtml: (lastEmailReceived.fullHtml || '').slice(0, 2000),
    fullText: (lastEmailReceived.fullText || '').slice(0, 2000)
  });
});

// ── Parse multiple bids from EnviroBidNet email ──
app.post('/api/email-bids', async (req, res) => {
  try {
    const { html, text, subject, from } = req.body || {};
    lastEmailReceived = {
      subject, from,
      hasHtml: !!html, htmlLength: (html||'').length,
      hasText: !!text, textLength: (text||'').length,
      htmlPreview: (html||'').slice(0,500),
      textPreview: (text||'').slice(0,500),
      fullHtml: (html||'').slice(0,5000),
      fullText: (text||'').slice(0,5000),
      receivedAt: new Date().toISOString()
    };

    console.log('[Email Bids] Received from:', from, '| Subject:', subject);

    if (!html && !text) return res.json({ success: false, error: 'No HTML provided' });

    const rawHtml = (html || text || '').replace(/&amp;/g, '&');
    const plainText = rawHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    // Extract all EnviroBidNet bid links
    // Match direct URLs and encoded URLs
    const bidUrlPattern = /https?:\/\/(?:www\.)?envirobidnet\.com\/subscriber_view_bid\/(\d+)/gi;
    // Also search in raw HTML for encoded URLs
    const encodedPattern = /envirobidnet\.com(?:%2F|\/|%2f)subscriber_view_bid(?:%2F|\/|%2f)(\d+)/gi;
    const matches = [...plainText.matchAll(bidUrlPattern)];
    // Also check raw HTML for encoded URLs
    const encodedMatches = [...rawHtml.matchAll(encodedPattern)];
    const allMatches = [...matches, ...encodedMatches];

    const seen = new Set();
    const uniqueMatches = allMatches.filter(m => {
      if (seen.has(m[1])) return false;
      seen.add(m[1]);
      return true;
    });

    console.log('[Email Bids] Found', uniqueMatches.length, 'unique bid links');

    if (uniqueMatches.length === 0) {
      return res.json({ success: false, error: 'No bid links found in email', preview: plainText.slice(0, 300) });
    }

    const createdBids = [];

    for (const match of uniqueMatches) {
      const bidId = match[1];
      const bidUrl = `https://www.envirobidnet.com/subscriber_view_bid/${bidId}`;

      // Extract basic info from email text around bid ID
      let name = 'EnviroBidNet Bid #' + bidId;
      let due = 'See link';
      let agency = 'EnviroBidNet';
      let scope = 'E&I Engineering — See RFQ link';
      let city = 'Texas';

      // Find context around this bid ID in the email
      const bidIdPos = plainText.indexOf(bidId);
      if (bidIdPos > -1) {
        const context = plainText.substring(Math.max(0, bidIdPos - 50), bidIdPos + 600);

        // Extract description (text after bid ID)
        const descMatch = context.match(new RegExp(bidId + '[^\\d\\s]?\\s*([A-Z][^\\n]{10,300})'));
        if (descMatch) {
          name = descMatch[1].trim().slice(0, 200);
          scope = descMatch[1].trim().slice(0, 500);
        }

        // Extract expiry date
        const expMatch = context.match(/[Ee]xpir\w*[:\s]+(\d{4}-\d{2}-\d{2})/) ||
                         context.match(/(\d{4}-\d{2}-\d{2})/) ||
                         context.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/);
        if (expMatch) due = expMatch[1];

        // Extract city/state
        const cityMatch = context.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)?),\s*([A-Z]{2})/);
        if (cityMatch) city = cityMatch[1] + ', ' + cityMatch[2];

        // Extract agency from beginning of description
        const agencyMatch = name.match(/^([^:]{3,40}):/);
        if (agencyMatch) agency = agencyMatch[1].trim();
      }

      // Try to scrape full details from EnviroBidNet if cookies are set
      let fullDetails = {};
      if (ebnCookies) {
        try {
          console.log('[Email Bids] Scraping details for bid #' + bidId);
          const result = await fetchUrl(bidUrl, ebnCookies);
          if (!result.html.includes('Log into Envirobidnet')) {
            fullDetails = parseEnviroBidNetPage(result.html);
            if (fullDetails.agency) agency = fullDetails.agency;
            if (fullDetails.due) due = fullDetails.due;
            if (fullDetails.city) city = fullDetails.city;
            if (fullDetails.fullDescription) scope = fullDetails.fullDescription;
            console.log('[Email Bids] Got full details for #' + bidId);
          }
        } catch(scrapeErr) {
          console.log('[Email Bids] Could not scrape #' + bidId + ':', scrapeErr.message);
        }
      }

      const bid = {
        id: 'ebn-' + bidId,
        name: (name || 'EnviroBidNet Bid #' + bidId).slice(0, 200),
        agency: agency || 'EnviroBidNet',
        city: city || 'Texas',
        region: detectRegion(city),
        scope: scope || 'E&I Engineering — See RFQ link',
        due: due || 'See link',
        value: 'TBD',
        status: 'active',
        source: 'EnviroBidNet',
        bidId: '#' + bidId,
        url: bidUrl,
        scrapedAt: new Date().toISOString(),
        // Full detail fields from scraping
        ...fullDetails
      };

      await saveBid(bid);
      createdBids.push(bid);
      console.log('[Email Bid] Saved: #' + bidId, '|', name.slice(0,60), '| Due:', due);
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
require('node-cron').schedule('0 23 * * *', () => runScrape());
require('node-cron').schedule('0 8 * * *', async () => {
  try {
    const r1 = await pool.query("DELETE FROM bids WHERE updated_at < NOW() - INTERVAL '60 days' AND data->>'source' != 'Manual'");
    console.log('[Cleanup] Old bids removed:', r1.rowCount);
    const r2 = await pool.query(`DELETE FROM bids WHERE data->>'userState' = 'deleted' AND updated_at < NOW() - INTERVAL '15 days'`);
    console.log('[Cleanup] Deleted bids purged:', r2.rowCount);
  } catch(e) { console.error('[Cleanup]', e.message); }
});

// ─── START ────────────────────────────────────────────────────
// Start server immediately - don't wait for DB
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('[SRI Bids] Listening on port', PORT);
});

// Init DB after server is already listening
initDB().then(() => {
  console.log('[SRI Bids] DB connected - starting scraper');
  setTimeout(runScrape, 8000);
}).catch(err => {
  console.error('[DB] Init failed:', err.message);
  console.log('[SRI Bids] Running without DB');
});
