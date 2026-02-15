/**
 * Vercel 用 API（Postgres + Blob）。POSTGRES_URL があるときのみ使用
 */
import { Hono } from "hono";
import { getDBAsync } from "../services/db.js";
import { analyzePhoto } from "../services/ai.js";
import { putPhoto, putThumb } from "../services/blob-store.js";
import {
  generateJimotyTemplate,
  generateBatchTemplates,
  generateChecklist,
  formatForClipboard,
  getPostURL,
} from "../services/jimoty-assist.js";
import path from "path";
import sharp from "sharp";

const api = new Hono();

// ──────────────────────────────────
// Upload (Vercel Blob) — 1リクエストあたり枚数制限・エラー返却で止まらないように
// ──────────────────────────────────
const MAX_FILES_PER_UPLOAD = 10;

api.post("/upload", async (c) => {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return c.json(
        { error: "BLOB_READ_WRITE_TOKEN が設定されていません。Vercel の Storage で Blob を追加してください。" },
        500
      );
    }
    const body = await c.req.parseBody({ all: true });
    let files = Array.isArray(body["photos"]) ? body["photos"] : [body["photos"]];
    files = files.filter((f) => f && typeof f !== "string");
    if (files.length > MAX_FILES_PER_UPLOAD) {
      return c.json(
        { error: `一度に${MAX_FILES_PER_UPLOAD}枚までです。${files.length}枚は多すぎます。` },
        400
      );
    }
    if (files.length === 0) {
      return c.json({ error: "画像がありません" }, 400);
    }

    const db = await getDBAsync();
    const inserted = [];

    for (const file of files) {
      const ext = path.extname(file.name) || ".jpg";
      const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;

      const buf = Buffer.from(await file.arrayBuffer());
      let photoUrl, thumbUrl;
      try {
        const thumbBuf = await sharp(buf).resize(400, 400, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
        thumbUrl = await putThumb(thumbBuf, `thumb_${filename}`);
      } catch {
        thumbUrl = await putThumb(buf, `thumb_${filename}`);
      }
      photoUrl = await putPhoto(buf, filename);

      const result = await db.prepare("INSERT INTO items (photo_path, photo_thumb) VALUES (?, ?)").run(photoUrl, thumbUrl);
      inserted.push({ id: result.lastInsertRowid, photo_path: photoUrl });
    }
    return c.json({ ok: true, count: inserted.length, items: inserted });
  } catch (err) {
    console.error("upload error:", err);
    return c.json({ error: err.message || "アップロードに失敗しました" }, 500);
  }
});

// ──────────────────────────────────
// AI Analyze
// ──────────────────────────────────
api.post("/analyze/:id", async (c) => {
  const id = c.req.param("id");
  const db = await getDBAsync();
  const item = await db.prepare("SELECT * FROM items WHERE id = ?").get(id);
  if (!item) return c.json({ error: "Item not found" }, 404);
  try {
    const data = await analyzePhoto(item.photo_path);
    await db.prepare(`
      UPDATE items SET title_ja=?, desc_ja=?, title_en=?, desc_en=?,
        category=?, estimated_price=?, status='analyzed', updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(data.title_ja, data.mercari_desc || data.desc_ja, data.title_en, data.desc_en,
      data.category, data.estimated_price, id);
    return c.json({ ok: true, data });
  } catch (err) { return c.json({ error: err.message }, 500); }
});

api.post("/analyze-all", async (c) => {
  const db = await getDBAsync();
  const items = await db.prepare("SELECT * FROM items WHERE status = 'pending'").all();
  const results = [];
  for (const item of items) {
    try {
      const data = await analyzePhoto(item.photo_path);
      await db.prepare(`
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
api.get("/items", async (c) => {
  const db = await getDBAsync();
  const rows = await db.prepare("SELECT * FROM items ORDER BY created_at DESC").all();
  return c.json(rows);
});

api.get("/items/:id", async (c) => {
  const db = await getDBAsync();
  const item = await db.prepare("SELECT * FROM items WHERE id = ?").get(c.req.param("id"));
  return item ? c.json(item) : c.json({ error: "Not found" }, 404);
});

api.put("/items/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const db = await getDBAsync();
  const allowed = ["title_ja","desc_ja","title_en","desc_en","category","estimated_price","status","mercari_status","jimoty_status"];
  const fields = [], values = [];
  for (const k of allowed) {
    if (body[k] !== undefined) { fields.push(`${k}=?`); values.push(body[k]); }
  }
  if (!fields.length) return c.json({ error: "No fields" }, 400);
  fields.push("updated_at=CURRENT_TIMESTAMP");
  values.push(id);
  await db.prepare(`UPDATE items SET ${fields.join(",")} WHERE id=?`).run(...values);
  return c.json({ ok: true });
});

api.delete("/items/:id", async (c) => {
  const db = await getDBAsync();
  await db.prepare("DELETE FROM items WHERE id = ?").run(c.req.param("id"));
  return c.json({ ok: true });
});

// ──────────────────────────────────
// Photos (Vercel: photo_path は URL なのでフロントで直接参照。ここは 404 でよい)
// ──────────────────────────────────
api.get("/photo/:filename", (c) => c.json({ error: "Not found" }, 404));

// ──────────────────────────────────
// Jimoty
// ──────────────────────────────────
api.get("/jimoty/template/:id", async (c) => {
  const db = await getDBAsync();
  const item = await db.prepare("SELECT * FROM items WHERE id = ?").get(c.req.param("id"));
  if (!item) return c.json({ error: "Not found" }, 404);
  return c.json({
    ...generateJimotyTemplate(item),
    post_url: getPostURL(),
    clipboard_text: formatForClipboard(item),
  });
});

api.get("/jimoty/templates", async (c) => {
  const db = await getDBAsync();
  const items = await db.prepare("SELECT * FROM items WHERE status = 'analyzed'").all();
  return c.json({
    templates: generateBatchTemplates(items),
    post_url: getPostURL(),
    total: items.length,
  });
});

api.get("/jimoty/checklist", async (c) => {
  const db = await getDBAsync();
  const items = await db.prepare("SELECT * FROM items ORDER BY created_at DESC").all();
  return c.json(generateChecklist(items));
});

api.post("/jimoty/mark-listed/:id", async (c) => {
  const db = await getDBAsync();
  await db.prepare("UPDATE items SET jimoty_status='listed', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(c.req.param("id"));
  return c.json({ ok: true });
});

api.get("/jimoty/auto/status", async (c) => {
  return c.json({ available: false, reason: "Vercel では Playwright 利用不可" });
});

api.post("/jimoty/auto/post/:id", async (c) => {
  return c.json({ error: "Vercel では利用できません" }, 400);
});

// ──────────────────────────────────
// Mercari
// ──────────────────────────────────
api.get("/mercari/copy/:id", async (c) => {
  const db = await getDBAsync();
  const item = await db.prepare("SELECT * FROM items WHERE id = ?").get(c.req.param("id"));
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
api.get("/export/jimoty-csv", async (c) => {
  const db = await getDBAsync();
  const items = await db.prepare("SELECT * FROM items WHERE status = 'analyzed'").all();
  const header = "タイトル,説明,カテゴリ,価格,ステータス\n";
  const rows = items.map(i =>
    `"${(i.title_ja||"").replace(/"/g,'""')}","${(i.desc_ja||"").replace(/"/g,'""')}","${i.category}",${i.estimated_price||0},"${i.jimoty_status}"`
  ).join("\n");
  return new Response(header + rows, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=jimoty_export.csv" }
  });
});

api.notFound((c) => c.json({ error: "Not Found" }, 404));

api.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message || "Internal Server Error" }, 500);
});

export { api as apiRoutes };
