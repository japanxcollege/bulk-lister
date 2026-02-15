/**
 * ローカル用 Node サーバー（npm run dev / start）
 * ファイル名を local-server にしているのは、Vercel の Hono プリセットが
 * src/server.js / src/index.js をエントリとして使うため。Vercel ではルート index.js のみ使う。
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import { apiRoutes } from "./routes/api.js";
import { initDB } from "./services/db.js";
import fs from "fs";

const app = new Hono();
app.use("/*", cors());
app.route("/api", apiRoutes);
app.use("/*", serveStatic({ root: "./src/public" }));

const uploadDir = process.env.UPLOAD_DIR || "./uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

await initDB();

const port = parseInt(process.env.PORT || "8080");
console.log(`🚀 Bulk Lister running on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
