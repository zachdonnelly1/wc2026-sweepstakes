-- WC2026 Sweepstakes — Supabase schema
-- Run this in the Supabase SQL Editor after creating your project.
-- Safe to re-run — drops existing tables first.

DROP TABLE IF EXISTS special_prizes CASCADE;
DROP TABLE IF EXISTS assignments    CASCADE;
DROP TABLE IF EXISTS settings       CASCADE;
DROP TABLE IF EXISTS players        CASCADE;

-- Players entered by admin
CREATE TABLE players (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team assignments from the draw (one team per player per tier)
CREATE TABLE assignments (
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id   INTEGER NOT NULL,  -- football-data.org team ID (hardcoded in teams.js)
  tier      INTEGER NOT NULL CHECK (tier BETWEEN 1 AND 3),
  drawn_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (player_id, tier),    -- one team per tier per player
  UNIQUE (team_id)                  -- no team assigned to two players
);

-- Special prizes awarded manually by admin
CREATE TABLE special_prizes (
  type       TEXT PRIMARY KEY CHECK (type IN ('underdog_hero', 'beautiful_loser', 'wooden_spoon')),
  player_id  INTEGER REFERENCES players(id) ON DELETE SET NULL,
  awarded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Key/value settings store
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Seed required settings
INSERT INTO settings (key, value) VALUES ('draw_complete', 'false');

-- ─── Row Level Security ──────────────────────────────────────────────
-- For a private sweepstakes with friends, we allow open reads and writes.
-- The anon key is client-visible but Supabase's anon role is read-only by
-- default until you grant permissions below.

ALTER TABLE players        ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE special_prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings       ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read (public leaderboard)
CREATE POLICY "public read players"        ON players        FOR SELECT USING (true);
CREATE POLICY "public read assignments"    ON assignments    FOR SELECT USING (true);
CREATE POLICY "public read special_prizes" ON special_prizes FOR SELECT USING (true);
CREATE POLICY "public read settings"       ON settings       FOR SELECT USING (true);

-- Allow anyone to write (admin password enforced in JS — acceptable for personal sweepstakes)
CREATE POLICY "allow insert players"        ON players        FOR INSERT WITH CHECK (true);
CREATE POLICY "allow update players"        ON players        FOR UPDATE USING (true);
CREATE POLICY "allow delete players"        ON players        FOR DELETE USING (true);

CREATE POLICY "allow insert assignments"    ON assignments    FOR INSERT WITH CHECK (true);
CREATE POLICY "allow delete assignments"    ON assignments    FOR DELETE USING (true);

CREATE POLICY "allow upsert special_prizes" ON special_prizes FOR INSERT WITH CHECK (true);
CREATE POLICY "allow update special_prizes" ON special_prizes FOR UPDATE USING (true);
CREATE POLICY "allow delete special_prizes" ON special_prizes FOR DELETE USING (true);

CREATE POLICY "allow upsert settings"       ON settings       FOR INSERT WITH CHECK (true);
CREATE POLICY "allow update settings"       ON settings       FOR UPDATE USING (true);
