/**
 * Vercel ビルド時のチェック: エントリが正しく export されているか
 */
const mod = await import("../api/[[...path]].js");
if (typeof mod.default?.fetch !== "function") {
  console.error("build check: api app must export default with .fetch");
  process.exit(1);
}
console.log("build check ok");
