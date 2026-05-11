/*
===================================================================
  GRÅSTENSVÄKTARNA – DATA SCHEMA & SESSION WORKFLOW
===================================================================

WORKFLOW FÖR ATT LÄGGA TILL EN NY SESSION:
1. Klistra in session-transkribering till Claude
2. Claude genererar: session-objekt, nya platser, nya NPCs, uppdateringar till befintliga platser
3. För nya platser: använd kalibreringsverktyget (klicka på tom yta på kartan → koordinater)
4. Skicka koordinaterna till Claude
5. Claude producerar färdig kod att klistra in

SESSION SCHEMA:
{
  id: number,               // Sekventiellt: 0, 1, 2...
  label: 'SESSION N',       // T.ex. 'SESSION 1'
  title: 'Kort titel',      // Svenska, beskrivande
  events: [{
    title: string,           // Händelsens namn
    recap: string,           // Sammanfattning av vad som hände
    places: ['locationId'],  // Array av location.id-strängar
    npcs: ['NPC Namn']       // Array av NPC-namn (måste matcha npcsData[].name exakt)
  }]
}

LOCATION SCHEMA (ny plats):
{
  id: 'kebab-case',          // Unikt ID, t.ex. 'castle-naerytar'
  name: 'Visningsnamn',
  x: number,                 // Pixelkoordinat på map.jpg (2576x1664) – använd kalibreringsverktyget!
  y: number,
  visited: true/false,
  summary: 'Kort beskrivning av platsen.',
  descriptions: [{           // VALFRITT: Platsbeskrivning (baser, dungeons, fort etc)
    title: 'RUBRIK I VERSALER',
    items: [                 // Korta snabblästa rader, stöder <strong>
      '<strong>Etikett:</strong> Beskrivning',
      'Enkel rad utan etikett'
    ]
  }],
  events: [{                 // Specifika händelser som skett på platsen
    title: string,
    preview: 'Kort förhandsgranskning...',
    detail: 'Fullständig beskrivning av händelsen.',
    session: number           // Matchar sessions[].id
  }]
}

NPC SCHEMA:
{
  name: string,              // Måste matcha sessions[].events[].npcs exakt
  status: 'friendly'|'hostile'|'neutral'|'unknown',
  role: 'Kort rollbeskrivning',
  desc: 'Längre beskrivning av NPCn.',
  events: [{                 // Interaktioner med Gråstensväktarna
    label: 'Kort rubrik',
    text: 'Beskrivning av interaktionen.'
  }]
}

BEFINTLIG PLATS – UPPDATERING:
- Pusha ny event till locations[].events med session: N
- Sätt visited: true om gruppen besökt platsen

KORSREFERENSER:
- session.events[].places måste använda location.id-värden
- session.events[].npcs måste matcha npcsData[].name exakt
- Varje refererad NPC/plats måste finnas i respektive array
===================================================================
*/
const DATA_VERSION='1.0';
const APP_VERSION='2.0.0';
// Data is loaded async from JSON files. These start empty and get populated on load.
let characters=[], locations=[], npcsData=[], sessions=[], factions=[];
async function loadData(){
  const files=['characters','locations','npcs','sessions','factions'];
  const [c,l,n,s,f]=await Promise.all(files.map(name=>fetch('data/'+name+'.json').then(r=>{if(!r.ok)throw new Error('Failed to load '+name);return r.json()})));
  characters=c;locations=l;npcsData=n;sessions=s;factions=f;
}
// Geography based on official map. Coast runs N-S. Luskan top-left, Greenest far SE.
// Using 2000x1600 canvas. Coast at ~x400. Inland stretches to x1600+.
// Coordinates calibrated to map.jpg (2576x1664).
// Greenest confirmed at ~x:1620 y:1300 (the red dot from reference).
// All other cities placed relative to Greenest using official WotC map proportions.
function drawPortrait(cv,id){const c=cv.getContext('2d');cv.width=16;cv.height=16;c.imageSmoothingEnabled=false;const P={
haldan:()=>{c.fillStyle='#dbb89a';c.fillRect(5,3,6,7);c.fillRect(4,5,8,4);c.fillStyle='#5c3a1e';c.fillRect(6,5,2,2);c.fillRect(9,5,2,2);c.fillStyle='#fff';c.fillRect(6,5,1,1);c.fillRect(9,5,1,1);c.fillStyle='#c4766e';c.fillRect(5,2,1,2);c.fillRect(7,1,2,1);c.fillStyle='#c9a882';c.fillRect(5,2,6,1);c.fillStyle='#8a8a8a';c.fillRect(12,11,2,2);c.fillStyle='#5a3a1a';c.fillRect(4,10,8,5);c.fillStyle='#2a5a2a';c.fillRect(3,10,1,5);c.fillRect(12,10,1,5);c.fillStyle='#6b4a2a';c.fillRect(13,4,1,8);c.fillStyle='#aaa';c.fillRect(14,5,1,6);c.fillStyle='#a0756a';c.fillRect(7,8,2,1)},
theron:()=>{c.fillStyle='#d4a830';c.fillRect(4,2,8,8);c.fillRect(5,1,6,1);c.fillStyle='#c89a20';c.fillRect(6,7,4,2);c.fillStyle='#ff2020';c.fillRect(5,4,2,2);c.fillRect(9,4,2,2);c.fillStyle='#cc0000';c.fillRect(6,4,1,1);c.fillRect(10,4,1,1);c.fillStyle='#b82020';c.fillRect(4,0,2,2);c.fillRect(10,0,2,2);c.fillStyle='#7a7a8a';c.fillRect(3,10,10,5);c.fillStyle='#ffd700';c.fillRect(7,10,2,1);c.fillStyle='#a07818';c.fillRect(7,8,1,1);c.fillRect(8,8,1,1)},
oweyn:()=>{c.fillStyle='#dbb89a';c.fillRect(5,3,6,7);c.fillRect(4,5,8,4);c.fillStyle='#4a2a0a';c.fillRect(4,1,8,3);c.fillRect(3,2,1,3);c.fillRect(12,2,1,3);c.fillStyle='#3a5a3a';c.fillRect(6,5,2,2);c.fillRect(9,5,2,2);c.fillStyle='#fff';c.fillRect(6,5,1,1);c.fillRect(9,5,1,1);c.fillStyle='#a0756a';c.fillRect(7,8,2,1);c.fillStyle='#7a7a8a';c.fillRect(4,10,8,5);c.fillStyle='#dbb89a';c.fillRect(3,12,1,2);c.fillRect(12,12,1,2);c.fillStyle='#5a5a6a';c.fillRect(13,6,2,7);c.fillStyle='#8a8a9a';c.fillRect(13,5,3,2)},
gothmog:()=>{c.fillStyle='#7a8a7a';c.fillRect(4,2,8,8);c.fillRect(3,4,10,5);c.fillStyle='#6a7a6a';c.fillRect(5,1,6,2);c.fillStyle='#ff8a00';c.fillRect(5,4,2,2);c.fillRect(9,4,2,2);c.fillStyle='#e0d8c0';c.fillRect(5,8,1,2);c.fillRect(10,8,1,2);c.fillStyle='#5a9aba';c.fillRect(5,2,1,1);c.fillRect(8,1,1,1);c.fillRect(10,2,1,1);c.fillStyle='#5a5a6a';c.fillRect(3,10,10,5);c.fillStyle='#ff6a30';c.fillRect(6,12,1,1);c.fillRect(9,12,1,1);c.fillStyle='#5a4a3a';c.fillRect(14,2,1,12);c.fillStyle='#8a8a9a';c.fillRect(13,2,3,3)},
cedric:()=>{c.fillStyle='#e8ceb0';c.fillRect(5,3,6,7);c.fillRect(4,5,8,4);c.fillStyle='#9a9a9a';c.fillRect(4,1,8,3);c.fillRect(3,2,1,4);c.fillRect(12,2,1,4);c.fillStyle='#4488cc';c.fillRect(6,5,2,2);c.fillRect(9,5,2,2);c.fillStyle='#fff';c.fillRect(6,5,1,1);c.fillRect(9,5,1,1);c.fillStyle='#a0756a';c.fillRect(7,8,2,1);c.fillStyle='#2a3a6a';c.fillRect(3,10,10,5);c.fillStyle='#6b4a2a';c.fillRect(1,4,1,11);c.fillStyle='#8ab8ff';c.fillRect(0,3,3,2);c.fillStyle='#6a2a1a';c.fillRect(12,11,2,3);c.fillStyle='#e0d8c0';c.fillRect(12,12,2,1)}
};if(P[id])P[id]()}

function drawNpcPortrait(cv,id){const c=cv.getContext('2d');cv.width=16;cv.height=16;c.imageSmoothingEnabled=false;const P={
nighthill:()=>{c.fillStyle='#5a4030';c.fillRect(3,1,10,3);c.fillRect(2,3,1,7);c.fillRect(13,3,1,7);c.fillStyle='#9a8a7a';c.fillRect(4,2,1,2);c.fillRect(11,2,1,2);c.fillRect(2,5,1,3);c.fillRect(13,5,1,3);c.fillStyle='#c89068';c.fillRect(4,4,8,5);c.fillRect(5,3,6,1);c.fillStyle='#5a4030';c.fillRect(5,4,2,1);c.fillRect(9,4,2,1);c.fillStyle='#2a1a0a';c.fillRect(5,5,2,2);c.fillRect(9,5,2,2);c.fillStyle='#fff';c.fillRect(5,5,1,1);c.fillRect(9,5,1,1);c.fillStyle='#a87858';c.fillRect(4,7,1,1);c.fillRect(11,7,1,1);c.fillStyle='#b08060';c.fillRect(7,7,2,1);c.fillStyle='#5a4a3a';c.fillRect(4,9,8,3);c.fillRect(3,10,10,2);c.fillStyle='#7a6a4a';c.fillRect(5,9,6,1);c.fillStyle='#9a9a8a';c.fillRect(4,11,8,1);c.fillStyle='#c89068';c.fillRect(7,12,2,1);c.fillStyle='#182a5a';c.fillRect(2,13,12,3);c.fillStyle='#284068';c.fillRect(3,14,10,1);c.fillStyle='#ffd700';c.fillRect(4,13,8,1);c.fillStyle='#d02020';c.fillRect(6,13,1,1);c.fillRect(9,13,1,1);c.fillStyle='#6a6a7a';c.fillRect(1,12,1,2);c.fillRect(14,12,1,2)},
escobert:()=>{c.fillStyle='#c84020';c.fillRect(3,0,10,4);c.fillRect(2,1,1,8);c.fillRect(13,1,1,8);c.fillStyle='#e85020';c.fillRect(4,1,1,3);c.fillRect(11,1,1,3);c.fillRect(2,5,1,3);c.fillRect(13,5,1,3);c.fillStyle='#a03010';c.fillRect(3,3,1,1);c.fillRect(12,3,1,1);c.fillStyle='#d08870';c.fillRect(4,4,8,4);c.fillRect(5,3,6,1);c.fillStyle='#2a1a0a';c.fillRect(5,5,2,2);c.fillRect(9,5,2,2);c.fillStyle='#fff';c.fillRect(5,5,1,1);c.fillRect(9,5,1,1);c.fillStyle='#a86048';c.fillRect(7,7,2,1);c.fillStyle='#c84020';c.fillRect(3,8,10,4);c.fillRect(4,12,8,1);c.fillStyle='#e85020';c.fillRect(4,8,8,1);c.fillStyle='#a03010';c.fillRect(5,11,6,1);c.fillStyle='#6a4020';c.fillRect(2,13,12,3);c.fillStyle='#8a5030';c.fillRect(3,14,10,1);c.fillStyle='#5a3010';c.fillRect(2,15,12,1);c.fillStyle='#ffd700';c.fillRect(7,15,2,1);c.fillStyle='#c0a030';c.fillRect(11,14,1,2);c.fillStyle='#a08020';c.fillRect(12,15,1,1);c.fillStyle='#5a3a1a';c.fillRect(14,1,1,7);c.fillStyle='#8a6a3a';c.fillRect(13,3,3,1);c.fillStyle='#3a2a1a';c.fillRect(15,2,1,1);c.fillRect(15,4,1,1)},
swift:()=>{c.fillStyle='#dbb89a';c.fillRect(2,4,5,4);c.fillStyle='#6a4020';c.fillRect(2,2,5,3);c.fillStyle='#3a2a1a';c.fillRect(3,6,1,1);c.fillRect(5,6,1,1);c.fillStyle='#6a4a2a';c.fillRect(1,9,7,7);c.fillStyle='#8a6a3a';c.fillRect(2,10,5,1);c.fillStyle='#e8ceb0';c.fillRect(9,4,5,4);c.fillStyle='#9a6a2a';c.fillRect(9,2,5,3);c.fillRect(8,4,1,4);c.fillRect(14,4,1,4);c.fillStyle='#3a2a1a';c.fillRect(10,6,1,1);c.fillRect(12,6,1,1);c.fillStyle='#8a5a4a';c.fillRect(8,9,7,7);c.fillStyle='#aa7a5a';c.fillRect(9,10,5,1);c.fillStyle='#a0756a';c.fillRect(3,7,2,1);c.fillRect(10,7,2,1)},
bluedragon:()=>{c.fillStyle='#d0d0d0';c.fillRect(3,0,1,2);c.fillRect(12,0,1,2);c.fillStyle='#b0b0b0';c.fillRect(4,1,1,1);c.fillRect(11,1,1,1);c.fillStyle='#3060b0';c.fillRect(3,2,10,8);c.fillStyle='#4080d0';c.fillRect(4,3,8,2);c.fillStyle='#1a3a7a';c.fillRect(3,8,10,2);c.fillStyle='#ffcc00';c.fillRect(5,5,2,2);c.fillRect(9,5,2,2);c.fillStyle='#ff6600';c.fillRect(5,5,1,1);c.fillRect(9,5,1,1);c.fillStyle='#000';c.fillRect(6,6,1,1);c.fillRect(10,6,1,1);c.fillStyle='#2050a0';c.fillRect(5,10,6,3);c.fillStyle='#1a3a7a';c.fillRect(6,11,4,1);c.fillStyle='#e0e0c0';c.fillRect(6,13,1,2);c.fillRect(8,13,1,2);c.fillRect(10,13,1,2);c.fillStyle='#2050a0';c.fillRect(4,14,8,2);c.fillStyle='#1a3a7a';c.fillRect(5,15,6,1);c.fillStyle='#ffff00';c.fillRect(0,3,1,1);c.fillRect(1,5,1,1);c.fillRect(15,3,1,1);c.fillRect(14,5,1,1)},
raiders:()=>{c.fillStyle='#2a2a3a';c.fillRect(3,1,10,6);c.fillRect(4,7,8,2);c.fillStyle='#1a1a2a';c.fillRect(5,4,6,4);c.fillStyle='#ff4a4a';c.fillRect(6,5,2,1);c.fillRect(9,5,2,1);c.fillStyle='#a0302a';c.fillRect(7,7,2,1);c.fillStyle='#3a2a1a';c.fillRect(3,10,10,6);c.fillStyle='#2a1a0a';c.fillRect(4,11,8,1);c.fillRect(4,14,8,1);c.fillStyle='#8a8a9a';c.fillRect(13,5,2,4);c.fillStyle='#4a3a2a';c.fillRect(12,9,3,1);c.fillStyle='#c0c0c0';c.fillRect(7,12,2,2)},
kobolder:()=>{c.fillStyle='#6a4030';c.fillRect(4,3,8,5);c.fillRect(3,5,10,2);c.fillStyle='#8a5040';c.fillRect(5,4,6,1);c.fillStyle='#3a2010';c.fillRect(3,7,1,1);c.fillRect(12,7,1,1);c.fillStyle='#3a1808';c.fillRect(4,2,1,2);c.fillRect(11,2,1,2);c.fillRect(5,1,1,2);c.fillRect(10,1,1,2);c.fillStyle='#ffaa00';c.fillRect(5,5,2,2);c.fillRect(9,5,2,2);c.fillStyle='#000';c.fillRect(6,5,1,2);c.fillRect(10,5,1,2);c.fillStyle='#5a3020';c.fillRect(6,8,4,2);c.fillStyle='#fff';c.fillRect(6,9,1,1);c.fillRect(8,9,1,1);c.fillRect(9,9,1,1);c.fillStyle='#5a4a3a';c.fillRect(3,10,10,6);c.fillStyle='#3a2a1a';c.fillRect(4,11,8,1);c.fillRect(4,14,8,1);c.fillStyle='#a02020';c.fillRect(7,12,2,2);c.fillStyle='#ffd700';c.fillRect(7,12,2,1);c.fillStyle='#8a6a3a';c.fillRect(14,3,1,11);c.fillStyle='#9a9aaa';c.fillRect(13,2,3,2)},
dragonclaw:()=>{c.fillStyle='#8a1010';c.fillRect(3,0,1,3);c.fillRect(12,0,1,3);c.fillRect(4,1,1,2);c.fillRect(11,1,1,2);c.fillStyle='#5a0808';c.fillRect(3,3,10,7);c.fillStyle='#7a1010';c.fillRect(4,4,8,2);c.fillStyle='#2a0404';c.fillRect(3,9,10,1);c.fillStyle='#ff6020';c.fillRect(5,5,2,2);c.fillRect(9,5,2,2);c.fillStyle='#ffff00';c.fillRect(5,5,1,1);c.fillRect(9,5,1,1);c.fillStyle='#000';c.fillRect(6,6,1,1);c.fillRect(10,6,1,1);c.fillStyle='#fff';c.fillRect(5,8,1,2);c.fillRect(7,8,1,2);c.fillRect(9,8,1,2);c.fillRect(11,8,1,2);c.fillStyle='#3a1010';c.fillRect(6,8,1,1);c.fillRect(8,8,1,1);c.fillRect(10,8,1,1);c.fillStyle='#3a3a4a';c.fillRect(2,10,12,6);c.fillStyle='#2a2a3a';c.fillRect(3,11,10,1);c.fillRect(3,13,10,1);c.fillStyle='#ff6020';c.fillRect(7,12,2,2);c.fillStyle='#ffd700';c.fillRect(7,12,2,1);c.fillStyle='#5a0808';c.fillRect(1,11,2,3);c.fillRect(13,11,2,3);c.fillStyle='#3a0404';c.fillRect(0,12,1,2);c.fillRect(15,12,1,2)}
};if(P[id])P[id]();else{c.fillStyle='#3a3a5a';c.fillRect(4,3,8,8);c.fillStyle='#6a6a8a';c.fillRect(5,4,6,4);c.fillStyle='#8080a0';c.fillRect(6,6,1,1);c.fillRect(9,6,1,1);c.fillStyle='#2a2a4a';c.fillRect(3,11,10,5);c.fillStyle='#8080a0';c.fillRect(7,5,2,1)}}

// Map is now a background image (map.jpg) on .map-canvas via CSS

// ===== RENDER =====
function renderCharacters(){const l=document.getElementById('tab-adventurers');l.innerHTML='';characters.forEach(c=>{const d=document.createElement('div');d.className='character-card';d.onclick=()=>showCharacterDetail(c);const p=document.createElement('div');p.className='portrait';const cv=document.createElement('canvas');p.appendChild(cv);drawPortrait(cv,c.id);d.appendChild(p);const i=document.createElement('div');i.className='char-info';i.innerHTML=`<div class="char-name">${c.name}</div><div class="char-class">${c.subclass}</div><div class="char-species">${c.species}</div>`;d.appendChild(i);l.appendChild(d)})}
function renderNPCs(){const p=document.getElementById('tab-npcs');p.innerHTML='';if(!npcsData.length){p.innerHTML='<div class="empty-state">Inga NPC:er påträffade ännu.<br><br>NPC:er dyker upp här efter varje session.</div>';return}
// Filter NPCs by current session filter
let displayNpcs=npcsData;
if(currentSessionFilter!=='all'){
  const s=sessions.find(x=>x.id===parseInt(currentSessionFilter));
  if(s){
    const npcNames=new Set();
    s.events.forEach(ev=>{if(ev.npcs)ev.npcs.forEach(n=>npcNames.add(n))});
    displayNpcs=npcsData.filter(n=>npcNames.has(n.name));
    const banner=document.createElement('div');banner.className='filter-banner';
    banner.innerHTML=`<span class="fb-label">📜 Filtrerar: ${s.label}</span><button class="filter-banner-clear" onclick="clearSessionFilter()">Rensa</button>`;
    p.appendChild(banner);
  }
}
if(!displayNpcs.length){const empty=document.createElement('div');empty.className='empty-state';empty.textContent='Inga NPC:er påträffade i denna session.';p.appendChild(empty);return}
displayNpcs.forEach(n=>{const c=document.createElement('div');c.className='npc-card';c.onclick=()=>showNPCDetail(n);const ic=document.createElement('div');ic.className='npc-icon';const cv=document.createElement('canvas');ic.appendChild(cv);drawNpcPortrait(cv,n.id);const badge=document.createElement('div');badge.className='npc-status-badge';badge.textContent=n.status==='friendly'?'😊':n.status==='hostile'?'💀':'😐';ic.appendChild(badge);c.appendChild(ic);const i=document.createElement('div');i.className='npc-info';const sl={friendly:'Vänlig',hostile:'Fiende',neutral:'Neutral',unknown:'Okänd'};i.innerHTML=`<div class="npc-name">${n.name}</div><div class="npc-role">${n.role||''}</div><span class="npc-status ${n.status}">${sl[n.status]||'Okänd'}</span>`;c.appendChild(i);p.appendChild(c)})}
function renderTimeline(){const p=document.getElementById('tab-history');p.innerHTML='';const tl=document.createElement('div');tl.className='timeline';sessions.forEach(s=>{const b=document.createElement('div');b.className='session-block';const h=document.createElement('div');h.className='session-header';h.innerHTML=`<div><span class="session-label">${s.label}</span>${s.title}</div><span class="toggle-icon">▼</span>`;h.onclick=()=>b.classList.toggle('collapsed');b.appendChild(h);const w=document.createElement('div');w.className='session-events';s.events.forEach(ev=>{const it=document.createElement('div');it.className='timeline-event';it.innerHTML=`<div class="te-title">${ev.title}</div>`;it.onclick=e=>{e.stopPropagation();showTimelineDetail(ev)};w.appendChild(it)});b.appendChild(w);tl.appendChild(b)});p.appendChild(tl)}
function renderMarkers(){const c=document.getElementById('mapCanvas');c.querySelectorAll('.location-marker').forEach(m=>m.remove());locations.forEach(l=>{const m=document.createElement('div');m.className=`location-marker ${l.visited?'marker-visited':''}`;m.id='marker-'+l.id;m.style.left=l.x+'px';m.style.top=l.y+'px';m.onclick=e=>{e.stopPropagation();showLocation(l)};m.innerHTML=`<div class="marker-label">${l.name}</div><div class="marker-dot"></div>`;c.appendChild(m)})}

// ===== TABS =====
document.querySelectorAll('.tab-btn').forEach(b=>{b.addEventListener('click',()=>{if(recapActive)exitRecapMode();document.querySelectorAll('.tab-btn').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.tab-panel').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.getElementById('tab-'+b.dataset.tab).classList.add('active');document.getElementById('tab-search').classList.remove('active');scheduleSave()})});

// ===== SEARCH =====
function buildSearchIndex(){const idx=[];locations.forEach(l=>idx.push({type:'Plats',name:l.name,action:()=>showLocation(l),locId:l.id}));characters.forEach(c=>idx.push({type:'Karaktär',name:c.name,action:()=>showCharacterDetail(c)}));npcsData.forEach(n=>idx.push({type:'NPC',name:n.name,desc:n.desc,action:()=>showNPCDetail(n)}));sessions.forEach(s=>s.events.forEach(ev=>idx.push({type:'Händelse',name:ev.title,action:()=>showTimelineDetail(ev),places:ev.places})));return idx}
let searchIndex=[];
function normalize(s){return s.toLowerCase().replace(/[åä]/g,'a').replace(/[ö]/g,'o')}
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
function doSearch(q){if(!q.trim())return[];const n=normalize(q);return searchIndex.filter(i=>normalize(i.name).includes(n)||(i.desc&&normalize(i.desc).includes(n)))}
const sI=document.getElementById('searchInput'),sE=document.getElementById('suggestions');
sI.addEventListener('input',()=>{const q=sI.value;if(q.length<2){sE.classList.remove('active');return}const r=doSearch(q).slice(0,8);if(!r.length){sE.classList.remove('active');return}sE.innerHTML='';r.forEach(i=>{const d=document.createElement('div');d.className='suggestion-item';d.innerHTML=`<span class="s-type">${i.type}</span>${i.name}`;d.onclick=()=>{sE.classList.remove('active');sI.value=i.name;if(i.action)i.action()};sE.appendChild(d)});sE.classList.add('active')});
sI.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();executeSearch()}});
document.getElementById('searchBtn').addEventListener('click',executeSearch);
document.addEventListener('click',e=>{if(!e.target.closest('.search-bar'))sE.classList.remove('active')});
function executeSearch(){sE.classList.remove('active');const q=sI.value;if(!q.trim())return;const r=doSearch(q);const p=document.getElementById('tab-search');p.innerHTML='';const s=document.createElement('div');s.className='search-results active';s.innerHTML=`<div class="search-results-header"><h3>"${esc(q)}" (${r.length})</h3><button class="sr-close" onclick="closeSearchResults()">X</button></div>`;if(!r.length)s.innerHTML+='<div class="empty-state">Inga resultat.</div>';else r.forEach(i=>{const d=document.createElement('div');d.className='sr-item';d.innerHTML=`<span class="sr-type">${i.type}</span>${i.name}`;d.onclick=()=>{if(i.action)i.action();if(i.locId){highlightMarker(i.locId);setTimeout(()=>unhighlightMarker(i.locId),3000)}if(i.places)i.places.forEach(x=>{highlightMarker(x);setTimeout(()=>unhighlightMarker(x),3000)})};s.appendChild(d)});p.appendChild(s);document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));document.querySelectorAll('.tab-panel').forEach(x=>x.classList.remove('active'));p.classList.add('active')}
function closeSearchResults(){document.getElementById('tab-search').classList.remove('active');document.querySelector('.tab-btn[data-tab="adventurers"]').classList.add('active');document.getElementById('tab-adventurers').classList.add('active');sI.value=''}

// ===== POPUPS =====
function findEventSession(evTitle){for(const s of sessions){if(s.events.find(e=>e.title===evTitle))return s}return null}
function openSessionTab(sessionId){
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
  document.querySelector('.tab-btn[data-tab="history"]').classList.add('active');
  document.getElementById('tab-history').classList.add('active');
  const blocks=document.querySelectorAll('.session-block');
  blocks.forEach(b=>{b.classList.add('collapsed')});
  if(blocks[sessionId]){blocks[sessionId].classList.remove('collapsed');blocks[sessionId].scrollIntoView({behavior:'smooth'})}
}
function showInteriorView(loc){
  closePopup();
  const view=document.getElementById('interiorView');
  const svg=document.getElementById('interiorSvg');
  const inv=loc.interiorView;
  svg.setAttribute('viewBox',inv.viewBox||'0 0 1208 864');
  document.getElementById('interiorTitle').textContent=loc.name.toUpperCase();
  let html='';
  if(inv.image){
    html+='<image href="'+inv.image+'" x="0" y="0" width="1208" height="864" preserveAspectRatio="xMidYMid meet"/>';
  }
  inv.rooms.forEach(r=>{
    html+='<g class="interior-room" data-room="'+r.id+'" onclick="selectInteriorRoom(this,\''+r.id+'\')">';
    html+='<polygon class="room-hotspot" points="'+r.polygon+'" fill="rgba(255,215,0,0)" stroke="rgba(255,215,0,0)" stroke-width="3"/>';
    if(r.number){
      const pts=r.polygon.split(' ').map(p=>p.split(',').map(Number));
      const cx=pts.reduce((a,p)=>a+p[0],0)/pts.length;
      const cy=pts.reduce((a,p)=>a+p[1],0)/pts.length;
      html+='<circle cx="'+cx+'" cy="'+cy+'" r="16" fill="#ffd700" stroke="#8b6914" stroke-width="2" opacity="0.9" pointer-events="none"/>';
      html+='<text x="'+cx+'" y="'+(cy+6)+'" text-anchor="middle" font-size="18" fill="#1a1a2e" font-weight="700" pointer-events="none" font-family="var(--font)">'+r.number+'</text>';
    }
    html+='</g>';
  });
  svg.innerHTML=html;
  view.classList.add('active');
  // Loader: hide once image is loaded (or skip if no image)
  const loader=document.getElementById('interiorLoader');
  loader.classList.remove('hidden');
  if(inv.image){
    const imgEl=svg.querySelector('image');
    const hide=()=>loader.classList.add('hidden');
    // Preload image to detect load event
    const preload=new Image();
    preload.onload=hide;
    preload.onerror=hide;
    preload.src=inv.image;
    // Fallback timeout
    setTimeout(hide,3000);
  }else{loader.classList.add('hidden')}
  document.getElementById('interiorContent').innerHTML='<div class="interior-empty">Klicka på ett rum för att se mer information om det.<br><br>Hovra över rum för att se vilka som är klickbara.</div>';
  // Calibration: click on image (not on a room) to get coordinates
  svg.onclick=function(e){
    if(e.target.closest('.interior-room'))return;
    const rect=svg.getBoundingClientRect();
    const vb=svg.viewBox.baseVal;
    const x=Math.round((e.clientX-rect.left)/rect.width*vb.width);
    const y=Math.round((e.clientY-rect.top)/rect.height*vb.height);
    const box=document.createElement('div');
    box.style.cssText='position:fixed;top:10px;right:16px;background:#0f0f23;border:2px solid #ffd700;color:#ffd700;padding:12px 20px;font-family:var(--font);font-size:14px;z-index:999;border-radius:6px;cursor:pointer';
    box.textContent='x:'+x+',y:'+y;
    box.onclick=()=>{navigator.clipboard.writeText(x+','+y);box.textContent='Kopierat!';setTimeout(()=>box.remove(),800)};
    document.body.appendChild(box);
    setTimeout(()=>box.remove(),5000);
  };
}

function selectInteriorRoom(el,roomId){
  document.querySelectorAll('.interior-room.selected').forEach(r=>r.classList.remove('selected'));
  el.classList.add('selected');
  const loc=locations.find(l=>l.interiorView);
  const room=loc.interiorView.rooms.find(r=>r.id===roomId);
  if(!room)return;
  let html=`<div class="interior-room-title">${room.icon?room.icon+' ':''}${room.name}</div>`;
  if(room.owner){
    const ch=characters.find(c=>c.id===room.owner);
    if(ch){
      html+=`<span class="interior-owner-link" onclick="showCharacterDetail(characters.find(c=>c.id==='${ch.id}'))">⚔️ ${ch.name}</span>`;
    }
  }
  html+=`<div class="interior-room-desc">${linkifyFactions(room.desc)}</div>`;
  if(room.effects&&room.effects.length){
    html+='<div class="interior-section-title">SPECIELLA EGENSKAPER</div><ul class="interior-effects">';
    room.effects.forEach(e=>html+=`<li>${linkifyFactions(e)}</li>`);
    html+='</ul>';
  }
  document.getElementById('interiorContent').innerHTML=html;
}

function closeInteriorView(){
  document.getElementById('interiorView').classList.remove('active');
  document.querySelectorAll('.interior-room.selected').forEach(r=>r.classList.remove('selected'));
}

function getEventNpcs(ev){
  const names=new Set();
  // Match by session+title
  if(ev.session!==undefined){
    const s=sessions.find(x=>x.id===ev.session);
    if(s){
      const se=s.events.find(e=>e.title===ev.title);
      if(se&&se.npcs)se.npcs.forEach(n=>names.add(n));
    }
  }
  // Also scan detail/preview text for known NPC names
  const text=(ev.detail||'')+' '+(ev.preview||'');
  npcsData.forEach(npc=>{if(text.includes(npc.name))names.add(npc.name)});
  return[...names];
}
function showLocation(l){
  if(l.interiorView){showInteriorView(l);return}
  closePopup();
  const popup=document.getElementById('locationPopup');
  document.getElementById('popupTitle').textContent=l.name;
  document.getElementById('popupSummary').innerHTML=linkifyFactions(l.summary);
  // Descriptions section
  const dc=document.getElementById('popupDescriptions');
  if(l.descriptions&&l.descriptions.length){
    let dh='<h3>PLATSBESKRIVNING</h3>';
    l.descriptions.forEach(d=>{
      const items=d.items.map(i=>`<li>${linkifyFactions(i)}</li>`).join('');
      dh+=`<div class="desc-section collapsed" onclick="this.classList.toggle('collapsed')"><div class="desc-title">${d.title}<span class="desc-tog">▼</span></div><ul>${items}</ul></div>`;
    });
    dc.innerHTML=dh;
    dc.style.display='block';
  }else{dc.innerHTML='';dc.style.display='none'}
  const e=document.getElementById('popupEvents');
  e.innerHTML='<h3>HÄNDELSER</h3>';
  if(!l.events.length) e.innerHTML+='<div class="empty-state">Inga händelser ännu.</div>';
  else l.events.forEach((ev,i)=>{
    const sess=ev.session!==undefined?sessions.find(s=>s.id===ev.session):null;
    const sessLabel=sess?`<div class="event-session" onclick="event.stopPropagation();openSessionTab(${sess.id})">📜 ${sess.label}</div>`:'';
    // NPC chips
    const npcNames=getEventNpcs(ev);
    let chipsHtml='';
    if(npcNames.length){
      chipsHtml='<div class="event-npc-chips">';
      npcNames.forEach(name=>{
        const npc=npcsData.find(x=>x.name===name);
        if(npc){const cls=npc.status==='hostile'?'event-npc-chip hostile':'event-npc-chip';chipsHtml+=`<span class="${cls}" onclick="event.stopPropagation();showNPCDetail(npcsData.find(x=>x.name==='${name.replace(/'/g,"\\'")}'))">👤 ${name}</span>`}
        else chipsHtml+=`<span class="event-npc-chip unknown">👤 ${name}</span>`;
      });
      chipsHtml+='</div>';
    }
    const d=document.createElement('div');d.className='event-item';
    d.innerHTML=`<div class="event-title">${linkifyFactions(ev.title)}</div>${sessLabel}<div class="event-preview">${linkifyFactions(ev.preview)}</div><div class="event-detail" id="ed_${l.id}_${i}">${linkifyFactions(ev.detail)}${chipsHtml}</div>`;
    d.onclick=()=>document.getElementById(`ed_${l.id}_${i}`).classList.toggle('active');
    e.appendChild(d);
  });
  // Position in screen-space near the marker
  const ma=document.querySelector('.map-container');
  const maRect=ma.getBoundingClientRect();
  const sx=l.x*scale+panX+maRect.left+15;
  const sy=l.y*scale+panY+maRect.top;
  const popW=380,popH=450;
  let px=sx+20, py=sy-popH/2;
  // Keep within screen
  if(px+popW>window.innerWidth-8) px=sx-popW-20;
  if(px<8) px=8;
  if(py<8) py=8;
  if(py+popH>window.innerHeight-8) py=window.innerHeight-popH-8;
  popup.style.left=px+'px';
  popup.style.top=py+'px';
  popup.style.transform='';
  popup.classList.add('active');
  // Highlight marker
  const m=document.getElementById('marker-'+l.id);if(m)m.classList.add('highlighted');
}
function showCharacterDetail(ch){
  document.getElementById('charDetailName').textContent=ch.name;
  document.getElementById('charDetailClass').textContent=ch.subclass;
  document.getElementById('charDetailSpecies').textContent=ch.species;
  const p=document.getElementById('charDetailPortrait');p.innerHTML='';
  const cv=document.createElement('canvas');p.appendChild(cv);drawPortrait(cv,ch.id);
  const b=document.getElementById('charDetailBody');b.innerHTML='';
  // Collapsible stats
  const st=[];
  if(ch.age)st.push({l:'Ålder',v:ch.age});if(ch.gender)st.push({l:'Kön',v:ch.gender});
  if(ch.org){const fac=factions.find(f=>f.name===ch.org);if(fac)st.push({l:'Organisation',v:`<span class="stat-faction-link" onclick="closePopup();setTimeout(()=>showFactionDetail(factions.find(f=>f.id==='${fac.id}')),100)">${ch.org}</span>`,raw:true});else st.push({l:'Organisation',v:ch.org})}
  if(ch.appearance.skin)st.push({l:'Hy',v:ch.appearance.skin});
  if(ch.appearance.eyes)st.push({l:'Ögon',v:ch.appearance.eyes});
  if(ch.appearance.hair)st.push({l:'Hår',v:ch.appearance.hair});
  if(st.length){
    let statsHtml='';st.forEach(s=>statsHtml+=`<div class="stat-row"><span class="stat-label">${s.l}</span><span class="stat-value">${s.v}</span></div>`);
    b.innerHTML+=`<div class="section-toggle collapsed" onclick="this.classList.toggle('collapsed');this.nextElementSibling.classList.toggle('collapsed')"><h3>DETALJER</h3><span class="tog-icon">▼</span></div><div class="section-body collapsed" style="max-height:400px">${statsHtml}</div>`;
  }
  // Collapsible backstory
  b.innerHTML+=`<div class="section-toggle collapsed" onclick="this.classList.toggle('collapsed');this.nextElementSibling.classList.toggle('collapsed')"><h3>BAKGRUND</h3><span class="tog-icon">▼</span></div><div class="section-body collapsed" style="max-height:600px"><p>${linkifyFactions(ch.backstory)}</p></div>`;
  // Personal events (always visible)
  if(ch.personalEvents&&ch.personalEvents.length){
    let h='<div class="personal-events"><h3>SENASTE HÄNDELSER</h3>';
    ch.personalEvents.slice(0,5).forEach(e=>{const sess=e.session!==undefined?sessions.find(s=>s.id===e.session):null;const sl=sess?`<div class="pe-session" onclick="event.stopPropagation();closePopup();openSessionTab(${sess.id})">📜 ${sess.label}: ${sess.title}</div>`:'';h+=`<div class="pe-item"><div class="pe-label">${e.label}</div>${sl}<div class="pe-text">${linkifyFactions(e.text)}</div></div>`});
    h+='</div>';b.innerHTML+=h;
  }
  document.getElementById('overlay').classList.add('active');
  document.getElementById('charDetailPopup').classList.add('active');
}
function showNPCDetail(n){document.getElementById('npcDetailTitle').textContent=n.name;document.getElementById('npcDetailRoleLabel').textContent=n.role||'';const pp=document.getElementById('npcDetailPortrait');pp.innerHTML='';const pcv=document.createElement('canvas');pp.appendChild(pcv);drawNpcPortrait(pcv,n.id);const b=document.getElementById('npcDetailBody');const sl={friendly:'Vänlig',hostile:'Fiende',neutral:'Neutral',unknown:'Okänd'};b.innerHTML=`<div><span class="npc-status ${n.status}" style="margin-bottom:10px">${sl[n.status]}</span><p style="margin-top:12px">${linkifyFactions(n.desc)}</p></div>`;if(n.events&&n.events.length){let h='<div class="npc-events"><h3>HÄNDELSER MED GRÅSTENSVÄKTARNA</h3>';n.events.forEach(e=>{const sess=e.session!==undefined?sessions.find(s=>s.id===e.session):null;const sl=sess?`<div class="pe-session" onclick="event.stopPropagation();closePopup();openSessionTab(${sess.id})">📜 ${sess.label}: ${sess.title}</div>`:'';h+=`<div class="pe-item"><div class="pe-label">${e.label}</div>${sl}<div class="pe-text">${linkifyFactions(e.text)}</div></div>`});h+='</div>';b.innerHTML+=h}else b.innerHTML+='<div class="npc-events"><h3>HÄNDELSER MED GRÅSTENSVÄKTARNA</h3><div class="empty-state">Inga direkta interaktioner ännu.</div></div>';const npcPlaces=getNpcPlaces(n.name);if(npcPlaces.length){let ph='<div class="npc-events"><h3>PLATSER</h3><ul class="ref-list">';npcPlaces.forEach(pid=>{const loc=locations.find(l=>l.id===pid);if(loc)ph+=`<li class="place-ref" onmouseenter="highlightMarkerNpc('${pid}')" onmouseleave="unhighlightMarkerNpc('${pid}')" onclick="closePopup();setTimeout(()=>showLocation(locations.find(l=>l.id==='${pid}')),100)"><span class="ref-icon">&#9679;</span>${loc.name}</li>`});ph+='</ul></div>';b.innerHTML+=ph}document.getElementById('overlay').classList.add('active');document.getElementById('npcDetailPopup').classList.add('active')}
function showTimelineDetail(ev){document.getElementById('tlDetailTitle').textContent=ev.title;const b=document.getElementById('tlDetailBody');b.innerHTML=`<div class="recap">${linkifyFactions(ev.recap)}</div>`;if(ev.places.length){let h='<div class="ref-section"><h4>PLATSER</h4><ul class="ref-list">';ev.places.forEach(pid=>{const loc=locations.find(l=>l.id===pid);if(loc)h+=`<li class="place-ref" onmouseenter="highlightMarker('${pid}')" onmouseleave="unhighlightMarker('${pid}')" onclick="closePopup();setTimeout(()=>showLocation(locations.find(l=>l.id==='${pid}')),100)"><span class="ref-icon">&#9679;</span>${loc.name}</li>`});h+='</ul></div>';b.innerHTML+=h}if(ev.npcs&&ev.npcs.length){let h='<div class="ref-section"><h4>NPCs</h4><ul class="ref-list">';ev.npcs.forEach(n=>h+=`<li class="npc-ref"><span class="ref-icon">&#9670;</span>${n}</li>`);h+='</ul></div>';b.innerHTML+=h}document.getElementById('overlay').classList.add('active');document.getElementById('tlDetail').classList.add('active')}
function highlightMarker(id){const m=document.getElementById('marker-'+id);if(m)m.classList.add('highlighted')}
function unhighlightMarker(id){const m=document.getElementById('marker-'+id);if(m)m.classList.remove('highlighted')}
function closePopup(){document.getElementById('overlay').classList.remove('active');['charDetailPopup','tlDetail','npcDetailPopup','factionDetailPopup'].forEach(id=>document.getElementById(id).classList.remove('active'));document.getElementById('locationPopup').classList.remove('active');document.querySelectorAll('.location-marker.highlighted').forEach(m=>m.classList.remove('highlighted'));document.querySelectorAll('.location-marker.npc-glow').forEach(m=>m.classList.remove('npc-glow'))}
function linkifyReferences(text){
  if(!text)return text||'';
  const refs=[];
  // Collect all reference candidates with index-based handlers (avoids escaping issues)
  factions.forEach((f,i)=>refs.push({name:f.name,cls:'ref-link ref-faction',handler:'showFactionDetail(factions['+i+'])'}));
  npcsData.forEach((n,i)=>{
    const hostile=n.status==='hostile'?' hostile':'';
    const cls='ref-link ref-npc'+hostile;
    const handler='showNPCDetail(npcsData['+i+'])';
    refs.push({name:n.name,cls,handler});
    (n.aliases||[]).forEach(a=>refs.push({name:a,cls,handler}));
  });
  locations.forEach((l,i)=>refs.push({name:l.name,cls:'ref-link ref-loc',handler:'showLocation(locations['+i+'])'}));
  characters.forEach((c,i)=>{
    refs.push({name:c.name,cls:'ref-link ref-char',handler:'showCharacterDetail(characters['+i+'])'});
    const firstName=c.name.split(' ')[0];
    if(firstName.length>=4&&firstName!==c.name){
      refs.push({name:firstName,cls:'ref-link ref-char',handler:'showCharacterDetail(characters['+i+'])'});
    }
  });
  if(!refs.length)return text;
  // Sort by name length desc for greedy matching
  refs.sort((a,b)=>b.name.length-a.name.length);
  // Find all non-overlapping matches (Swedish-aware word boundaries)
  const matches=[];
  refs.forEach(ref=>{
    const esc=ref.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    let re;
    try{re=new RegExp('(?<![\\wåäöÅÄÖ])('+esc+')(?![\\wåäöÅÄÖ])','g');}
    catch(e){re=new RegExp('\\b('+esc+')\\b','g');}
    let m;
    while((m=re.exec(text))!==null){
      const overlap=matches.some(x=>m.index<x.end&&m.index+m[0].length>x.start);
      if(!overlap)matches.push({start:m.index,end:m.index+m[0].length,text:m[0],ref});
    }
  });
  matches.sort((a,b)=>a.start-b.start);
  let out='';let lastEnd=0;
  matches.forEach(m=>{
    out+=text.substring(lastEnd,m.start);
    out+='<span class="'+m.ref.cls+'" onclick="event.stopPropagation();closePopup();setTimeout(()=>'+m.ref.handler+',100)">'+m.text+'</span>';
    lastEnd=m.end;
  });
  out+=text.substring(lastEnd);
  return out;
}
// Backwards compat alias - all existing calls now get full linkification
const linkifyFactions=linkifyReferences;
function showFactionDetail(f){document.getElementById('factionTitle').textContent=f.name;document.getElementById('factionMotto').textContent=f.motto||'';document.getElementById('factionSymbol').textContent=f.symbol||'⚜';let h=`<div>${f.desc}</div>`;const members=characters.filter(c=>c.org===f.name);if(members.length){h+='<div class="faction-members"><h3>MEDLEMMAR I GRÅSTENSVÄKTARNA</h3>';members.forEach(m=>{h+=`<span class="faction-member-chip" onclick="closePopup();setTimeout(()=>showCharacterDetail(characters.find(c=>c.id==='${m.id}')),100)">⚔️ ${m.name}</span>`});h+='</div>'}document.getElementById('factionBody').innerHTML=h;document.getElementById('overlay').classList.add('active');document.getElementById('factionDetailPopup').classList.add('active')}

// ===== PAN & ZOOM (mouse + touch) =====
let scale=1,panX=0,panY=0,isDragging=false,dragSX,dragSY;
function updateTransform(){document.getElementById('mapCanvas').style.transform=`translate(${panX}px,${panY}px) scale(${scale})`;scheduleSave()}
const vp=document.getElementById('mapViewport');
vp.addEventListener('mousedown',e=>{if(e.target.closest('.location-marker'))return;if(!e.target.closest('.location-popup'))closePopup();isDragging=true;dragSX=e.clientX-panX;dragSY=e.clientY-panY});
window.addEventListener('mousemove',e=>{if(!isDragging)return;panX=e.clientX-dragSX;panY=e.clientY-dragSY;updateTransform()});
window.addEventListener('mouseup',()=>isDragging=false);
vp.addEventListener('wheel',e=>{e.preventDefault();const ma=document.querySelector('.map-container');const vw=ma.clientWidth,vh=ma.clientHeight;const cx=vw/2,cy=vh/2;const oldScale=scale;scale=Math.max(.2,Math.min(2.5,scale+(e.deltaY>0?-.1:.1)));panX=cx-(cx-panX)*(scale/oldScale);panY=cy-(cy-panY)*(scale/oldScale);updateTransform()},{passive:false});
// Touch support
let lastTouchDist=0,lastTouchX=0,lastTouchY=0,touchDragging=false;
vp.addEventListener('touchstart',e=>{if(e.touches.length===1){touchDragging=true;lastTouchX=e.touches[0].clientX-panX;lastTouchY=e.touches[0].clientY-panY}if(e.touches.length===2){touchDragging=false;lastTouchDist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY)}},{passive:true});
vp.addEventListener('touchmove',e=>{if(e.touches.length===1&&touchDragging){panX=e.touches[0].clientX-lastTouchX;panY=e.touches[0].clientY-lastTouchY;updateTransform()}if(e.touches.length===2){const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);if(lastTouchDist){const delta=(d-lastTouchDist)*.005;scale=Math.max(.3,Math.min(2.5,scale+delta))}lastTouchDist=d;updateTransform()}},{passive:true});
vp.addEventListener('touchend',()=>{touchDragging=false;lastTouchDist=0});
const MAP_W=2576,MAP_H=1664;
function zoomAroundCenter(newScale){
  const ma=document.querySelector('.map-container');
  const vw=ma.clientWidth,vh=ma.clientHeight;
  const cx=vw/2,cy=vh/2;
  const oldScale=scale;
  scale=Math.max(.2,Math.min(2.5,newScale));
  panX=cx-(cx-panX)*(scale/oldScale);
  panY=cy-(cy-panY)*(scale/oldScale);
  updateTransform();
}
function zoomIn(){zoomAroundCenter(scale+.15)}
function zoomOut(){zoomAroundCenter(scale-.15)}
function resetView(){fitMapToView()}
function fitMapToView(){
  const ma=document.querySelector('.map-container');
  const vw=ma.clientWidth,vh=ma.clientHeight;
  scale=Math.min(vw/MAP_W,vh/MAP_H);
  panX=(vw-MAP_W*scale)/2;
  panY=(vh-MAP_H*scale)/2;
  updateTransform();
}

document.getElementById('locationPopup').addEventListener('wheel',e=>e.stopPropagation(),{passive:false});
document.getElementById('locationPopup').addEventListener('mousedown',e=>e.stopPropagation());
document.getElementById('locationPopup').addEventListener('touchstart',e=>e.stopPropagation());
document.getElementById('locationPopup').addEventListener('touchmove',e=>e.stopPropagation());
// Calibration: click empty map area to see coordinates (desktop only)
document.getElementById('mapCanvas').addEventListener('click',function(e){
  if(e.target.closest('.location-marker')||e.target.closest('.location-popup'))return;
  if(window.innerWidth<=900)return; // hide on mobile
  const rect=this.getBoundingClientRect();
  const x=Math.round((e.clientX-rect.left)/scale);
  const y=Math.round((e.clientY-rect.top)/scale);
  const box=document.createElement('div');
  box.style.cssText='position:fixed;top:10px;right:16px;background:#0f0f23;border:2px solid #ffd700;color:#ffd700;padding:12px 20px;font-family:var(--font);font-size:14px;z-index:999;border-radius:6px;cursor:pointer';
  box.textContent='x:'+x+',y:'+y;
  box.onclick=()=>{navigator.clipboard.writeText('x:'+x+',y:'+y);box.textContent='Kopierat!';setTimeout(()=>box.remove(),800)};
  document.body.appendChild(box);
  setTimeout(()=>box.remove(),5000);
});
// Session filter
let currentSessionFilter='all';
function populateSessionFilter(){const sel=document.getElementById('sessionFilter');sel.innerHTML='<option value="all">Alla sessioner</option>';sessions.forEach(s=>{const o=document.createElement('option');o.value=s.id;o.textContent=s.label+': '+s.title;sel.appendChild(o)});sel.addEventListener('change',function(){filterMapBySession(this.value)})}
function filterMapBySession(val){currentSessionFilter=val;scheduleSave();if(val==='all'){document.querySelectorAll('.location-marker').forEach(m=>m.classList.remove('session-dimmed'))}else{const s=sessions.find(x=>x.id===parseInt(val));if(s){const placeSet=new Set();s.events.forEach(ev=>ev.places.forEach(p=>placeSet.add(p)));locations.forEach(l=>{const m=document.getElementById('marker-'+l.id);if(!m)return;if(placeSet.has(l.id))m.classList.remove('session-dimmed');else m.classList.add('session-dimmed')})}}renderNPCs()}
function clearSessionFilter(){document.getElementById('sessionFilter').value='all';filterMapBySession('all')}

// NPC-to-place utility
function getNpcPlaces(npcName){const ps=new Set();sessions.forEach(s=>{s.events.forEach(ev=>{if(ev.npcs&&ev.npcs.some(n=>n.toLowerCase()===npcName.toLowerCase()))ev.places.forEach(p=>ps.add(p))})});return[...ps]}
function highlightMarkerNpc(id){const m=document.getElementById('marker-'+id);if(m)m.classList.add('npc-glow')}
function unhighlightMarkerNpc(id){const m=document.getElementById('marker-'+id);if(m)m.classList.remove('npc-glow')}

// Recap mode
let recapActive=false,recapHighlightedPlaces=[];
function toggleRecapMode(){if(recapActive){exitRecapMode();return}recapActive=true;document.getElementById('recapBtn').classList.add('active');document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));document.getElementById('tab-recap').classList.add('active');const last=sessions[sessions.length-1];renderRecap(last);const ps=new Set();last.events.forEach(ev=>ev.places.forEach(p=>ps.add(p)));recapHighlightedPlaces=[...ps];recapHighlightedPlaces.forEach(id=>highlightMarker(id));document.getElementById('sessionFilter').value=last.id;filterMapBySession(last.id)}
function exitRecapMode(){recapActive=false;document.getElementById('recapBtn').classList.remove('active');recapHighlightedPlaces.forEach(id=>unhighlightMarker(id));recapHighlightedPlaces=[];document.querySelector('.tab-btn[data-tab="adventurers"]').classList.add('active');document.getElementById('tab-adventurers').classList.add('active');document.getElementById('tab-recap').classList.remove('active');document.getElementById('sessionFilter').value='all';filterMapBySession('all')}
function renderRecap(s){const p=document.getElementById('tab-recap');let h=`<div class="recap-header"><div class="recap-label">${s.label}</div><h2>${s.title}</h2></div>`;s.events.forEach(ev=>{h+=`<div class="recap-event"><div class="recap-event-title">${ev.title}</div>${linkifyFactions(ev.recap)}</div>`});const placeIds=new Set();s.events.forEach(ev=>ev.places.forEach(x=>placeIds.add(x)));if(placeIds.size){h+='<div class="recap-section"><h3>PLATSER</h3>';placeIds.forEach(pid=>{const loc=locations.find(l=>l.id===pid);if(loc)h+=`<span class="recap-tag place-tag" onmouseenter="highlightMarker('${pid}')" onmouseleave="unhighlightMarker('${pid}')" onclick="showLocation(locations.find(l=>l.id==='${pid}'))">${loc.name}</span>`});h+='</div>'}const npcNames=new Set();s.events.forEach(ev=>{if(ev.npcs)ev.npcs.forEach(n=>npcNames.add(n))});if(npcNames.size){h+='<div class="recap-section"><h3>NPCs</h3>';npcNames.forEach(name=>{const npc=npcsData.find(n=>n.name===name);if(npc)h+=`<span class="recap-tag npc-tag" onclick="showNPCDetail(npcsData.find(n=>n.name==='${name.replace(/'/g,"\\'")}'))">${name}</span>`;else h+=`<span class="recap-tag npc-tag" style="cursor:default">${name}</span>`});h+='</div>'}p.innerHTML=h}

// ===== LOCALSTORAGE STATE =====
const STORAGE_KEY='grastensvaktarna.uistate.v1';
function saveUIState(){
  try{
    const s={scale,panX,panY,sessionFilter:currentSessionFilter,activeTab:document.querySelector('.tab-btn.active')?.dataset.tab||'adventurers'};
    localStorage.setItem(STORAGE_KEY,JSON.stringify(s));
  }catch(e){/* quota or disabled */}
}
function loadUIState(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(!raw)return null;
    return JSON.parse(raw);
  }catch(e){return null}
}
// Debounced save
let _saveT;
function scheduleSave(){clearTimeout(_saveT);_saveT=setTimeout(saveUIState,400)}

function validateData(){
  const warnings=[];
  const locIds=new Set(locations.map(l=>l.id));
  const npcNames=new Set(npcsData.map(n=>n.name));
  const charIds=new Set(characters.map(c=>c.id));
  const facNames=new Set(factions.map(f=>f.name));
  const sessIds=new Set(sessions.map(s=>s.id));
  // Sessions: places must exist, npcs should exist (warn if not)
  sessions.forEach(s=>{
    s.events.forEach(ev=>{
      (ev.places||[]).forEach(p=>{if(!locIds.has(p))warnings.push(`Session ${s.id} "${ev.title}": okänd plats "${p}"`)});
      (ev.npcs||[]).forEach(n=>{if(!npcNames.has(n))warnings.push(`Session ${s.id} "${ev.title}": NPC "${n}" finns inte i npcs.json (visas som okänd)`)});
    });
  });
  // Locations: event.session must exist
  locations.forEach(l=>{
    (l.events||[]).forEach(ev=>{
      if(ev.session!==undefined&&!sessIds.has(ev.session))warnings.push(`Location "${l.id}" event "${ev.title}": ogiltig session ${ev.session}`);
    });
    // interiorView room owners must exist
    if(l.interiorView)l.interiorView.rooms.forEach(r=>{
      if(r.owner&&!charIds.has(r.owner))warnings.push(`Location "${l.id}" interior room "${r.id}": okänd ägare "${r.owner}"`);
    });
  });
  // Characters: org should match a faction (warn if not)
  characters.forEach(c=>{
    if(c.org&&!facNames.has(c.org))warnings.push(`Karaktär "${c.id}": organisation "${c.org}" är inte registrerad som faction (saknar klickbar länk)`);
    (c.personalEvents||[]).forEach(ev=>{
      if(ev.session!==undefined&&!sessIds.has(ev.session))warnings.push(`Karaktär "${c.id}" event "${ev.label}": ogiltig session ${ev.session}`);
    });
  });
  // NPCs: events.session must exist
  npcsData.forEach(n=>{
    (n.events||[]).forEach(ev=>{
      if(ev.session!==undefined&&!sessIds.has(ev.session))warnings.push(`NPC "${n.name}" event "${ev.label}": ogiltig session ${ev.session}`);
    });
  });
  if(warnings.length){
    console.warn('⚠️  Data-validering hittade '+warnings.length+' problem:');
    warnings.forEach(w=>console.warn('  •',w));
  }else{
    console.log('✓ Data-validering OK ('+locations.length+' platser, '+characters.length+' karaktärer, '+npcsData.length+' NPCs, '+sessions.length+' sessioner, '+factions.length+' factions)');
  }
  return warnings;
}
async function init(){
  document.getElementById('appVersion').textContent='v'+APP_VERSION+' · data v'+DATA_VERSION;
  try{
    await loadData();
  }catch(e){
    console.error('Failed to load data:',e);
    document.body.innerHTML='<div style="padding:40px;color:#e0c878;font-family:monospace;text-align:center"><h2>Kunde inte ladda data</h2><p>Ladda om sidan eller kolla nätverksanslutningen.</p><pre style="color:#a04040">'+e.message+'</pre></div>';
    return;
  }
  validateData();
  searchIndex=buildSearchIndex();
  renderCharacters();renderNPCs();renderTimeline();renderMarkers();populateSessionFilter();
  document.getElementById('recapBtn').addEventListener('click',toggleRecapMode);
  // Restore saved state or default to fit-map-to-view
  const saved=loadUIState();
  if(saved){
    if(typeof saved.scale==='number')scale=saved.scale;
    if(typeof saved.panX==='number')panX=saved.panX;
    if(typeof saved.panY==='number')panY=saved.panY;
    setTimeout(updateTransform,150);
    if(saved.sessionFilter&&saved.sessionFilter!=='all'){
      const sel=document.getElementById('sessionFilter');
      if(sel)sel.value=saved.sessionFilter;
      filterMapBySession(saved.sessionFilter);
    }
    if(saved.activeTab&&saved.activeTab!=='adventurers'){
      const btn=document.querySelector(`.tab-btn[data-tab="${saved.activeTab}"]`);
      if(btn)btn.click();
    }
  }else{
    setTimeout(fitMapToView,150);
  }
}
init();
// PWA: Register service worker
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('sw.js').catch(err=>console.warn('SW registration failed:',err));
  });
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(document.getElementById('interiorView').classList.contains('active')){closeInteriorView();return}if(recapActive)exitRecapMode();closePopup();sE.classList.remove('active')}});
