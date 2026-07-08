# P+R Rotterdam — actuele bezetting

Losstaande, zelfstandige webpagina die de actuele bezetting toont van drie
Rotterdamse P+R-terreinen:

- P+R Slinge
- P+R Noorderhelling
- P+R Kralingse Zoom

## Bron

[RDW open parkeerdata / Nationaal Parkeer Register](https://npropendata.rdw.nl/parkingdata/v2/)
— open data, geen API-key nodig.

## Hoe het werkt

Het RDW-endpoint stuurt geen CORS-headers mee en de index is megabytes groot,
dus rechtstreeks ophalen vanuit de browser is onbetrouwbaar. Daarom in twee
lagen:

1. **Snapshot (betrouwbaar).** De GitHub Actions-workflow
   (`.github/workflows/deploy.yml`) draait elke ~10 minuten
   `scripts/fetch-data.js`: die zoekt de drie locaties op in de RDW-index,
   haalt hun dynamische data op en deployt de site naar GitHub Pages met een
   verse `data.json`. De pagina laadt die snapshot altijd eerst — zelfde
   origin, dus geen CORS.
2. **Live verversen (best effort).** Daarna probeert de pagina elke minuut de
   kleine dynamische endpoints rechtstreeks bij te werken (direct, en anders
   via publieke CORS-proxies). Lukt dat, dan zie je "Live bijgewerkt"; zo
   niet, dan blijft de snapshot staan met "Snapshot van HH:MM".

## Installatie

1. Zet in de repository-instellingen *Settings → Pages → Build and deployment
   → Source* op **GitHub Actions**.
2. Push naar `main` (of start de workflow handmatig via *Actions → Deploy met
   verse parkeerdata → Run workflow*).

De workflow-logs tonen per locatie wat er in het RDW-register gevonden is —
handig om te zien of een terrein überhaupt realtime data levert.
