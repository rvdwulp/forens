#!/usr/bin/env node
// Draait in de GitHub Actions-workflow: haalt de RDW-parkeerdata op en bouwt
// de site in _site/ met een verse data.json-snapshot. Geen dependencies.
const fs = require('fs');
const path = require('path');

const INDEX_URL = process.env.NPR_INDEX_URL || 'https://npropendata.rdw.nl/parkingdata/v2/';

const LOCATIES = [
  { key: 'slinge',         label: 'P+R Slinge',         patroon: /slinge/i },
  { key: 'noorderhelling', label: 'P+R Noorderhelling', patroon: /noorderhelling/i },
  { key: 'kralingsezoom',  label: 'P+R Kralingse Zoom', patroon: /kralingse\s*zoom/i },
];

async function haalJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' voor ' + url);
  return res.json();
}

async function main() {
  const locations = [];
  let facilities = [];
  let indexFout = null;
  try {
    const index = await haalJson(INDEX_URL);
    facilities = index.ParkingFacilities || [];
    console.log('Index opgehaald:', facilities.length, 'parkeerlocaties');
  } catch (e) {
    indexFout = e.message;
    console.error('Index ophalen mislukt:', e.message);
  }

  const dynamicBase = INDEX_URL.replace(/\/+$/, '') + '/dynamic/';

  for (const loc of LOCATIES) {
    const kandidaten = facilities.filter(f => loc.patroon.test(f.name || ''));
    const entry = {
      key: loc.key,
      label: loc.label,
      name: kandidaten[0]?.name ?? null,
      identifier: kandidaten[0]?.identifier ?? null,
      dynamicDataUrl: null,
      status: null,
      note: null,
    };

    if (indexFout) entry.note = 'RDW-index onbereikbaar: ' + indexFout;
    else if (!kandidaten.length) entry.note = 'Niet gevonden in RDW-index';
    else {
      // Probeer élke kandidaat: ook registraties zonder dynamicDataUrl in de
      // index blijken soms wel een werkend dynamisch endpoint te hebben.
      const volgorde = [...kandidaten].sort((a, b) => (b.dynamicDataUrl ? 1 : 0) - (a.dynamicDataUrl ? 1 : 0));
      for (const fac of volgorde) {
        const dynUrl = fac.dynamicDataUrl || dynamicBase + fac.identifier;
        try {
          const d = await haalJson(dynUrl);
          const status = d?.parkingFacilityDynamicInformation?.facilityActualStatus;
          console.log(`  probe "${fac.name}" (${fac.identifier}): ` +
            (status ? `OK, ${status.vacantSpaces} vrij van ${status.parkingCapacity}` : 'antwoord zonder facilityActualStatus'));
          if (status) {
            Object.assign(entry, { name: fac.name, identifier: fac.identifier, dynamicDataUrl: dynUrl, status });
            break;
          }
        } catch (e) {
          console.log(`  probe "${fac.name}" (${fac.identifier}): ${e.message}`);
        }
      }
      if (!entry.status) {
        entry.note = `Geen van de ${kandidaten.length} registraties (${kandidaten.map(f => f.name).join(' | ')}) levert realtime data`;
      }
    }

    console.log(loc.label, '→', entry.status
      ? `${entry.status.vacantSpaces} vrij van ${entry.status.parkingCapacity} (${entry.name})`
      : entry.note);
    locations.push(entry);
  }

  const uit = { generatedAt: Math.floor(Date.now() / 1000), locations };
  fs.mkdirSync('_site', { recursive: true });
  fs.copyFileSync('index.html', path.join('_site', 'index.html'));
  fs.writeFileSync(path.join('_site', 'data.json'), JSON.stringify(uit, null, 2));
  console.log('_site/ gebouwd, snapshot geschreven');
}

main().catch(e => { console.error(e); process.exit(1); });
