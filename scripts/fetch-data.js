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

  for (const loc of LOCATIES) {
    const kandidaten = facilities.filter(f => loc.patroon.test(f.name || ''));
    const fac = kandidaten.find(f => f.dynamicDataUrl) || kandidaten[0] || null;
    const entry = {
      key: loc.key,
      label: loc.label,
      name: fac?.name ?? null,
      identifier: fac?.identifier ?? null,
      dynamicDataUrl: fac?.dynamicDataUrl ?? null,
      status: null,
      note: null,
    };

    if (indexFout) entry.note = 'RDW-index onbereikbaar: ' + indexFout;
    else if (!fac) entry.note = 'Niet gevonden in RDW-index';
    else if (!fac.dynamicDataUrl) entry.note = `"${fac.name}" levert geen realtime data aan het NPR`;
    else {
      try {
        const d = await haalJson(fac.dynamicDataUrl);
        entry.status = d?.parkingFacilityDynamicInformation?.facilityActualStatus ?? null;
        if (!entry.status) entry.note = 'Onverwacht antwoord van dynamisch endpoint';
      } catch (e) {
        entry.note = 'Dynamische data ophalen mislukt: ' + e.message;
      }
    }

    console.log(loc.label, '→', entry.status
      ? `${entry.status.vacantSpaces} vrij van ${entry.status.parkingCapacity} (${entry.name})`
      : entry.note);
    if (kandidaten.length > 1) {
      console.log('  (meerdere matches in index:', kandidaten.map(f => f.name).join(' | ') + ')');
    }
    locations.push(entry);
  }

  const uit = { generatedAt: Math.floor(Date.now() / 1000), locations };
  fs.mkdirSync('_site', { recursive: true });
  fs.copyFileSync('index.html', path.join('_site', 'index.html'));
  fs.writeFileSync(path.join('_site', 'data.json'), JSON.stringify(uit, null, 2));
  console.log('_site/ gebouwd, snapshot geschreven');
}

main().catch(e => { console.error(e); process.exit(1); });
