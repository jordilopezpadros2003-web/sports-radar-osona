import express from "express";
import { DateTime } from "luxon";

const app = express();
const PORT = process.env.PORT || 3000;
const TZ = "Europe/Madrid";

async function getAllMatches() {
  return [
    {
      date: "2026-04-11T16:00:00.000+02:00",
      dayKey: "2026-04-11",
      dateStr: "11/04/2026",
      time: "16:00",
      home: "Vic",
      away: "Manlleu",
      location: "Vic",
      lat: 41.9304,
      lon: 2.2546,
      actaUrl: ""
    },
    {
      date: "2026-04-12T17:00:00.000+02:00",
      dayKey: "2026-04-12",
      dateStr: "12/04/2026",
      time: "17:00",
      home: "UE Tona",
      away: "UD Taradell",
      location: "Tona",
      lat: 41.8467,
      lon: 2.2275,
      actaUrl: ""
    },
    {
      date: "2026-04-13T18:30:00.000+02:00",
      dayKey: "2026-04-13",
      dateStr: "13/04/2026",
      time: "18:30",
      home: "Manlleu",
      away: "UE Gurb",
      location: "Manlleu",
      lat: 42.0026,
      lon: 2.2846,
      actaUrl: ""
    },
    {
      date: "2026-04-14T19:00:00.000+02:00",
      dayKey: "2026-04-14",
      dateStr: "14/04/2026",
      time: "19:00",
      home: "CF Torelló",
      away: "CE Roda de Ter",
      location: "Torelló",
      lat: 42.0485,
      lon: 2.2627,
      actaUrl: ""
    },
    {
      date: "2026-04-15T18:00:00.000+02:00",
      dayKey: "2026-04-15",
      dateStr: "15/04/2026",
      time: "18:00",
      home: "CF Folgueroles",
      away: "JE Santa Eugènia",
      location: "Folgueroles",
      lat: 41.9389,
      lon: 2.3181,
      actaUrl: ""
    }
  ];
}

app.get("/", async (req, res) => {
  try {
    const matches = await getAllMatches();

    const totalMatches = matches.length;
    const uniqueLocations = new Set(matches.map((m) => m.location)).size;
    const dateRange =
      matches.length > 0
        ? `${matches[0].dateStr} - ${matches[matches.length - 1].dateStr}`
        : "N/A";

    const html = `<!DOCTYPE html>
<html lang="ca">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sports Radar Osona - Calendari de Partits</title>

  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.1/MarkerCluster.min.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.1/MarkerCluster.Default.min.css">

  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      height: 100%;
      font-family: 'Inter', sans-serif;
      background-color: #f5f7fa;
      color: #1a1a2e;
    }
    body { overflow-x: hidden; }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 16px;
    }
    .header {
      background: linear-gradient(135deg, #1A73E8 0%, #1e5bad 100%);
      color: white;
      padding: 40px 0;
      box-shadow: 0 4px 12px rgba(26, 115, 232, 0.15);
      margin-bottom: 32px;
    }
    .header h1 {
      font-size: 2.5rem;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .header p {
      font-size: 1rem;
      opacity: 0.95;
      font-weight: 300;
    }
    .stats-bar {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .stat-card {
      background: white;
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
      border-left: 4px solid #1A73E8;
    }
    .stat-card .label {
      font-size: 0.85rem;
      color: #6b7280;
      font-weight: 500;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .stat-card .value {
      font-size: 2rem;
      font-weight: 700;
      color: #1A73E8;
    }
    .filter-bar {
      background: white;
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
      margin-bottom: 32px;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
    }
    .filter-buttons {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .filter-btn {
      padding: 10px 20px;
      border: 2px solid #e5e7eb;
      background: white;
      color: #4b5563;
      border-radius: 24px;
      cursor: pointer;
      font-size: 0.95rem;
      font-weight: 500;
    }
    .filter-btn.active {
      background: #1A73E8;
      color: white;
      border-color: #1A73E8;
    }
    .search-container {
      flex: 1;
      min-width: 250px;
    }
    .search-input {
      width: 100%;
      padding: 10px 16px;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      font-size: 0.95rem;
    }
    .map-section {
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
      margin-bottom: 32px;
    }
    #map {
      height: 600px;
      width: 100%;
    }
    .match-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
    }
    .match-card {
      background: white;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
      border-top: 4px solid #1A73E8;
    }
    .match-time {
      font-size: 0.85rem;
      color: #6b7280;
      font-weight: 600;
      margin-bottom: 12px;
    }
    .match-teams {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    .team-name {
      font-size: 1.1rem;
      font-weight: 600;
      color: #1a1a2e;
      flex: 1;
    }
    .vs-badge {
      background: #e5e7eb;
      color: #4b5563;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .match-details {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 16px;
      padding-bottom: 16px;
      border-bottom: 1px solid #e5e7eb;
    }
    .detail-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-size: 0.95rem;
      color: #4b5563;
    }
    .acta-link {
      display: inline-block;
      padding: 10px 16px;
      background: #2ECC71;
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 500;
      font-size: 0.9rem;
      text-align: center;
    }
    .acta-link.disabled {
      background: #ccc;
      cursor: not-allowed;
      pointer-events: none;
    }
    .footer {
      background: #1a1a2e;
      color: white;
      text-align: center;
      padding: 32px 0;
      margin-top: 48px;
      font-size: 0.9rem;
      opacity: 0.9;
    }
    .popup-title {
      font-weight: 600;
      color: #1a1a2e;
      margin-bottom: 8px;
    }
    .popup-detail {
      color: #6b7280;
      margin: 4px 0;
      font-size: 0.85rem;
    }
    .no-results {
      grid-column: 1 / -1;
      text-align: center;
      padding: 40px;
      color: #6b7280;
    }
    @media (max-width: 768px) {
      .header h1 { font-size: 1.8rem; }
      .filter-bar {
        flex-direction: column;
        align-items: stretch;
      }
      .search-container {
        width: 100%;
        min-width: auto;
      }
      .match-list {
        grid-template-columns: 1fr;
      }
      #map { height: 400px; }
      .stats-bar { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="container">
      <h1>⚽ Sports Radar</h1>
      <p>Calendari de partits de futbol de la comarca d'Osona</p>
    </div>
  </div>

  <div class="container">
    <div class="stats-bar">
      <div class="stat-card">
        <div class="label">Partits Totals</div>
        <div class="value">${totalMatches}</div>
      </div>
      <div class="stat-card">
        <div class="label">Municipis</div>
        <div class="value">${uniqueLocations}</div>
      </div>
      <div class="stat-card">
        <div class="label">Període</div>
        <div class="value" style="font-size: 1rem;">${dateRange}</div>
      </div>
    </div>

    <div class="filter-bar">
      <div class="filter-buttons">
        <button class="filter-btn active" data-filter="all">Tots els partits</button>
        <button class="filter-btn" data-filter="today">Avui</button>
        <button class="filter-btn" data-filter="tomorrow">Demà</button>
      </div>
      <div class="search-container">
        <input
          type="text"
          class="search-input"
          id="searchInput"
          placeholder="Busca per equip o localitat..."
        >
      </div>
    </div>

    <div class="map-section">
      <div id="map"></div>
    </div>

    <div class="match-list" id="matchList"></div>
  </div>

  <div class="footer">
    <div class="container">
      <p>Sports Radar © 2026 — Prototip TFG</p>
    </div>
  </div>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.1/leaflet.markercluster.min.js"></script>

  <script>
    const matches = ${JSON.stringify(matches)};

    const map = L.map('map').setView([41.95, 2.25], 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    const markerClusterGroup = L.markerClusterGroup({
      maxClusterRadius: 50
    });

    matches.forEach(m => {
      const marker = L.marker([m.lat, m.lon]);

      const popupContent = \`
        <div style="font-family: 'Inter', sans-serif;">
          <div class="popup-title">\${m.home} vs \${m.away}</div>
          <div class="popup-detail">📅 \${m.dateStr}</div>
          <div class="popup-detail">🕐 \${m.time}</div>
          <div class="popup-detail">📍 \${m.location}</div>
          \${m.actaUrl ? \`<div class="popup-detail"><a href="\${m.actaUrl}" target="_blank" style="color: #2ECC71; text-decoration: none;">Ver acta</a></div>\` : ''}
        </div>
      \`;

      marker.bindPopup(popupContent);
      markerClusterGroup.addLayer(marker);
    });

    map.addLayer(markerClusterGroup);

    const filterState = {
      current: 'all',
      search: ''
    };

    function getTodayKey() {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return \`\${year}-\${month}-\${day}\`;
    }

    function getTomorrowKey() {
      const now = new Date();
      now.setDate(now.getDate() + 1);
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return \`\${year}-\${month}-\${day}\`;
    }

    function matchesFilter(match) {
      const todayKey = getTodayKey();
      const tomorrowKey = getTomorrowKey();

      if (filterState.current === 'today' && match.dayKey !== todayKey) return false;
      if (filterState.current === 'tomorrow' && match.dayKey !== tomorrowKey) return false;

      if (filterState.search) {
        const query = filterState.search.toLowerCase();
        const ok =
          match.home.toLowerCase().includes(query) ||
          match.away.toLowerCase().includes(query) ||
          match.location.toLowerCase().includes(query);

        if (!ok) return false;
      }

      return true;
    }

    function renderMatches() {
      const matchList = document.getElementById('matchList');
      const filtered = matches.filter(matchesFilter);

      matchList.innerHTML = filtered.length === 0
        ? '<div class="no-results"><p>No es troben partits que coincideixin amb els filtres seleccionats.</p></div>'
        : filtered.map(m => \`
          <div class="match-card">
            <div class="match-time">\${new Date(m.date).toLocaleDateString('ca-ES', { weekday: 'long', month: 'short', day: 'numeric' })} • \${m.time}</div>
            <div class="match-teams">
              <span class="team-name">\${m.home}</span>
              <span class="vs-badge">VS</span>
              <span class="team-name">\${m.away}</span>
            </div>
            <div class="match-details">
              <div class="detail-item"><span>🕐 \${m.time}</span></div>
              <div class="detail-item"><span>📍 \${m.location}</span></div>
            </div>
            \${m.actaUrl
              ? \`<a href="\${m.actaUrl}" target="_blank" class="acta-link">Ver acta completa</a>\`
              : '<a class="acta-link disabled">Acta no disponible</a>'}
          </div>
        \`).join('');
    }

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        filterState.current = e.target.dataset.filter;
        renderMatches();
      });
    });

    document.getElementById('searchInput').addEventListener('input', (e) => {
      filterState.search = e.target.value;
      renderMatches();
    });

    renderMatches();
  </script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (error) {
    console.error("Error rendering page:", error);
    res.status(500).send("<h1>Error loading page</h1><p>" + error.message + "</p>");
  }
});

app.get("/api/debug", async (req, res) => {
  try {
    const matches = await getAllMatches();
    res.json({
      ok: true,
      total: matches.length,
      sample: matches.slice(0, 10)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    app: "Sports Radar",
    time: DateTime.now().setZone(TZ).toISO()
  });
});

app.listen(PORT, () => {
  console.log(`Sports Radar running at http://localhost:${PORT}`);
});
