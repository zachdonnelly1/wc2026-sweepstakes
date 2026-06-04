// football-data.org client
// On the live site, reads from data/matches.json (updated by GitHub Actions every 5 min).
// Falls back to direct API call (works locally; blocked by CORS on live domains).

const API = {
  async fetchMatches(forceRefresh = false) {
    const cacheKey = 'wc2026_matches_v3';
    const cached = localStorage.getItem(cacheKey);

    if (!forceRefresh && cached) {
      try {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CONFIG.CACHE_TTL_MS) return data;
      } catch (_) { /* corrupt cache */ }
    }

    // Primary: read the pre-built file committed by GitHub Actions
    try {
      const res = await fetch(`data/matches.json?_=${Date.now()}`);
      if (res.ok) {
        const json = await res.json();
        const matches = json.matches || [];
        if (matches.length > 0) {
          localStorage.setItem(cacheKey, JSON.stringify({ data: matches, timestamp: Date.now() }));
          return matches;
        }
      }
    } catch (_) { /* file not yet committed or local dev */ }

    // Fallback: direct API call (works locally, CORS-blocked on live site)
    try {
      const res = await fetch(
        `${CONFIG.FOOTBALL_API_BASE}/competitions/${CONFIG.WC_COMPETITION_ID}/matches`,
        { headers: { 'X-Auth-Token': CONFIG.FOOTBALL_API_TOKEN } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const matches = json.matches || [];
      localStorage.setItem(cacheKey, JSON.stringify({ data: matches, timestamp: Date.now() }));
      return matches;
    } catch (err) {
      console.warn('API fetch failed:', err.message);
      if (cached) {
        try { return JSON.parse(cached).data; } catch (_) {}
      }
      return [];
    }
  },

  isLiveOrImminent(matches) {
    const now = Date.now();
    return matches.some(m => {
      if (m.status === 'IN_PLAY' || m.status === 'PAUSED') return true;
      const kick = new Date(m.utcDate).getTime();
      return Math.abs(now - kick) < 2 * 60 * 60 * 1000;
    });
  },

  cacheAge() {
    const cached = localStorage.getItem('wc2026_matches_v3');
    if (!cached) return null;
    try {
      const { timestamp } = JSON.parse(cached);
      return Math.round((Date.now() - timestamp) / 1000);
    } catch (_) { return null; }
  },
};
