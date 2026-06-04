// football-data.org API client with localStorage caching

const API = {
  async fetchMatches(forceRefresh = false) {
    const cacheKey = 'wc2026_matches_v2';
    const cached = localStorage.getItem(cacheKey);

    if (!forceRefresh && cached) {
      try {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CONFIG.CACHE_TTL_MS) {
          return data;
        }
      } catch (_) { /* bad cache, ignore */ }
    }

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
      console.warn('API fetch failed, using cache:', err.message);
      if (cached) {
        return JSON.parse(cached).data;
      }
      return [];
    }
  },

  // Returns true if any match is currently live or within 2 hours of kick-off
  isLiveOrImminent(matches) {
    const now = Date.now();
    return matches.some(m => {
      if (m.status === 'IN_PLAY' || m.status === 'PAUSED') return true;
      const kick = new Date(m.utcDate).getTime();
      return Math.abs(now - kick) < 2 * 60 * 60 * 1000;
    });
  },

  cacheAge() {
    const cached = localStorage.getItem('wc2026_matches_v2');
    if (!cached) return null;
    try {
      const { timestamp } = JSON.parse(cached);
      return Math.round((Date.now() - timestamp) / 1000);
    } catch (_) {
      return null;
    }
  },
};
