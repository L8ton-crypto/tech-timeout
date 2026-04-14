import { neon } from "@neondatabase/serverless";

let dbReady = false;

function getDb() {
  const sql = neon(process.env.DATABASE_URL!);
  return sql;
}

export async function ensureDb() {
  const sql = getDb();
  if (dbReady) return sql;

  await sql`
    CREATE TABLE IF NOT EXISTS tt_families (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      join_code TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS tt_members (
      id SERIAL PRIMARY KEY,
      family_id INTEGER REFERENCES tt_families(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      avatar TEXT DEFAULT '👤',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS tt_sessions (
      id SERIAL PRIMARY KEY,
      family_id INTEGER REFERENCES tt_families(id) ON DELETE CASCADE,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      ended_at TIMESTAMPTZ,
      duration_minutes INTEGER,
      notes TEXT
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS tt_streaks (
      id SERIAL PRIMARY KEY,
      family_id INTEGER REFERENCES tt_families(id) ON DELETE CASCADE,
      current_streak INTEGER DEFAULT 0,
      longest_streak INTEGER DEFAULT 0,
      total_minutes INTEGER DEFAULT 0,
      last_session_date DATE,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  dbReady = true;
  return sql;
}
