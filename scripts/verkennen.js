#!/usr/bin/env node
// Eenmalige verkenning (draait handmatig via workflow_dispatch): waar haalt de
// bestaande P+R-kaart van Zuid-Holland Bereikbaar zijn realtime data vandaan,
// en wat staat er in de statische RDW-registraties van Slinge/Kralingse Zoom?
const SITES = ['https://pr-rotterdam.zuidhollandbereikbaar.nl/'];

async function tekst(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(30000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; pr-monitor-verkenning)' },
    });
    console.log('\n## ' + url + ' → HTTP ' + res.status + ' (' + (res.headers.get('content-type') || '?') + ')');
    return res.ok ? await res.text() : '';
  } catch (e) {
    console.log('\n## ' + url + ' → ' + e.message);
    return '';
  }
}

function urlsUit(t, basis) {
  const abs = [...t.matchAll(/https?:\/\/[^\s"'<>\\)]+/g)].map(m => m[0]);
  const rel = [...t.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(m => m[1]);
  const relAbs = rel.map(r => { try { return new URL(r, basis).href; } catch { return null; } }).filter(Boolean);
  return [...new Set([...abs, ...relAbs])];
}

(async () => {
  for (const site of SITES) {
    const html = await tekst(site);
    const urls = urlsUit(html, site);
    console.log('URLs in pagina:');
    urls.forEach(u => console.log('  ' + u));

    for (const u of urls.filter(u => /\.m?js(\?|$)/.test(u)).slice(0, 12)) {
      const js = await tekst(u);
      if (!js) continue;
      const interessant = urlsUit(js, u).filter(x => /api|data|park|rdw|json|graphql|socket/i.test(x));
      const paden = [...js.matchAll(/["'](\/[a-zA-Z0-9_\-\/.]{3,90})["']/g)].map(m => m[1])
        .filter(p => /api|data|park|json|feed/i.test(p));
      console.log('  interessante URLs:');
      [...new Set(interessant)].slice(0, 50).forEach(x => console.log('    ' + x));
      [...new Set(paden)].slice(0, 50).forEach(p => console.log('    pad: ' + p));
    }
  }

  // Statische RDW-registraties: zit daar deel-/capaciteitsinformatie in?
  const REGISTRATIES = [
    ['P+R Slinge (Rotterdam)', '24aca731-db99-4c8b-a429-b664bc5a17bf'],
    ['PR Slinge', '902ff643-73b3-4591-a30d-2e26634dec48'],
    ['P+R Kralingse Zoom (Rotterdam) #1', 'cbf81a2f-235b-409a-8b96-eaa8c249a735'],
    ['P+R Kralingse Zoom (Rotterdam) #2', '2522ba8f-54c7-445c-bc4b-36405823376b'],
    ['PR Kralingse Zoom', '54c095f4-49fe-4d4d-91a4-0fb32a2106df'],
  ];
  for (const [naam, id] of REGISTRATIES) {
    try {
      const res = await fetch('https://npropendata.rdw.nl/parkingdata/v2/static/' + id, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) { console.log('\nstatic ' + naam + ' → HTTP ' + res.status); continue; }
      const i = (await res.json()).parkingFacilityInformation || {};
      console.log('\nstatic ' + naam + ' →',
        'specifications:', JSON.stringify(i.specifications),
        '| accessPoints:', (i.accessPoints || []).length,
        '| description:', i.description);
    } catch (e) {
      console.log('\nstatic ' + naam + ' → ' + e.message);
    }
  }
})();
