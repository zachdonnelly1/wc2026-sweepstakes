const CONFIG = {
  FOOTBALL_API_TOKEN: '48c0a1212576483a8f3ca49bfdc93d1c',
  FOOTBALL_API_BASE: 'https://api.football-data.org/v4',
  WC_COMPETITION_ID: 2000,

  // Fill these in after creating your Supabase project
  SUPABASE_URL: 'https://minbjoislntwtsabgozu.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_7QK2Nzu08b7u_c73NcNEkw_fbIi_vHg',

  // Change this to your desired admin password
  ADMIN_PASSWORD: 'avalanche2026',

  POT: {
    total: 240,
    winner: 120,
    runnerUp: 50,
    semiFinal: 15,      // each of the 2 SF losers
    underdogHero: 20,
    beautifulLoser: 15,
    woodenSpoon: 5,
  },

  CACHE_TTL_MS: 5 * 60 * 1000,  // 5 minutes
};
