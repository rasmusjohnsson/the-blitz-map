# Gråstensväktarna – v2.0.0 förbättringar

## Vad är nytt

### Arkitektur
- **Filuppdelning**: `index.html` (4KB) + `style.css` (27KB) + `app.js` (42KB) istället för en 100KB+ monolit
- **JSON-data**: All data ligger nu i `data/`-mappen:
  - `data/characters.json`
  - `data/locations.json`
  - `data/sessions.json`
  - `data/npcs.json`
  - `data/factions.json`
- **Async loading**: Appen laddar data via `fetch()` vid start
- **Validering**: Alla referenser (NPC-namn, plats-IDs, session-IDs, organisationer) valideras vid laddning. Varningar visas i konsolen.

### UX/UI
- **LocalStorage**: Zoom, pan, aktiv flik och session-filter sparas mellan besök
- **Loading-skärm**: Spinner med "LADDAR ASKHÅLAN..." när Askhålan-bilden laddas
- **Smooth transitions**: Modaler fade:ar in/ut med scale-animation, overlay fade:ar
- **Bottom-sheet på mobil**: Modaler slidar upp från botten istället för att visas som centrerade popups på små skärmar (med drag-handle)
- **Version i UI**: `v2.0.0 · data v1.0` visas diskret i sidopanelens botten

### PWA + Offline
- **Installerbar**: Lägg till på hemskärmen som riktig app (Chrome, Safari, Edge)
- **Offline-stöd**: Service worker cachar alla filer + data → fungerar utan internet
- **Stale-while-revalidate**: Visar cachad version direkt, uppdaterar i bakgrunden

## Preview-deploys (Netlify)

Netlify har redan preview-deploys aktiverat på branches. För att använda:

1. Skapa en ny branch och pusha:
   ```bash
   git checkout -b min-feature
   # gör ändringar
   git push -u origin min-feature
   ```
2. Netlify ger automatiskt en URL typ `https://min-feature--the-blitz-map.netlify.app`
3. Öppna PR mot `master` → Netlify länkar preview-URL:n i PR:en
4. När PR mergas, deployas till produktion

**Om du vill säkerställa att det är på:**
- Gå till [app.netlify.com/projects/the-blitz-map/configuration/deploys](https://app.netlify.com/projects/the-blitz-map/configuration/deploys)
- Scrolla till "Branches and deploy contexts"
- Bock i "Deploy Previews" och "Branch deploys" om de inte redan är på

## Lägga till en ny session

1. Klistra in transkription i Claude-chatten
2. Claude genererar diff:ar mot:
   - `data/sessions.json` – ny session-post
   - `data/locations.json` – nya event på platser
   - `data/npcs.json` – nya NPCs
   - `data/characters.json` – nya personalEvents
3. Validera lokalt: `node` validering kör automatiskt vid load
4. Pusha till GitHub → Netlify deployar automatiskt

## Filstruktur

```
the-blitz-map/
├── index.html          # HTML-struktur (4KB)
├── style.css           # All styling (27KB)
├── app.js              # All logik (42KB)
├── manifest.json       # PWA manifest
├── sw.js               # Service worker
├── icon-192.png        # PWA icon
├── icon-512.png        # PWA icon
├── data/
│   ├── characters.json
│   ├── locations.json
│   ├── sessions.json
│   ├── npcs.json
│   └── factions.json
├── map.jpg             # Sword Coast karta
├── askhalan.jpg        # Askhålan interiör
└── CHANGELOG.md        # Detta dokument
```
