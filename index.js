/**
 * Vercel 用エントリ。Hono プリセットが "hono を import するファイル" を探すため、
 * ここで hono を import しつつ default で api アプリを export する。
 */
import { Hono } from "hono";
import app from "./api/[[...path]].js";
export default app;
