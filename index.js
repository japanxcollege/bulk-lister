/**
 * Vercel 用エントリ（Hono プリセットが参照する default export）
 * ローカルでは使わず npm run dev → src/server.js を実行する。
 */
export { default } from "./api/[[...path]].js";
