const axios = require('axios');

async function scrapeCivCast() {
  const bids = [];
  const searches = ['electrical water texas', 'instrumentation wastewater texas', 'scada water texas'];
  
  for (const term of searches) {
    try {
      // Use CivCast search API
      const res = await axios.get('https://www.civcastusa.com/api/bids/search', {
        params: { q: term, state: 'TX', category: 'engineering' },
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
        timeout: 10000
      });
      const items = res.data?.bids || res.data?.results || res.data || [];
      if (Array.isArray(items)) {
        items.forEach((b, i) => {
          bids.push({
            id: 'civcast-' + (b.id || Date.now() + i),
            source: 'CivCast',
            name: b.title || b.name || b.projectName || '',
            agency: b.agency || b.owner || b.organization || '',
            city: b.city || b.location || 'Texas',
            region: 'statewide',
            scope: b.description || b.scope || 'E&I Engineering — See RFQ link',
            due: b.dueDate || b.closingDate || b.due || 'See link',
            value: b.value || b.estimatedValue || 'TBD',
            status: 'active',
            url: b.url || b.link || `https://www.civcastusa.com/bids/${b.id}`,
            scrapedAt: new Date().toISOString()
          });
        });
      }
      await new Promise(r => setTimeout(r, 1500));
    } catch(e) {
      console.warn('[CivCast]', term, ':', e.message);
    }
  }
  console.log('[CivCast]', bids.length, 'bids');
  return bids;
}

module.exports = { scrapeCivCast };
