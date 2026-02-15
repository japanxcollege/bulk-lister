/**
 * Vercel Serverless: /api/* をすべてこの Hono アプリで処理
 * POSTGRES_URL + BLOB_READ_WRITE_TOKEN を Vercel の環境変数で設定すること
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { apiRoutes } from "../src/routes/api-vercel.js";

const app = new Hono();
app.use("/*", cors());
app.route("/api", apiRoutes);

export default app;
