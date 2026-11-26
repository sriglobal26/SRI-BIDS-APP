// Reads BidSpeed (FedBids) emails straight from the mailbox, so Make.com is not needed.
// Turned on only when IMAP_HOST, IMAP_USER and IMAP_PASS are set in Railway Variables.
// Safe to run repeatedly: the FedBids ingest skips bids it already has.
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

const state = { configured:false, lastRun:null, lastError:null, lastFound:0, lastSaved:0, lastSkipped:0, folder:null, mailboxTotal:null, recentInFolder:null, folders:null };

function hrefs(html){
  const out = [];
  String(html||'').replace(/href=["']([^"']+)["']/gi, (_,u)=>{ out.push(u.replace(/&amp;/g,'&')); return ''; });
  return out;
}

// Turn one raw email into the {subject, body} the ingest function expects.
async function toIngestInput(source){
  const m = await simpleParser(source);
  const text = m.text || String(m.html||'').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ');
  const links = hrefs(m.html).filter(u=>/fedbidspeed/i.test(u)).join('\n');
  return { subject: m.subject||'', body: (text||'').replace(/\s+/g,' ').trim()+'\n'+links, from: (m.from&&m.from.text)||'' };
}

async function pollOnce(ingest){
  const host = process.env.IMAP_HOST, user = process.env.IMAP_USER, pass = process.env.IMAP_PASS;
  if(!host || !user || !pass){ state.configured = false; return state; }
  state.configured = true;
  const days = Math.max(1, parseInt(process.env.MAIL_DAYS||'30',10));
  const since = new Date(Date.now() - days*86400000);
  const client = new ImapFlow({ host, port: parseInt(process.env.IMAP_PORT||'993',10), secure: process.env.IMAP_SECURE!=='false',
    auth:{ user, pass }, logger:false });
  let found=0, saved=0, skipped=0;
  try {
    await client.connect();
    const lock = await client.getMailboxLock(process.env.IMAP_FOLDER||'INBOX');
    try {
      state.folder = process.env.IMAP_FOLDER||'INBOX';
      state.mailboxTotal = client.mailbox && client.mailbox.exists;
      const recent = await client.search({ since }, { uid:true });
      state.recentInFolder = recent.length;
      // BidSpeed emails: from fedbidspeed, or mention BidSpeed / FedBid in the subject or body
      const uids = await client.search({ since, or:[{from:'fedbidspeed'},{subject:'bidspeed'},{subject:'fedbid'},{body:'fedbidspeed'}] }, { uid:true });
      found = uids.length;
      for(const uid of uids){
        const msg = await client.fetchOne(uid, { source:true }, { uid:true });
        const input = await toIngestInput(msg.source);
        const r = await ingest(input);
        if(r && (r.skipped)) skipped++; else saved++;
      }
    } finally { lock.release(); }
    try { state.folders = (await client.list()).map(f=>f.path).slice(0,30); } catch(_){}
    await client.logout();
    state.lastError = null;
  } catch(e){
    state.lastError = String(e && e.message || e);
    try { await client.logout(); } catch(_){}
  }
  Object.assign(state, { lastRun:new Date().toISOString(), lastFound:found, lastSaved:saved, lastSkipped:skipped });
  return state;
}

function start(ingest){
  if(!process.env.IMAP_HOST || !process.env.IMAP_USER || !process.env.IMAP_PASS){
    console.log('[Mail] IMAP_HOST / IMAP_USER / IMAP_PASS not set - mailbox reader is off');
    return;
  }
  const run = () => pollOnce(ingest).then(s => console.log('[Mail] found', s.lastFound, 'saved', s.lastSaved, 'skipped', s.lastSkipped, s.lastError?('ERROR '+s.lastError):'')).catch(e=>console.error('[Mail]',e.message));
  setTimeout(run, 20000);
  setInterval(run, 10*60*1000);
}

module.exports = { start, pollOnce, toIngestInput, state };
