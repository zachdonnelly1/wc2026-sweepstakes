// Supabase database operations

let _supabase = null;

function getClient() {
  if (!_supabase) {
    _supabase = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  }
  return _supabase;
}

const DB = {
  async getPlayers() {
    const { data, error } = await getClient()
      .from('players')
      .select('*')
      .order('id');
    if (error) throw error;
    return data || [];
  },

  async savePlayers(names) {
    const db = getClient();
    // Clear and re-insert (only valid before draw starts)
    await db.from('players').delete().gte('id', 0);
    const { data, error } = await db
      .from('players')
      .insert(names.map(name => ({ name: name.trim() })))
      .select();
    if (error) throw error;
    return data;
  },

  async getAssignments() {
    const { data, error } = await getClient()
      .from('assignments')
      .select('player_id, team_id, tier, players(id, name)')
      .order('player_id')
      .order('tier');
    if (error) throw error;
    return data || [];
  },

  async saveAssignment(playerId, teamId, tier) {
    const { error } = await getClient()
      .from('assignments')
      .insert({ player_id: playerId, team_id: teamId, tier });
    if (error) throw error;
  },

  async getSetting(key) {
    const { data } = await getClient()
      .from('settings')
      .select('value')
      .eq('key', key)
      .single();
    return data?.value ?? null;
  },

  async setSetting(key, value) {
    const { error } = await getClient()
      .from('settings')
      .upsert({ key, value: String(value) });
    if (error) throw error;
  },

  async getSpecialPrizes() {
    const { data, error } = await getClient()
      .from('special_prizes')
      .select('type, player_id, players(name)');
    if (error) throw error;
    return data || [];
  },

  async awardSpecialPrize(type, playerId) {
    const { error } = await getClient()
      .from('special_prizes')
      .upsert({ type, player_id: playerId });
    if (error) throw error;
  },

  async removeSpecialPrize(type) {
    const { error } = await getClient()
      .from('special_prizes')
      .delete()
      .eq('type', type);
    if (error) throw error;
  },

  async resetAll() {
    const db = getClient();
    await db.from('special_prizes').delete().gte('player_id', 0);
    await db.from('assignments').delete().gte('player_id', 0);
    await db.from('players').delete().gte('id', 0);
    await db.from('settings').upsert({ key: 'draw_complete', value: 'false' });
  },
};
