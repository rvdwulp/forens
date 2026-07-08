#!/usr/bin/env node
// Verkenning (draait handmatig via workflow_dispatch): welke van de AWS-API's
// achter pr-rotterdam.zuidhollandbereikbaar.nl levert de P+R-lijst en de
// realtime bezetting, en hoe zien Slinge (boven/beneden), Noorderhelling en
// Kralingse Zoom eruit in die data?
const BASES = [
  'https://rswxenrn8a.execute-api.eu-central-1.amazonaws.com',
  'https://qvkng6ajmd.execute-api.eu-central-1.amazonaws.com',
  'https://e16bh86bl6.execute-api.eu-central-1.amazonaws.com',
];
const PADEN = ['/api/parking/facilities/pr', '/api/parking/dynamic', '/api/dynamic/', '/api/geo/'];

async function probe(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; pr-monitor-verkenning)', Origin: 'https://pr-rotterdam.zuidhollandbereikbaar.nl' },
    });
    const cors = res.headers.get('access-control-allow-origin');
    const body = await res.text();
    console.log(`\n## ${url}\n   HTTP ${res.status} | CORS: ${cors} | ${body.length} bytes`);
    return { status: res.status, body };
  } catch (e) {
    console.log(`\n## ${url}\n   ${e.message}`);
    return { status: 0, body: '' };
  }
}

(async () => {
  const werkend = [];
  for (const base of BASES) {
    for (const pad of PADEN) {
      const r = await probe(base + pad);
      if (r.status === 200 && r.body) {
        werkend.push({ url: base + pad, body: r.body });
        console.log('   eerste 600 tekens: ' + r.body.slice(0, 600).replace(/\s+/g, ' '));
      }
    }
  }

  // Zoek onze drie locaties in elk werkend antwoord en print de volledige items
  for (const { url, body } of werkend) {
    let data;
    try { data = JSON.parse(body); } catch { continue; }
    const items = Array.isArray(data) ? data
      : Array.isArray(data.features) ? data.features
      : Array.isArray(data.facilities) ? data.facilities
      : Array.isArray(data.data) ? data.data : null;
    if (!items) { console.log('\n' + url + ': geen array gevonden, sleutels: ' + Object.keys(data)); continue; }
    console.log('\n=== ' + url + ': ' + items.length + ' items');
    const relevant = items.filter(i => /slinge|kralingse|noorderhelling/i.test(JSON.stringify(i)));
    console.log('Relevante items (' + relevant.length + '):');
    relevant.forEach(i => console.log(JSON.stringify(i)));
    if (!relevant.length && items.length) console.log('voorbeeld-item: ' + JSON.stringify(items[0]).slice(0, 800));
  }
})();
