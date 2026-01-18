import express from "express";
import * as cheerio from "cheerio";
import { DateTime } from "luxon";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 3000;

const TZ = "Europe/Madrid";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

// ==============================
// EQUIPS (OSONA) — omple url amb calendari FCF
// Format URL esperat: https://www.fcf.cat/calendari-equip/...
// ==============================
const TEAMS = [
  // Vic
  { team: "Vic", url: "https://www.fcf.cat/calendari-equip/2526/futbol-11/tercera-federacio/grup-v/vic-unio-esportiva-club-a" },
  { team: "Fundació UE Vic", url: "" },
  { team: "OAR Vic", url: "" },
  { team: "FC Remei", url: "" },
  { team: "Vic Riuprimer Refo Futbol Club", url: "" },

  // Manlleu
  { team: "Manlleu", url: "https://www.fcf.cat/calendari-equip/2526/futbol-11/lliga-elit/grup-1/manlleu-aec-a" },
  { team: "AEC Manlleu", url: "https://www.fcf.cat/calendari-equip/2526/futbol-11/lliga-elit/grup-1/manlleu-aec-a" },
  { team: "AEC Manlleu B", url: "" },

  // Torelló i rodalia
  // Nota: aquest enllaç és el TORELLO, C.F. B (Tercera Catalana G4). Si vols un altre equip del club,
  // canvia la URL pel calendari-equip corresponent.
  { team: "CF Torelló", url: "https://www.fcf.cat/calendari-equip/2526/divisio-honor-cadet-s15/tercera-catalana/grup-4/torello-cf-b" },
  { team: "CF Torelló B", url: "" },
  { team: "UE Sant Vicenç de Torelló", url: "" },
  { team: "CD Borgonyà", url: "" },
  { team: "UE Santperenca", url: "" },

  // Roda de Ter
  { team: "CE Roda de Ter", url: "https://www.fcf.cat/calendari-equip/2526/futbol11/tercera-catalana/grup-4/roda-de-ter-ce-a" },

  // Voltreganès
  { team: "CF Voltregà", url: "https://www.fcf.cat/calendari-equip/2526/divisio-honor-cadet-s15/tercera-catalana/grup-4/voltrega-cf-a" },
  { team: "CF Vinyoles", url: "" },
  { team: "CF La Gleva", url: "" },

  // Taradell – Tona – Balenyà
  { team: "UD Taradell", url: "https://www.fcf.cat/calendari-equip/2526/futbol11/tercera-catalana/grup-4/taradell-ud-a" },
  { team: "UD Taradell B", url: "https://www.fcf.cat/calendari-equip/2526/futbol11/quarta-catalana/grup-8/taradell-ud-b" },
  { team: "UE Tona", url: "https://www.fcf.cat/calendari-equip/2526/futbol-11/tercera-federacio/grup-v/tona-ue-a" },
  { team: "UE Tona C", url: "" },
  { team: "CF Osona Sud", url: "" },
  { team: "Atlètic Balenyà", url: "" },
  { team: "CE Sant Miquel de Balenyà", url: "" },

  // Gurb – Calldetenes – Riudeperes
  { team: "UE Gurb", url: "https://www.fcf.cat/calendari-equip/2526/tercera-catalana/tercera-catalana/grup-4/gurb-ue-a" },
  { team: "UE Gurb B", url: "" },
  { team: "UE Gurb C", url: "" },
  { team: "CF Calldetenes", url: "" },
  { team: "Atlètic Riudeperes", url: "" },

  // Centelles – Seva – Aiguafreda
  { team: "UE Centelles", url: "" },
  { team: "UE Centelles B", url: "" },
  { team: "UE Seva", url: "https://www.fcf.cat/calendari-equip/2526/futbol-11/tercera-catalana/grup-4/seva-ue-a" },
  { team: "UE Seva B", url: "" },
  { team: "CE Aiguafreda", url: "" },

  // Nord d’Osona
  { team: "UD Sant Quirze de Besora", url: "https://www.fcf.cat/calendari-equip/2526/primera-federacio-futbol-femeni/tercera-catalana/grup-4/sant-quirze-besora-ud-a" },
  { team: "CD Montesquiu", url: "" },

  // Folgueroles – Vilatorta – Santa Eugènia
  { team: "CF Folgueroles", url: "https://www.fcf.cat/calendari-equip/2526/futbol11/tercera-catalana/grup-4/folgueroles-cf-a" },
  { team: "CF Sant Julià de Vilatorta", url: "" },
  { team: "JE Santa Eugènia", url: "https://www.fcf.cat/calendari-equip/2526/futbol11/tercera-catalana/grup-4/santa-eugenia-je-a" },

  // Rupit – Corcó – Cantonigròs
  { team: "UE Rupit i Pruit", url: "" },
  { team: "AE Corcó", url: "https://www.fcf.cat/calendari-equip/2526/futbol-11/tercera-catalana/grup-4/corco-ae-a" },
  { team: "UE Cantonigròs", url: "https://www.fcf.cat/calendari-equip/2526/futbol-11/tercera-catalana/grup-4/cantonigros-ue-a" },

  // Lluçanès
  { team: "FC Pradenc", url: "https://www.fcf.cat/calendari-equip/2526/futbol11/tercera-catalana/grup-4/pradenc-fc-a" },
  { team: "CE Moià", url: "https://www.fcf.cat/calendari-equip/2526/futbol11/tercera-catalana/grup-4/moia-ce-a" },
  { team: "CE Moià B", url: "" },
  { team: "Olost FC", url: "" }
];


// ==============================
// Cache (geocoding)
// ==============================
const GEO_CACHE_FILE = "./geocache.json";
const STADIUM_CACHE_FILE = "./stadiums.json";

function loadJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return fallback;
  }
}
function saveJson(file, obj) {
  try {
    fs.writeFileSync(file, JSON.stringify(obj, null, 2));
  } catch {
    // Si el FS fos read-only, no passa res (seguiria sense cache)
  }
}

const geoCache = loadJson(GEO_CACHE_FILE, {}); // key: address -> {lat, lon, display_name, updatedAtISO}
const stadiumCache = loadJson(STADIUM_CACHE_FILE, {}); // key: team -> {stadiumName, address, updatedAtISO}

// ==============================
// Helpers
// ==============================
function normalizeSpaces(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}
function parseDMY(dateText) {
  const t = normalizeSpaces(dateText).replace(/\//g, "-");
  const dt = DateTime.fromFormat(t, "dd-MM-yyyy", { zone: TZ });
  return dt.isValid ? dt.startOf("day") : null;
}
function parseHM(timeText) {
  const t = normalizeSpaces(timeText);
  const dt = DateTime.fromFormat(t, "HH:mm", { zone: TZ });
  return dt.isValid ? { hour: dt.hour, minute: dt.minute } : null;
}
function getWeekendRange(offsetWeeks = 0) {
  const now = DateTime.now().setZone(TZ).plus({ weeks: offsetWeeks });
  const weekday = now.weekday; // 1..7
  const daysToSat = (6 - weekday + 7) % 7;
  const sat = now.plus({ days: daysToSat }).startOf("day");
  const sun = sat.plus({ days: 1 }).endOf("day");
  return { sat, sun };
}
function inWeekend(dtISO, offsetWeeks = 0) {
  const dt = DateTime.fromISO(dtISO, { zone: TZ });
  if (!dt.isValid) return false;
  const { sat, sun } = getWeekendRange(offsetWeeks);
  return dt >= sat && dt <= sun;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ==============================
// Geocoding (OpenStreetMap Nominatim) + cache
// ==============================
async function geocodeAddress(address) {
  const key = normalizeSpaces(address);
  if (!key) return null;
  if (geoCache[key]) return geoCache[key];

  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
    encodeURIComponent(key);

  const res = await fetch(url, {
    headers: {
      "User-Agent": "SPORTS-RADAR-OSONA/1.0 (demo)",
      Accept: "application/json"
    }
  });

  if (!res.ok) return null;
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  const hit = {
    lat: Number(data[0].lat),
    lon: Number(data[0].lon),
    display_name: data[0].display_name,
    updatedAtISO: DateTime.now().setZone(TZ).toISO()
  };

  geoCache[key] = hit;
  saveJson(GEO_CACHE_FILE, geoCache);

  // throttle (respectuós)
  await sleep(900);

  return hit;
}

// ==============================
// Scraping FCF: calendari-equip
// Nota: el calendari dona data/hora/casa/fora.
// Per “camp exacte” cal anar a la fitxa/acta del partit.
// Com que la FCF varia el layout, ho fem amb detecció robusta:
// - busquem links que continguin "/acta/" dins la fila (si existeixen).
// - si és futur, NO hi haurà acta: llavors usem camp habitual del local (cache).
// ==============================
async function scrapeFCFTeamCalendar(teamObj) {
  const warnings = [];
  if (!teamObj.url || !teamObj.url.startsWith("https://www.fcf.cat/calendari-equip/")) {
    return { matches: [], warnings: [`Falta URL FCF per: ${teamObj.team}`] };
  }

  const res = await fetch(teamObj.url, {
    headers: { "User-Agent": UA, Accept: "text/html" }
  });

  if (!res.ok) return { matches: [], warnings: [`No he pogut obrir: ${teamObj.url}`] };

  const html = await res.text();
  const $ = cheerio.load(html);

  const matches = [];

  $("table tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 5) return;

    const dateText = normalizeSpaces($(tds[1]).text());
    const timeText = normalizeSpaces($(tds[2]).text());
    const homeText = normalizeSpaces($(tds[3]).text());
    const awayText = normalizeSpaces($(tds[4]).text());

    const day = parseDMY(dateText);
    if (!day) return;

    const hm = parseHM(timeText);
    const dt = hm ? day.set({ hour: hm.hour, minute: hm.minute }) : day;

    if (!homeText || !awayText) return;

    // prova de trobar acta dins la fila (normalment a l’última cel·la)
    let actaUrl = null;
    $(tr)
      .find("a[href*='/acta/']")
      .each((_, a) => {
        const href = $(a).attr("href");
        if (!href) return;
        actaUrl = href.startsWith("http") ? href : `https://www.fcf.cat${href}`;
      });

    matches.push({
      sport: "Futbol",
      team: teamObj.team,
      source: "FCF",
      sourceUrl: teamObj.url,
      datetimeISO: dt.toISO(),
      home: homeText,
      away: awayText,
      actaUrl,
      stadiumName: null,
      address: null,
      lat: null,
      lon: null
    });
  });

  return { matches, warnings };
}

// intenta treure camp/adreça des d’una acta (si existeix)
async function scrapeActaStadium(actaUrl) {
  try {
    const res = await fetch(actaUrl, { headers: { "User-Agent": UA, Accept: "text/html" } });
    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    // Heurístic: busca una secció que contingui "Estadi" i/o un link "Com arribar"
    // Agafem el text del bloc pare.
    const comArribar = $("a")
      .filter((_, a) => normalizeSpaces($(a).text()).toLowerCase().includes("com arribar"))
      .first();

    let blockText = "";
    if (comArribar.length) {
      blockText = normalizeSpaces(comArribar.parent().text());
    } else {
      // fallback: cerca "Estadi" al text
      blockText = normalizeSpaces($.text());
    }

    // Intenta extreure "Estadi ..." (molt variable)
    // Ens quedem amb una aproximació: nom camp + resta com "adreça"
    let stadiumName = null;
    let address = null;

    // prova 1: si dins el parent hi ha un primer <a> (sovint el camp)
    if (comArribar.length) {
      const parent = comArribar.parent();
      const firstA = parent.find("a").first();
      stadiumName = normalizeSpaces(firstA.text()) || null;

      let t = normalizeSpaces(parent.text());
      t = t.replace(/Estadi/gi, "").replace(/Com arribar/gi, "");
      if (stadiumName) t = t.replace(stadiumName, "");
      address = normalizeSpaces(t) || null;
    }

    // si segueix buit, no podem garantir-ho
    if (!stadiumName && !address) return null;

    return { stadiumName, address };
  } catch {
    return null;
  }
}

// camp habitual del club (cache)
// idea: si no tenim camp, intentem trobar una acta antiga del club i guardar-ne l’adreça.
// (Si no hi ha cap acta accessible, no hi haurà pin.)
async function ensureHomeStadium(teamObj) {
  if (stadiumCache[teamObj.team]) return stadiumCache[teamObj.team];

  const { matches } = await scrapeFCFTeamCalendar(teamObj);

  // busquem qualsevol partit amb acta
  const withActa = matches
    .filter((m) => m.actaUrl)
    .sort((a, b) => DateTime.fromISO(b.datetimeISO).toMillis() - DateTime.fromISO(a.datetimeISO).toMillis());

  if (withActa.length === 0) return null;

  const info = await scrapeActaStadium(withActa[0].actaUrl);
  if (!info?.address) return null;

  stadiumCache[teamObj.team] = {
    stadiumName: info.stadiumName || null,
    address: info.address,
    updatedAtISO: DateTime.now().setZone(TZ).toISO()
  };
  saveJson(STADIUM_CACHE_FILE, stadiumCache);

  return stadiumCache[teamObj.team];
}

async function enrichMatchLocation(match) {
  // 1) si hi ha acta, provem camp exacte
  if (match.actaUrl) {
    const info = await scrapeActaStadium(match.actaUrl);
    if (info?.address) {
      match.stadiumName = info.stadiumName || null;
      match.address = info.address;

      const geo = await geocodeAddress(info.address);
      if (geo) {
        match.lat = geo.lat;
        match.lon = geo.lon;
      }
      return match;
    }
  }

  // 2) si és futur: camp habitual del local (si el local és un dels teus equips)
  const homeObj = TEAMS.find(
    (t) => normalizeSpaces(t.team).toLowerCase() === normalizeSpaces(match.home).toLowerCase()
  );

  if (homeObj) {
    const homeStadium = await ensureHomeStadium(homeObj);
    if (homeStadium?.address) {
      match.stadiumName = homeStadium.stadiumName || null;
      match.address = homeStadium.address;

      const geo = await geocodeAddress(homeStadium.address);
      if (geo) {
        match.lat = geo.lat;
        match.lon = geo.lon;
      }
    }
  }

  return match;
}

// ==============================
// Agregació cap de setmana
// ==============================
async function getWeekendMatches(offsetWeeks = 0) {
  const all = [];
  const warnings = [];

  for (const t of TEAMS) {
    const out = await scrapeFCFTeamCalendar(t);
    all.push(...out.matches);
    warnings.push(...out.warnings);
  }

  const weekend = all.filter((m) => inWeekend(m.datetimeISO, offsetWeeks));

  // dedupe
  const seen = new Set();
  const deduped = [];
  for (const m of weekend) {
    const key = `${m.datetimeISO}|${m.home}|${m.away}|${m.team}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(m);
  }

  // enrich locations (pins)
  for (let i = 0; i < deduped.length; i++) {
    deduped[i] = await enrichMatchLocation(deduped[i]);
  }

  deduped.sort(
    (a, b) =>
      DateTime.fromISO(a.datetimeISO, { zone: TZ }).toMillis() -
      DateTime.fromISO(b.datetimeISO, { zone: TZ }).toMillis()
  );

  return { matches: deduped, warnings };
}

// ==============================
// Routes
// ==============================
app.get("/api/weekend", async (req, res) => {
  const offset = Number(req.query.offset || 0);
  const offsetWeeks = Number.isFinite(offset) ? offset : 0;

  const { sat, sun } = getWeekendRange(offsetWeeks);
  const data = await getWeekendMatches(offsetWeeks);

  res.json({
    ok: true,
    timezone: TZ,
    weekend: { from: sat.toISODate(), to: sun.toISODate(), offsetWeeks },
    count: data.matches.length,
    warnings: data.warnings,
    matches: data.matches
  });
});

app.get("/", async (_req, res) => {
  const offsetWeeks = 0;
  const { sat, sun } = getWeekendRange(offsetWeeks);
  const data = await getWeekendMatches(offsetWeeks);

  const matches = data.matches;

  // centre aproximat (Vic)
  const defaultLat = 41.9304;
  const defaultLon = 2.2546;

  const points = matches
    .filter((m) => typeof m.lat === "number" && typeof m.lon === "number")
    .map((m) => ({
      lat: m.lat,
      lon: m.lon,
      title: `${DateTime.fromISO(m.datetimeISO, { zone: TZ }).toFormat("ccc dd/LL HH:mm")} — ${m.home} vs ${m.away}`,
      subtitle: m.team,
      stadium: m.stadiumName || "",
      address: m.address || "",
      actaUrl: m.actaUrl || ""
    }));

  res.type("html").send(`<!doctype html>
<html lang="ca">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>SPORTS RADAR — Futbol Osona (Mapa)</title>

  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>

  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:1100px;margin:24px auto;padding:0 14px}
    h1{margin:0 0 6px}
    .muted{color:#666}
    #map{height:520px;border:1px solid #eee;border-radius:14px}
    .box{border:1px solid #eee;border-radius:14px;padding:12px 14px;margin:12px 0}
    .btn{display:inline-block;padding:10px 12px;border-radius:10px;border:1px solid #ddd;text-decoration:none;margin-right:8px}
    li{margin:10px 0}
    small{color:#666}
    code{background:#f3f3f3;padding:2px 6px;border-radius:6px}
  </style>
</head>
<body>
  <h1>⚽ SPORTS RADAR — Futbol Osona (Mapa)</h1>
  <p class="muted">Cap de setmana: <strong>${sat.toISODate()}</strong> → <strong>${sun.toISODate()}</strong></p>

  <div class="box">
    <a class="btn" href="/api/weekend" target="_blank" rel="noreferrer">API JSON</a>
    <a class="btn" href="/api/weekend?offset=1" target="_blank" rel="noreferrer">Setmana que ve (JSON)</a>
    <span class="muted">Pins: ${points.length}/${matches.length}</span>
  </div>

  <div id="map"></div>

  <div class="box">
    <h2 style="margin:0 0 8px">Partits</h2>
    ${
      matches.length === 0
        ? "<p>No he trobat partits (o falten URLs de calendari per alguns equips).</p>"
        : `<ul>${matches
            .map((m) => {
              const dt = DateTime.fromISO(m.datetimeISO, { zone: TZ });
              const when = dt.isValid ? dt.toFormat("ccc dd/LL HH:mm") : m.datetimeISO;
              const addr = m.address ? ` · ${m.address}` : "";
              const acta = m.actaUrl ? ` · <a href="${m.actaUrl}" target="_blank" rel="noreferrer">acta</a>` : "";
              return `<li>
                <strong>${when}</strong> — ${m.home} vs ${m.away}<br/>
                <small>${m.team}${addr}${acta}</small>
              </li>`;
            })
            .join("")}</ul>`
    }

    ${
      data.warnings.length
        ? `<p class="muted"><strong>Falten URLs FCF a:</strong><br/>
           <code>${data.warnings
             .filter((w) => w.startsWith("Falta URL FCF per:"))
             .map((w) => w.replace("Falta URL FCF per: ", ""))
             .join(", ")}</code></p>`
        : ""
    }
  </div>

  <script>
    const defaultLat = ${defaultLat};
    const defaultLon = ${defaultLon};
    const points = ${JSON.stringify(points)};

    const map = L.map('map').setView([defaultLat, defaultLon], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    const markers = [];
    for (const p of points) {
      const html = \`
        <div style="max-width:260px">
          <strong>\${p.title}</strong><br/>
          <small>\${p.subtitle}</small><br/>
          \${p.stadium ? "<div><small><b>Camp:</b> " + p.stadium + "</small></div>" : ""}
          \${p.address ? "<div><small><b>Adreça:</b> " + p.address + "</small></div>" : ""}
          \${p.actaUrl ? "<div style='margin-top:6px'><a href='" + p.actaUrl + "' target='_blank' rel='noreferrer'>Veure acta</a></div>" : ""}
        </div>\`;
      const mk = L.marker([p.lat, p.lon]).addTo(map).bindPopup(html);
      markers.push(mk);
    }

    if (markers.length > 0) {
      const group = L.featureGroup(markers);
      map.fitBounds(group.getBounds().pad(0.2));
    }
  </script>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`SPORTS RADAR (Mapa Futbol Osona) running on port ${PORT}`);
});

