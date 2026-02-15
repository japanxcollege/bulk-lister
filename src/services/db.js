import initSqlJs from "sql.js";
import fs from "fs";
import path from "path";

const DB_PATH = process.env.DB_PATH || "./data/bulk-lister.db";
let db;

export async function initDB() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  saveDB();
  return db;
}

function saveDB() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// Wrapper to match better-sqlite3 style API used in routes
export function getDB() {
  if (!db) throw new Error("DB not initialized. Call initDB() first.");
  return {
    prepare(sql) {
      return {
        run(...params) {
          db.run(sql, params);
          saveDB();
          const lastId = db.exec("SELECT last_insert_rowid() as id")[0]?.values[0][0];
          return { lastInsertRowid: lastId, changes: db.getRowsModified() };
        },
        get(...params) {
          const stmt = db.prepare(sql);
          stmt.bind(params);
          if (stmt.step()) {
            const cols = stmt.getColumnNames();
            const vals = stmt.get();
            stmt.free();
            const row = {};
            cols.forEach((c, i) => row[c] = vals[i]);
            return row;
          }
          stmt.free();
          return undefined;
        },
        all(...params) {
          const results = [];
          const stmt = db.prepare(sql);
          stmt.bind(params);
          while (stmt.step()) {
            const cols = stmt.getColumnNames();
            const vals = stmt.get();
            const row = {};
            cols.forEach((c, i) => row[c] = vals[i]);
            results.push(row);
          }
          stmt.free();
          return results;
        }
      };
    }
  };
}
