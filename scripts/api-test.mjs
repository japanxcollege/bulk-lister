/**
 * API が常に JSON を返すことを確認（404/500 で HTML にならない）
 * 実行: node scripts/api-test.mjs
 */
import app from "../index.js";

const base = "http://localhost";

async function request(method, path, body) {
  const url = path.startsWith("http") ? path : base + path;
  const opt = { method };
  if (body) opt.body = body;
  return app.request(url, opt);
}

function isJson(res) {
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json");
}

async function assertJson(res, label) {
  const ok = isJson(res);
  const text = await res.text();
  if (!ok) {
    throw new Error(`${label}: expected JSON, got content-type ${res.headers.get("content-type")}, body: ${text.slice(0, 80)}`);
  }
  try {
    JSON.parse(text);
  } catch (e) {
    throw new Error(`${label}: body is not valid JSON: ${text.slice(0, 80)}`);
  }
}

async function run() {
  let failed = 0;

  // 1. 存在しないパス -> 404 JSON
  try {
    const r404 = await request("GET", "/api/nonexistent");
    if (r404.status !== 404) throw new Error(`expected 404, got ${r404.status}`);
    await assertJson(r404, "GET /api/nonexistent");
    console.log("ok GET /api/nonexistent -> 404 JSON");
  } catch (e) {
    console.error(e.message);
    failed++;
  }

  // 2. POST /api/analyze/1 -> 404 or 500, 必ず JSON
  try {
    const rAnalyze = await request("POST", "/api/analyze/1");
    if (rAnalyze.status !== 404 && rAnalyze.status !== 500) {
      throw new Error(`expected 404 or 500, got ${rAnalyze.status}`);
    }
    await assertJson(rAnalyze, `POST /api/analyze/1 (${rAnalyze.status})`);
    console.log("ok POST /api/analyze/1 ->", rAnalyze.status, "JSON");
  } catch (e) {
    console.error(e.message);
    failed++;
  }

  // 3. GET /api/items -> 200 or 500, 必ず JSON
  try {
    const rItems = await request("GET", "/api/items");
    await assertJson(rItems, `GET /api/items (${rItems.status})`);
    console.log("ok GET /api/items ->", rItems.status, "JSON");
  } catch (e) {
    console.error(e.message);
    failed++;
  }

  if (failed) {
    process.exit(1);
  }
  console.log("all api tests passed");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
