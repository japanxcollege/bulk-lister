/**
 * Vercel Postgres 用 DB 層（POSTGRES_URL があるときのみ使用）
 * sql.js と同じ prepare().run/get/all インターフェースを提供
 */
import pg from "pg";
const { Pool } = pg;

let pool;
let tableChecked = false;

function getPool() {
  if (!pool) pool = new Pool({ connectionString: process.env.POSTGRES_URL });
  return pool;
}

async function ensureTable() {
  if (tableChecked) return;
  const client = getPool();
  await client.query(`
    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      photo_path TEXT NOT NULL,
      photo_thumb TEXT,
      status TEXT DEFAULT 'pending',
      title_ja TEXT,
      desc_ja TEXT,
      title_en TEXT,
      desc_en TEXT,
      category TEXT,
      estimated_price INTEGER,
      platform TEXT,
      mercari_status TEXT DEFAULT 'not_listed',
      jimoty_status TEXT DEFAULT 'not_listed',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);
  tableChecked = true;
}

function toParamStyle(query) {
  let i = 0;
  return query.replace(/\?/g, () => `$${++i}`);
}

export async function getDB() {
  await ensureTable();
  const client = getPool();
  return {
    prepare(sqlText) {
      const paramed = toParamStyle(sqlText);
      return {
        async run(...params) {
          const isInsert = /^\s*INSERT\s+/i.test(sqlText.trim());
          const q = isInsert
            ? paramed.replace(/;\s*$/, "") + " RETURNING id"
            : paramed;
          const res = await client.query(q, params);
          const lastInsertRowid = isInsert && res.rows?.[0]?.id
            ? res.rows[0].id
            : undefined;
          return { lastInsertRowid, changes: res.rowCount ?? 0 };
        },
        async get(...params) {
          const res = await client.query(paramed, params);
          return res.rows?.[0] ?? undefined;
        },
        async all(...params) {
          const res = await client.query(paramed, params);
          return res.rows ?? [];
        },
      };
    },
  };
}
