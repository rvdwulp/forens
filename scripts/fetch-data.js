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

async function haalJson(url, timeoutMs = 60000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' voor ' + url);
  return res.json();
}

// Meerdere registraties van één terrein (bijv. bovendek/benedendek) tellen we
// op tot één totaalstatus; de delen blijven apart beschikbaar in data.json.
function aggregeer(statussen) {
  const met = statussen.filter(Boolean);
  if (!met.length) return null;
  const som = veld => met.some(s => typeof s[veld] === 'number')
    ? met.reduce((t, s) => t + (typeof s[veld] === 'number' ? s[veld] : 0), 0)
    : undefined;
  const vrij = som('vacantSpaces');
  return {
    vacantSpaces: vrij,
    parkingCapacity: som('parkingCapacity'),
    open: met.some(s => s.open !== false),
    full: met.every(s => s.full === true) || vrij === 0,
    lastUpdated: Math.max(...met.map(s => s.lastUpdated || 0)) || undefined,
  };
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
      parts: [],
      status: null,
      note: null,
    };

    if (indexFout) entry.note = 'RDW-index onbereikbaar: ' + indexFout;
    else if (!kandidaten.length) entry.note = 'Niet gevonden in RDW-index';
    else {
      // Probeer élke kandidaat: ook registraties zonder dynamicDataUrl in de
      // index blijken soms wel een werkend dynamisch endpoint te hebben. Alle
      // werkende registraties (bijv. losse parkeerdekken) worden delen.
      entry.parts = [];
      for (const fac of kandidaten) {
        const dynUrl = fac.dynamicDataUrl || dynamicBase + fac.identifier;
        let status = null, fout = null;
        for (let poging = 0; poging < 2 && !status; poging++) {
          try {
            const d = await haalJson(dynUrl, 20000);
            status = d?.parkingFacilityDynamicInformation?.facilityActualStatus ?? null;
            if (!status) fout = 'antwoord zonder facilityActualStatus';
          } catch (e) {
            fout = e.message;
            if (!/timeout|abort/i.test(e.message)) break; // alleen bij timeout nog eens
          }
        }
        console.log(`  probe "${fac.name}" (${fac.identifier}): ` +
          (status ? `OK, ${status.vacantSpaces} vrij van ${status.parkingCapacity}` : fout));
        if (status) {
          entry.parts.push({ name: fac.name, identifier: fac.identifier, dynamicDataUrl: dynUrl, status });
        }
      }
      entry.status = aggregeer(entry.parts.map(p => p.status));
      if (entry.parts.length) {
        entry.name = entry.parts[0].name;
        entry.identifier = entry.parts[0].identifier;
        entry.dynamicDataUrl = entry.parts[0].dynamicDataUrl;
      } else {
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
