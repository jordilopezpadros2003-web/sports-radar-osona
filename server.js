/**
 * SPORTS RADAR - Osona Weekend "Top Matches"
 * Run:
 *   npm init -y
 *   npm i express node-fetch@3 cheerio luxon
 *   node server.js
 * Open:
 *   http://localhost:3000
 *
 * Notes:
 * - Scrapes public pages:
 *   - FCF (AEC Manlleu) fixture list: https://www.fcf.cat/calendari-equip/...
 *   - CP Voltregà calendar: https://cpvoltrega.com/calendari/
 *   - CP Vic (attempt) via a public "next match" page: https://www.ceroacero.es/equipo/cp-vic
 */

import express from "express";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { DateTime } from "luxon";

const app = express();
const PORT = process.env.PORT || 3000;

// -------------------- Helpers --------------------
const TZ = "Europe/Madrid";

function getUpcomingWeekendRange(now = DateTime.now().setZone(TZ)) {
  // upcoming Saturday (or today if already Saturday), and Sunday end-of-day
  const weekday = now.weekday; // 1=Mon ... 7=Sun
  const daysUntilSat = (6 - weekday + 7) % 7; // 6=Sat
  const saturday = now.plus({ days: daysUntilSat }).startOf("day");
  const sunday = saturday.plus({ days: 1 }).endOf("day");
  return { saturday, sunday };
}

function normalizeSpaces(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function parseDMY(dateStr) {
  // accepts "18-01-2026" or "18/01" (assumes current year if missing)
  const cleaned = dateStr.replace(/\./g, "").trim();
  let dt = null;

  // dd-MM-yyyy
  dt = DateTime.fromFormat(cleaned, "dd-MM-yyyy", { zone: TZ });
  if (dt.isValid) return dt;

  // dd/MM/yyyy
  dt = DateTime.fromFormat(cleaned, "dd/LL/yyyy", { zone: TZ });
  if (dt.isValid) return dt;

  // dd/MM (assume current year)
  dt = DateTime.fromFormat(cleaned, "dd/LL", { zone: TZ });
  if (dt.isValid) return dt.set({ year: DateTime.now().setZone(TZ).year });

  return null;
}

function scoreImportance(m) {
  // crude ranking: OK Lliga (top), then senior semi-pro leagues, etc.
  const text = `${m.competition || ""} ${m.team || ""} ${m.home || ""} ${m.away || ""}`.toLowerCase();
  let score = 0;

  if (text.includes("ok lliga")) score += 90;
  if (text.includes("ok liga")) score += 90;
  if (text.includes("lliga elit")) score += 70;
  if (text.includes("3a rfef") || text.includes("2a rfef") || text.includes("1a rfef")) score += 80;
  if (text.includes("preferent") || text.includes("primera catalana")) score += 55;

  // “derby-ish” keywords
  const derbyTeams = ["vic", "manlleu", "voltregà", "tona", "taradell", "gurb", "roda", "centelles"];
  const derbyHits = derbyTeams.reduce((acc, t) => acc + (text.includes(t) ? 1 : 0), 0);
  score += Math.min(derbyHits * 5, 20);

  // home match gets a little boost (usually more “relevant” locally)
  if ((m.venue || "").toLowerCase().includes("osona")) score += 5;
  if ((m.location || "").toLowerCase().includes("osona")) score += 5;

  return score;
}

function withinWeekend(dt, weekend) {
  return dt && dt >= weekend.saturday && dt <= weekend.sunday;
}

// -------------------- Scrapers --------------------

// 1) FCF fixture page (AEC Manlleu example)
async function scrapeFCFTeamCalendar() {
  // Source found publicly: AEC Manlleu A (Lliga Elit, Grup 1)
  const url = "https://www.fcf.cat/calendari-equip/2526/futbol-11/lliga-elit/grup-1/manlleu-aec-a";
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`FCF fetch failed: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const matches = [];

  // FCF pages typically list fixtures in a table; we parse table rows heuristically.
  $("table tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 4) return;

    const dateText = normalizeSpaces($(tds[1]).text()); // usually date column
    const timeText = normalizeSpaces($(tds[2]).text()); // usually time
    const homeText = normalizeSpaces($(tds[3]).text());
    const awayText = normalizeSpaces($(tds[4]).text());

    const dt = parseDMY(dateText);
    if (!dt) return;

    let dateTime = dt;
    const time = DateTime.fromFormat(timeText, "HH:mm", { zone: TZ });
    if (time.isValid) {
      dateTime = dt.set({ hour: time.hour, minute: time.minute });
    }

    // If home/away missing due to layout, fallback to row text regex:
    let home = homeText;
    let away = awayText;
    if (!home || !away) {
      const rowText = normalizeSpaces($(tr).text());
      // Try: "VALLS U.E. A · MANLLEU, A.E.C. A"
      const parts = rowText.split("·").map(normalizeSpaces);
      if (parts.length >= 2) {
        home = home || parts[0];
        away = away || parts[1];
      }
    }

    if (!home || !away) return;

    matches.push({
      source: "FCF",
      sourceUrl: url,
      sport: "Futbol",
      competition: "FCF (lliga)",
      team: "AEC Manlleu (ref.)",
      datetimeISO: dateTime.toISO(),
      home,
      away,
      location: "Osona (poss.)",
    });
  });

  // FCF sometimes renders without a table in simple HTML blocks; add a fallback regex:
  if (matches.length === 0) {
    const text = normalizeSpaces($.text());
    // Example snippet: "18-01-2026, 16:30, VALLS U.E. A · MANLLEU, A.E.C. A"
    const re = /(\d{2}-\d{2}-\d{4})\s*,\s*(\d{2}:\d{2}).{0,40}?([A-ZÀ-Ü0-9 ,.'()-]+?)\s*·\s*([A-ZÀ-Ü0-9 ,.'()-]+)/g;
    let m;
    while ((m = re.exec(text))) {
      const dt = parseDMY(m[1]);
      const time = DateTime.fromFormat(m[2], "HH:mm", { zone: TZ });
      if (!dt || !time.isValid) continue;
      const dateTime = dt.set({ hour: time.hour, minute: time.minute });
      matches.push({
        source: "FCF",
        sourceUrl: url,
        sport: "Futbol",
        competition: "FCF (lliga)",
        team: "AEC Manlleu (ref.)",
        datetimeISO: dateTime.toISO(),
        home: normalizeSpaces(m[3]),
        away: normalizeSpaces(m[4]),
        location: "Osona (poss.)",
      });
    }
  }

  return matches;
}

// 2) CP Voltregà calendar (hoquei patins)
async function scrapeCPVoltregaCalendar() {
  const url = "https://cpvoltrega.com/calendari/";
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`CP Voltregà fetch failed: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);

  const matches = [];
  const text = normalizeSpaces($.text());

  // Their calendar lines resemble:
  // "MAS 17/01 20:00 CP Voltregà Movento Stern - Pons Lleida OK Lliga masculina"
  const re = /(MAS|FEM)\s+(\d{2}\/\d{2})\s+(\d{2}:\d{2})\s+(.+?)\s+-\s+(.+?)\s+(OK Lliga[^A-Z]*|OK Lliga.*?)(?=(MAS|FEM)\s+\d{2}\/\d{2}|\s*$)/g;
  let m;
  while ((m = re.exec(text))) {
    const gender = m[1] === "FEM" ? "Femení" : "Masculí";
    const dt = parseDMY(m[2]);
    const time = DateTime.fromFormat(m[3], "HH:mm", { zone: TZ });
    if (!dt || !time.isValid) continue;
    const dateTime = dt.set({ hour: time.hour, minute: time.minute });

    matches.push({
      source: "cpvoltrega.com",
      sourceUrl: url,
      sport: "Hoquei patins",
      competition: normalizeSpaces(m[6]),
      team: `CP Voltregà (${gender})`,
      datetimeISO: dateTime.toISO(),
      home: normalizeSpaces(m[4]),
      away: normalizeSpaces(m[5]),
      location: "Sant Hipòlit de Voltregà (Osona)",
    });
  }

  return matches;
}

// 3) CP Vic (attempt): pull “next match” from a public page
async function scrapeCPVicNextMatch() {
  const url = "https://www.ceroacero.es/equipo/cp-vic";
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`CP Vic fetch failed: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const text = normalizeSpaces($.text());

  // Example on that page often includes something like:
  // "El próximo juego ... es sábado, 17 de enero de 2026 (19:30), entre CH Lloret y CP Vic, juego para OK Liga"
  const re = /(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4}).{0,40}\((\d{2}:\d{2})\).{0,80}entre\s+(.+?)\s+y\s+(.+?),.{0,80}(OK\s*Liga|OK\s*Lliga)/i;
  const m = text.match(re);
  if (!m) return [];

  const day = String(m[1]).padStart(2, "0");
  const monthName = m[2].toLowerCase();
  const year = Number(m[3]);
  const timeStr = m[4];
  const home = normalizeSpaces(m[5]);
  const away = normalizeSpaces(m[6]);
  const comp = normalizeSpaces(m[7]);

  const monthMap = {
    enero: 1, feb: 2, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
    julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
    gener: 1, febrer: 2, març: 3, abril: 4, maig: 5, juny: 6, juliol: 7, agost: 8,
  };
  const month = monthMap[monthName];
  if (!month) return [];

  const date = DateTime.fromObject({ year, month, day: Number(day) }, { zone: TZ });
  const time = DateTime.fromFormat(timeStr, "HH:mm", { zone: TZ });
  if (!date.isValid || !time.isValid) return [];

  const dateTime = date.set({ hour: time.hour, minute: time.minute });

  return [{
    source: "ceroacero.es",
    sourceUrl: url,
    sport: "Hoquei patins",
    competition: comp,
    team: "CP Vic",
    datetimeISO: dateTime.toISO(),
    home,
    away,
    location: "Osona / fora (segons rival)",
  }];
}

// -------------------- Aggregation --------------------
async function getWeekendTopMatches() {
  const weekend = getUpcomingWeekendRange();

  const tasks = [
    scrapeFCFTeamCalendar(),
    scrapeCPVoltregaCalendar(),
    scrapeCPVicNextMatch(),
  ];

  const results = await Promise.allSettled(tasks);

  const all = [];
  const errors = [];

  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
    else errors.push(r.reason?.message || String(r.reason));
  }

  // Filter weekend
  const weekendMatches = all
    .map(m => {
      const dt = DateTime.fromISO(m.datetimeISO, { zone: TZ });
      return { ...m, dtObj: dt };
    })
    .filter(m => withinWeekend(m.dtObj, weekend))
    .map(m => {
      const importance = scoreImportance(m);
      return { ...m, importance };
    })
    .sort((a, b) => b.importance - a.importance || a.dtObj.toMillis() - b.dtObj.toMillis())
    .slice(0, 12)
    .map(m => ({
      ...m,
      datetimeLocal: m.dtObj.toFormat("cccc dd/LL/yyyy HH:mm"),
      dtObj: undefined,
    }));

  return {
    weekend: {
      from: weekend.saturday.toISO(),
      to: weekend.sunday.toISO(),
      label: `${weekend.saturday.toFormat("dd/LL/yyyy")} – ${weekend.sunday.toFormat("dd/LL/yyyy")}`,
    },
    matches: weekendMatches,
    meta: { totalScraped: all.length, errors },
  };
}

// -------------------- Routes --------------------
app.get("/api/weekend", async (_req, res) => {
  try {
    const data = await getWeekendTopMatches();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

app.get("/", (_req, res) => {
  res.type("html").send(`
<!doctype html>
<html lang="ca">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>SPORTS RADAR — Osona (cap de setmana)</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;margin:0;background:#0b0e14;color:#e8eefc}
    header{padding:18px 18px 10px;border-bottom:1px solid rgba(255,255,255,.08);background:#0b0e14;position:sticky;top:0}
    h1{margin:0;font-size:18px}
    .sub{opacity:.75;font-size:13px;margin-top:6px}
    main{padding:18px;max-width:980px;margin:0 auto}
    button{background:#2a6cff;color:white;border:0;padding:10px 12px;border-radius:10px;cursor:pointer;font-weight:600}
    button:disabled{opacity:.5;cursor:not-allowed}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-top:14px}
    .card{background:#111827;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:12px}
    .topline{display:flex;justify-content:space-between;gap:10px;margin-bottom:8px}
    .badge{font-size:12px;padding:4px 8px;border-radius:999px;background:rgba(42,108,255,.18);border:1px solid rgba(42,108,255,.35)}
    .muted{opacity:.75}
    a{color:#8ab4ff;text-decoration:none}
    a:hover{text-decoration:underline}
    .err{margin-top:12px;padding:10px 12px;border:1px solid rgba(255,90,90,.35);background:rgba(255,90,90,.10);border-radius:12px}
    .footer{opacity:.6;margin-top:16px;font-size:12px}
  </style>
</head>
<body>
  <header>
    <h1>SPORTS RADAR · Partits més importants a Osona (cap de setmana)</h1>
    <div class="sub" id="range">Carregant rang…</div>
  </header>

  <main>
    <button id="btn">Buscar partits del cap de setmana</button>
    <div class="grid" id="grid"></div>
    <div id="errors"></div>
    <div class="footer">Fonts: FCF (calendari equip), CP Voltregà (calendari), CP Vic (proper partit). Si alguna font canvia el format, pot fallar temporalment.</div>
  </main>

<script>
  const btn = document.getElementById("btn");
  const grid = document.getElementById("grid");
  const range = document.getElementById("range");
  const errorsBox = document.getElementById("errors");

  function esc(s){ return (s||"").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function card(m){
    return \`
      <div class="card">
        <div class="topline">
          <div class="badge">\${esc(m.sport)} · \${esc(m.competition || "Competicio")}</div>
          <div class="muted">Score: \${Math.round(m.importance)}</div>
        </div>
        <div style="font-weight:800;font-size:15px;line-height:1.2">\${esc(m.home)}<br/>vs<br/>\${esc(m.away)}</div>
        <div class="muted" style="margin-top:8px">\${esc(m.datetimeLocal)}</div>
        <div class="muted">\${esc(m.location || "")}</div>
        <div style="margin-top:10px"><a href="\${esc(m.sourceUrl)}" target="_blank" rel="noreferrer">Veure font (\${esc(m.source)})</a></div>
      </div>
    \`;
  }

  async function load(){
    btn.disabled = true;
    btn.textContent = "Buscant…";
    grid.innerHTML = "";
    errorsBox.innerHTML = "";
    try{
      const r = await fetch("/api/weekend");
      const data = await r.json();
      range.textContent = "Rang: " + data.weekend.label;

      if(!data.matches || data.matches.length === 0){
        grid.innerHTML = '<div class="card"><b>No he trobat partits al rang.</b><div class="muted">Pot ser que les fonts no tinguin jornada o el format hagi canviat.</div></div>';
      } else {
        grid.innerHTML = data.matches.map(card).join("");
      }

      if(data.meta && data.meta.errors && data.meta.errors.length){
        errorsBox.innerHTML = '<div class="err"><b>Algunes fonts han fallat:</b><div class="muted" style="margin-top:6px">' +
          data.meta.errors.map(e => esc(e)).join("<br/>") +
          '</div></div>';
      }
    }catch(e){
      errorsBox.innerHTML = '<div class="err"><b>Error:</b> ' + esc(e.message || String(e)) + '</div>';
    }finally{
      btn.disabled = false;
      btn.textContent = "Buscar partits del cap de setmana";
    }
  }

  btn.addEventListener("click", load);
  load();
</script>
</body>
</html>
  `);
});

app.listen(PORT, () => {
  console.log(`SPORTS RADAR running on http://localhost:${PORT}`);
});
