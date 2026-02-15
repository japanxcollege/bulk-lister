import { Hono } from "hono";
import { getDB } from "../services/db.js";
import { analyzePhoto } from "../services/ai.js";
import {
  generateJimotyTemplate,
  generateBatchTemplates,
  generateChecklist,
  formatForClipboard,
  getPostURL,
} from "../services/jimoty-assist.js";
import fs from "fs";
import path from "path";
import sharp from "sharp";

const api = new Hono();
const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

// ──────────────────────────────────
// Upload
// ──────────────────────────────────
api.post("/upload", async (c) => {
  const body = await c.req.parseBody({ all: true });
  const files = Array.isArray(body["photos"]) ? body["photos"] : [body["photos"]];
  const db = getDB();
  const inserted = [];

  for (const file of files) {
    if (!file || typeof file === "string") continue;
    const ext = path.extname(file.name) || ".jpg";
    const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);
    const thumbpath = path.join(UPLOAD_DIR, `thumb_${filename}`);

    const buf = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filepath, buf);

    try {
      await sharp(buf).resize(400, 400, { fit: "inside" }).jpeg({ quality: 80 }).toFile(thumbpath);
    } catch { fs.copyFileSync(filepath, thumbpath); }

    const result = db.prepare("INSERT INTO items (photo_path, photo_thumb) VALUES (?, ?)").run(filepath, thumbpath);
    inserted.push({ id: result.lastInsertRowid, photo_path: filepath });
  }
  return c.json({ ok: true, count: inserted.length, items: inserted });
});

// ──────────────────────────────────
// AI Analyze
// ──────────────────────────────────
api.post("/analyze/:id", async (c) => {
  const id = c.req.param("id");
  const db = getDB();
  const item = db.prepare("SELECT * FROM items WHERE id = ?").get(id);
  if (!item) return c.json({ error: "Item not found" }, 404);

  try {
    const data = await analyzePhoto(item.photo_path);
    db.prepare(`
      UPDATE items SET title_ja=?, desc_ja=?, title_en=?, desc_en=?,
        category=?, estimated_price=?, status='analyzed', updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(data.title_ja, data.mercari_desc || data.desc_ja, data.title_en, data.desc_en,
      data.category, data.estimated_price, id);
    return c.json({ ok: true, data });
  } catch (err) { return c.json({ error: err.message }, 500); }
});

api.post("/analyze-all", async (c) => {
  const db = getDB();
  const items = db.prepare("SELECT * FROM items WHERE status = 'pending'").all();
  const results = [];
  for (const item of items) {
    try {
      const data = await analyzePhoto(item.photo_path);
      db.prepare(`
        UPDATE items SET title_ja=?, desc_ja=?, title_en=?, desc_en=?,
          category=?, estimated_price=?, status='analyzed', updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(data.title_ja, data.mercari_desc || data.desc_ja, data.title_en, data.desc_en,
        data.category, data.estimated_price, item.id);
      results.push({ id: item.id, ok: true });
    } catch (err) { results.push({ id: item.id, ok: false, error: err.message }); }
  }
  return c.json({ ok: true, total: items.length, results });
});

// ──────────────────────────────────
// Items CRUD
// ──────────────────────────────────
api.get("/items", (c) => {
  const db = getDB();
  return c.json(db.prepare("SELECT * FROM items ORDER BY created_at DESC").all());
});

api.get("/items/:id", (c) => {
  const db = getDB();
  const item = db.prepare("SELECT * FROM items WHERE id = ?").get(c.req.param("id"));
  return item ? c.json(item) : c.json({ error: "Not found" }, 404);
});

api.put("/items/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const db = getDB();
  const allowed = ["title_ja","desc_ja","title_en","desc_en","category","estimated_price","status","mercari_status","jimoty_status"];
  const fields = [], values = [];
  for (const k of allowed) {
    if (body[k] !== undefined) { fields.push(`${k}=?`); values.push(body[k]); }
  }
  if (!fields.length) return c.json({ error: "No fields" }, 400);
  fields.push("updated_at=CURRENT_TIMESTAMP");
  values.push(id);
  db.prepare(`UPDATE items SET ${fields.join(",")} WHERE id=?`).run(...values);
  return c.json({ ok: true });
});

api.delete("/items/:id", (c) => {
  getDB().prepare("DELETE FROM items WHERE id = ?").run(c.req.param("id"));
  return c.json({ ok: true });
});

// ──────────────────────────────────
// Photos
// ──────────────────────────────────
api.get("/photo/:filename", (c) => {
  const filepath = path.join(UPLOAD_DIR, c.req.param("filename"));
  if (!fs.existsSync(filepath)) return c.json({ error: "Not found" }, 404);
  const buf = fs.readFileSync(filepath);
  const ext = path.extname(filepath).toLowerCase();
  const ct = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return new Response(buf, { headers: { "Content-Type": ct, "Cache-Control": "public, max-age=3600" } });
});

// ──────────────────────────────────
// Jimoty Assist (半自動 - デフォルト)
// ──────────────────────────────────

// 1件分のジモティー投稿テンプレート
api.get("/jimoty/template/:id", (c) => {
  const db = getDB();
  const item = db.prepare("SELECT * FROM items WHERE id = ?").get(c.req.param("id"));
  if (!item) return c.json({ error: "Not found" }, 404);
  return c.json({
    ...generateJimotyTemplate(item),
    post_url: getPostURL(),
    clipboard_text: formatForClipboard(item),
  });
});

// 全アイテムの投稿テンプレート一括
api.get("/jimoty/templates", (c) => {
  const db = getDB();
  const items = db.prepare("SELECT * FROM items WHERE status = 'analyzed'").all();
  return c.json({
    templates: generateBatchTemplates(items),
    post_url: getPostURL(),
    total: items.length,
  });
});

// 投稿チェックリスト（進捗管理）
api.get("/jimoty/checklist", (c) => {
  const db = getDB();
  const items = db.prepare("SELECT * FROM items ORDER BY created_at DESC").all();
  return c.json(generateChecklist(items));
});

// ステータス更新（投稿済みマーク）
api.post("/jimoty/mark-listed/:id", async (c) => {
  const db = getDB();
  db.prepare("UPDATE items SET jimoty_status='listed', updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(c.req.param("id"));
  return c.json({ ok: true });
});

// ──────────────────────────────────
// Jimoty Playwright (自動 - オプション)
// ──────────────────────────────────

api.get("/jimoty/auto/status", async (c) => {
  try {
    const { getStatus } = await import("../services/jimoty-playwright.js");
    return c.json(getStatus());
  } catch {
    return c.json({ available: false, reason: "playwright未インストール" });
  }
});

api.post("/jimoty/auto/post/:id", async (c) => {
  try {
    const { isAvailable, autoPost } = await import("../services/jimoty-playwright.js");
    if (!isAvailable()) return c.json({ error: "自動投稿が利用できません" }, 400);
    const db = getDB();
    const item = db.prepare("SELECT * FROM items WHERE id = ?").get(c.req.param("id"));
    if (!item) return c.json({ error: "Not found" }, 404);
    const result = await autoPost(item, item.photo_path);
    if (result.success) {
      db.prepare("UPDATE items SET jimoty_status='listed', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(item.id);
    }
    return c.json(result);
  } catch (err) { return c.json({ error: err.message }, 500); }
});

// ──────────────────────────────────
// Mercari helpers
// ──────────────────────────────────
api.get("/mercari/copy/:id", (c) => {
  const db = getDB();
  const item = db.prepare("SELECT * FROM items WHERE id = ?").get(c.req.param("id"));
  if (!item) return c.json({ error: "Not found" }, 404);
  return c.json({
    title: item.title_ja || "",
    description: item.desc_ja || "",
    price: item.estimated_price || 0,
    clipboard_text: `${item.title_ja}\n\n${item.desc_ja}\n\n価格: ¥${(item.estimated_price || 0).toLocaleString()}`,
  });
});

// ──────────────────────────────────
// Export
// ──────────────────────────────────
api.get("/export/jimoty-csv", (c) => {
  const db = getDB();
  const items = db.prepare("SELECT * FROM items WHERE status = 'analyzed'").all();
  const header = "タイトル,説明,カテゴリ,価格,ステータス\n";
  const rows = items.map(i =>
    `"${(i.title_ja||"").replace(/"/g,'""')}","${(i.desc_ja||"").replace(/"/g,'""')}","${i.category}",${i.estimated_price||0},"${i.jimoty_status}"`
  ).join("\n");
  return new Response(header + rows, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=jimoty_export.csv" }
  });
});

export { api as apiRoutes };
