import fs from "fs/promises";
import path from "path";
import * as cheerio from "cheerio";

const OUTPUT_FILE = path.join(process.cwd(), "data", "osona_matches.json");

// Afegeix aquí més pàgines d'Osona que vulguis rastrejar.
// He posat algunes URLs públiques que mostren partits d'Osona.
const FCF_URLS = [
  "https://www.fcf.cat/resultats/2526/futbol-11/torneig-infantil-segona-divisio-s14/osona-1",
  "https://www.fcf.cat/resultats/2526/futbol-11/torneig-infantil-segona-divisio-s14/osona-2",
  "https://www.fcf.cat/resultats/2526/futbol-11/torneig-cadet-segona-divisio-s16/osona-1",
  "https://www.fcf.cat/resultats/2526/futbol-11/torneig-cadet-segona-divisio-s16/osona-2",
  "https://www.fcf.cat/resultats/2526/futbol-11/torneig-cadet-segona-divisio-s16/osona-3",
  "https://www.fcf.cat/resultats/2526/futbol-11/torneig-infantil-segona-divisio-s13/osona-1",
  "https://www.fcf.cat/resultats/2526/futbol-11/torneig-infantil-segona-divisio-s13/osona-2"
];

function getWeekendRangeEuropeMadrid() {
  const now = new Date();
  const madridNow = new Date(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Madrid",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).format(now).replace(",", "")
  );

  const jsDay = madridNow.getDay(); // 0 dg, 6 ds
  const diffToSaturday = jsDay === 6 ? 0 : jsDay === 0 ? -1 : 6 - jsDay;

  const saturday = new Date(madridNow);
  saturday.setDate(madridNow.getDate() + diffToSaturday);
  saturday.setHours(0, 0, 0, 0);

  const sunday = new Date(saturday);
  sunday.setDate(saturday.getDate() + 1);
  sunday.setHours(23, 59, 59, 999);

  return { saturday, sunday };
}

function parseDateDMYHM(text) {
  const m = text.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})/);
  if (!m) return null;

  const [, dd, mm, yyyy, hh, min] = m;
  return new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:00`);
}

function isWeekendMatch(date, range) {
  return date && date >= range.saturday && date <= range.sunday;
}

function decodeGoogleCoords(href) {
  if (!href) return null;

  const decoded = decodeURIComponent(href);
  const m = decoded.match(/loc:([0-9.\-]+)\+([0-9.\-]+)/i);
  if (!m) return null;

  return {
    lat: Number(m[1]),
    lng: Number(m[2])
  };
}

function cleanText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function extractCompetition($) {
  const title = cleanText($("title").text() || "");
  return title || "FCF Osona";
}

function extractMatchesFromHtml(html, sourceUrl) {
  const $ = cheerio.load(html);
  const competition = extractCompetition($);
  const matches = [];

  // Intent 1: aprofitar els links "Ruta"
  $("a").each((_, a) => {
    const linkText = cleanText($(a).text());
    const href = $(a).attr("href") || "";

    if (!/ruta/i.test(linkText) || !href.includes("maps.google.com")) return;

    const coords = decodeGoogleCoords(href);
    if (!coords) return;

    // Busquem text proper dins del contenidor
    const container =
      $(a).closest("li, tr, .row, .col, .partit, .match, .content, .resultat, .jornada, div");

    const raw = cleanText(container.text());

    // Patró aproximat:
    // HOME 11-04-2026 11:00 AWAY CAMP DE FUTBOL ...
    const m = raw.match(
      /(.+?)\s+(\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2})\s+(.+?)\s+(CAMP DE FUTBOL.+?)(?:\s+[A-ZÀ-Ü][A-ZÀ-Ü ,.'()\-]{3,}|$)/i
    );

    if (!m) return;

    const home = cleanText(m[1]);
    const dateText = cleanText(m[2]);
    const away = cleanText(m[3]);
    const venue = cleanText(m[4]);
    const kickoff = parseDateDMYHM(dateText);

    matches.push({
      source: "FCF",
      sourceUrl,
      competition,
      homeTeam: home,
      awayTeam: away,
      kickoffText: dateText,
      kickoffIso: kickoff ? kickoff.toISOString() : null,
      venue,
      lat: coords.lat,
      lng: coords.lng
    });
  });

  return matches;
}

function dedupe(matches) {
  const seen = new Set();
  return matches.filter((m) => {
    const key = [
      m.homeTeam,
      m.awayTeam,
      m.kickoffText,
      m.venue,
      m.lat,
      m.lng
    ].join("|");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 SportsRadarBot/1.0",
      "Accept-Language": "ca-ES,ca;q=0.9,es;q=0.8,en;q=0.7"
    }
  });

  if (!res.ok) {
    throw new Error(`Error ${res.status} a ${url}`);
  }

  return res.text();
}

async function main() {
  const weekend = getWeekendRangeEuropeMadrid();
  const allMatches = [];
  const errors = [];

  for (const url of FCF_URLS) {
    try {
      const html = await fetchHtml(url);
      const matches = extractMatchesFromHtml(html, url);
      allMatches.push(...matches);
    } catch (err) {
      errors.push({ url, error: err.message });
    }
  }

  const filtered = dedupe(allMatches).filter((m) =>
    isWeekendMatch(parseDateDMYHM(m.kickoffText), weekend)
  );

  const output = {
    updatedAt: new Date().toISOString(),
    region: "Osona",
    source: "FCF",
    total: filtered.length,
    matches: filtered.sort((a, b) => (a.kickoffIso || "").localeCompare(b.kickoffIso || "")),
    errors
  };

  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf-8");

  console.log(`Guardats ${filtered.length} partits a ${OUTPUT_FILE}`);
  if (errors.length) {
    console.log("Errors trobats:", errors);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
