/**
 * Vercel Serverless: / と /api/* をこの Hono アプリで処理
 * POSTGRES_URL + BLOB_READ_WRITE_TOKEN を Vercel の環境変数で設定すること
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { apiRoutes } from "../src/routes/api-vercel.js";
import path from "path";
import fs from "fs";

const app = new Hono();
app.use("/*", cors());
app.route("/api", apiRoutes);

// Vercel で / にアクセスしたときに index.html を返す（public はビルドに含まれる）
app.get("/", (c) => {
  try {
    const p = path.join(process.cwd(), "public", "index.html");
    const html = fs.readFileSync(p, "utf-8");
    return c.html(html);
  } catch {
    return c.text("Not found", 404);
  }
});

app.get("/index.html", (c) => {
  try {
    const p = path.join(process.cwd(), "public", "index.html");
    const html = fs.readFileSync(p, "utf-8");
    return c.html(html);
  } catch {
    return c.text("Not found", 404);
  }
});

export default app;
