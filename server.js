import express from "express";
import * as cheerio from "cheerio";
import { DateTime } from "luxon";

const app = express();
const PORT = process.env.PORT || 3000;

const TZ = "Europe/Madrid";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

/**
 * ⚽ FUTBOL OSONA — Llista d’equips (fins a 4a Catalana)
 *
 * IMPORTANT:
 * - Si vols el 100% exacte "tots els equips d’Osona", afegeix aquí qualsevol club/equip que falti.
 * - Els links han de ser del tipus: https://www.fcf.cat/calendari-equip/....
 */
const TEAMS = [
  // --- NIVELLS ALTS (Osona) ---
  {
    team: "Vic UE Club A",
    level: "Tercera Federación",
    url: "https://www.fcf.cat/calendari-equip/2526/futbol-11/tercera-federacio/grup-v/vic-unio-esportiva-club-a",
  },
  {
    team: "Manlleu AEC A",
    level: "Lliga Elit",
    url: "https://www.fcf.cat/calendari-equip/2526/futbol-11/lliga-elit/grup-1/manlleu-aec-a",
  },
  {
    team: "Torelló CF A",
    level: "Segona Catalana",
    url: "https://www.fcf.cat/calendari-equip/2526/futbol-11/segona-catalana/grup-2/torello-cf-a",
  },
  {
    team: "Sant Julià de Vilatorta CF A",
    level: "Segona Catalana",
    url: "https://www.fcf.cat/calendari-equip/2526/futbol11/segona-catalana/grup-2/sant-julia-de-vilatorta-cf-a",
  },
  {
    team: "Vic Riuprimer Refo FC A",
    level: "Segona Catalana",
    url: "https://www.fcf.cat/calendari-equip/2526/futbol-11/segona-catalana/grup-2/vic-riuprimer-refo-futbol-club-a",
  },

  // --- TERCERA CATALANA (Grup amb molts equips d’Osona) ---
  {
    team: "Seva UE A",
    level: "Tercera Catalana",
    url: "https://www.fcf.cat/calendari-equip/2526/futbol-11/tercera-catalana/grup-4/seva-ue-a",
  },
  {
    team: "Gurb UE A",
    level: "Tercera Catalana",
    url: "https://www.fcf.cat/calendari-equip/2526/tercera-catalana/tercera-catalana/grup-4/gurb-ue-a",
  },
  {
    team: "Taradell UD A",
    level: "Tercera Catalana",
    url: "https://www.fcf.cat/calendari-equip/2526/futbol11/tercera-catalana/grup-4/taradell-ud-a",
  },
  {
    team: "Voltregà CF A",
    level: "Tercera Catalana",
    url: "https://www.fcf.cat/calendari-equip/2526/futbol-11/tercera-catalana/grup-4/voltrega-cf-a",
  },
  {
    team: "Folgueroles CF A",
    level: "Tercera Catalana",
    url: "https://www.fcf.cat/calendari-equip/2526/futbol-11/tercera-catalana/grup-4/folgueroles-cf-a",
  },
  {
    team: "Pradenc FC A",
    level: "Tercera Catalana",
    url: "https://www.fcf.cat/calendari-equip/2526/futbol-11/tercera-catalana/grup-4/pradenc-fc-a",
  },

  // --- QUARTA CATALANA (Osona) ---
  {
    team: "Centelles UE A",
    level: "Quarta Catalana",
    url: "https://www.fcf.cat/calendari-equip/2526/futbol-11/quarta-catalana/grup-8/centelles-ue-a",
  },

  /**
   * NOTA:
   * Roda de Ter A el tinc amb temporada 24/25 (si vols, em passes el link 25/26 i el canviem):
   */
  {
    team: "Roda de Ter CE A",
    level: "Quarta Catalana (revisar URL 25/26)",
    url: "https://www.fcf.cat/calendari-equip/2425/futbol-11/quarta-catalana/grup-6/roda-de-ter-ce-a",
  },
];

// -------------------- Helpers --------------------
function normalizeSpaces(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function parseDMY(dateText) {
  // Accepta: "20-09-2025" o "20/09/2025"
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
  const now = DateTime.now().setZone(TZ);
  const base = now.plus({ weeks: offsetWeeks });

  // proper dissabte i diumenge respecte base
  const weekday = base.weekday; // 1..7 (dl..dg)
  const daysToSat = (6 - weekday + 7) % 7;
  const sat = base.plus({ days: daysToSat }).startOf("day");
  const sun = sat.plus({ days: 1 }).endOf("day");

  return { sat, sun };
}

function inWeekend(dtISO, offsetWeeks = 0) {
  const dt = DateTime.fromISO(dtISO, { zone: TZ });
  if (!dt.isValid) return false;
  const { sat, sun } = getWeekendRange(offsetWeeks);
  return dt >= sat && dt <= sun;
}

function dedupeMatches(matches) {
  const seen = new Set();
  const out = [];
  for (const m of matches) {
    const key = [
      m.datetimeISO || "",
      (m.home || "").toLowerCase(),
      (m.away || "").toLowerCase(),
      (m.sourceUrl || "").toLowerCase(),
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

// -------------------- Scraper FCF (multi-team) --------------------
async function scrapeFCFTeamCalendar({ team, level, url }) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
    });
    if (!res.ok) return [];

    const html = await res.text();
    const $ = cheerio.load(html);

    const matches = [];

    // FCF sol tenir una taula amb files tr i cel·les td:
    // Jornada | Data | Hora | Equip casa | Equip fora | Resultat
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

      matches.push({
        sport: "Futbol",
        team,
        level,
        source: "FCF",
        sourceUrl: url,
        datetimeISO: dt.toISO(),
        home: homeText,
        away: awayText,
        location: "Osona (equips seleccionats)",
      });
    });

    return matches;
  } catch (e) {
    return [];
  }
}

async function getWeekendFootballOsona(offsetWeeks = 0) {
  const all = [];

  for (const t of TEAMS) {
    const ms = await scrapeFCFTeamCalendar(t);
    all.push(...ms);
  }

  const weekend = all
    .filter((m) => m.sport === "Futbol")
    .filter((m) => inWeekend(m.datetimeISO, offsetWeeks));

  const clean = dedupeMatches(weekend).sort((a, b) => {
    const da = DateTime.fromISO(a.datetimeISO, { zone: TZ }).toMillis();
    const db = DateTime.fromISO(b.datetimeISO, { zone: TZ }).toMillis();
    return da - db;
  });

  return clean;
}

// -------------------- Routes --------------------
app.get("/api/weekend", async (req, res) => {
  const offset = Number(req.query.offset || 0); // 0 = aquest cap de setmana, 1 = setmana que ve
  const offsetWeeks = Number.isFinite(offset) ? offset : 0;

  const matches = await getWeekendFootballOsona(offsetWeeks);

  const { sat, sun } = getWeekendRange(offsetWeeks);
  res.json({
    ok: true,
    timezone: TZ,
    weekend: {
      from: sat.toISODate(),
      to: sun.toISODate(),
      offsetWeeks,
    },
    count: matches.length,
    matches,
  });
});

app.get("/", async (req, res) => {
  const offsetWeeks = 0;
  const { sat, sun } = getWeekendRange(offsetWeeks);

  const matches = await getWeekendFootballOsona(offsetWeeks);

  const rows =
    matches.length === 0
      ? `<p>No he trobat partits pels equips configurats aquest cap de setmana.</p>`
      : `<ul>
          ${matches
            .map((m) => {
              const dt = DateTime.fromISO(m.datetimeISO, { zone: TZ });
              const when = dt.isValid
                ? dt.toFormat("ccc dd/LL HH:mm")
                : m.datetimeISO;
              return `<li>
                <strong>${when}</strong> — ${m.home} vs ${m.away}
                <br/>
                <small>${m.team} · ${m.level} · <a href="${m.sourceUrl}" target="_blank" rel="noreferrer">FCF</a></small>
              </li>`;
            })
            .join("")}
        </ul>`;

  res.send(`<!doctype html>
<html lang="ca">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>SPORTS RADAR — Futbol Osona</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:900px;margin:40px auto;padding:0 16px;line-height:1.4}
    h1{margin:0 0 6px}
    .muted{color:#666}
    li{margin:12px 0}
    a{color:inherit}
    code{background:#f3f3f3;padding:2px 6px;border-radius:6px}
    .box{border:1px solid #eee;border-radius:14px;padding:14px 16px;margin:14px 0}
    .btn{display:inline-block;padding:10px 12px;border-radius:10px;border:1px solid #ddd;text-decoration:none}
  </style>
</head>
<body>
  <h1>⚽ SPORTS RADAR — Futbol Osona</h1>
  <p class="muted">Partits del cap de setmana: <strong>${sat.toISODate()}</strong> → <strong>${sun.toISODate()}</strong></p>

  <div class="box">
    <a class="btn" href="/api/weekend" target="_blank" rel="noreferrer">Veure JSON (API)</a>
    <a class="btn" href="/api/weekend?offset=1" target="_blank" rel="noreferrer">JSON setmana que ve</a>
  </div>

  <h2>Partits</h2>
  ${rows}

  <hr/>
  <p class="muted">
    Configuració equips: <code>${TEAMS.length}</code> URLs FCF.
    Si vols afegir algun equip d’Osona que falti, afegeix-lo a <code>TEAMS</code> i fes commit.
  </p>
</body>
</html>`);
});

// -------------------- Start --------------------
app.listen(PORT, () => {
  console.log(`SPORTS RADAR (Futbol Osona) running on port ${PORT}`);
});
