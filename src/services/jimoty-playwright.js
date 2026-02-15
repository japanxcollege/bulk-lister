// ジモティー Playwright 自動投稿 (オプションモード)
// ⚠️ 規約グレーゾーン・壊れやすい → デフォルトOFF
//
// 前提:
// - npm install playwright chromium
// - 初回は手動ログインしてセッションを保存する必要あり
// - fly.ioでは512MB以上のVMが必要

import fs from "fs";
import path from "path";

const SESSION_PATH =
  process.env.JIMOTY_SESSION_PATH || "./data/jimoty-session.json";
const JIMOTY_POST_URL = "https://jmty.jp/sale/post";

let chromium;
try {
  const pw = await import("playwright");
  chromium = pw.chromium;
} catch {
  chromium = null;
}

export function isAvailable() {
  return chromium !== null && fs.existsSync(SESSION_PATH);
}

export function getStatus() {
  if (!chromium) return { available: false, reason: "playwright未インストール" };
  if (!fs.existsSync(SESSION_PATH))
    return { available: false, reason: "ログインセッション未作成" };
  return { available: true, reason: null };
}

// Step 1: 手動ログインしてセッション保存（初回のみ、ローカルで実行）
export async function saveLoginSession() {
  if (!chromium) throw new Error("playwright未インストール");

  const browser = await chromium.launch({ headless: false }); // GUI表示
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://jmty.jp/login");
  console.log("🔐 ブラウザでジモティーにログインしてください...");
  console.log("   ログイン完了したら、このターミナルでEnterを押してください");

  // ユーザーがログインするのを待つ
  await new Promise((resolve) => {
    process.stdin.once("data", resolve);
  });

  // セッション保存
  const dir = path.dirname(SESSION_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await context.storageState({ path: SESSION_PATH });
  console.log(`✅ セッション保存完了: ${SESSION_PATH}`);

  await browser.close();
}

// Step 2: 自動投稿（1件）
export async function autoPost(item, photoPath) {
  if (!isAvailable()) {
    const status = getStatus();
    throw new Error(`自動投稿不可: ${status.reason}`);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });

  const context = await browser.newContext({
    storageState: SESSION_PATH,
  });

  const page = await context.newPage();
  page.setDefaultTimeout(30000);

  try {
    // 投稿ページへ
    await page.goto(JIMOTY_POST_URL, { waitUntil: "networkidle" });

    // ログイン状態確認
    const loggedIn = await page
      .locator('[class*="user"], [class*="mypage"], [class*="logout"]')
      .count();
    if (loggedIn === 0) {
      throw new Error("セッション切れ: 再ログインが必要です");
    }

    // タイトル入力
    const titleInput = page.locator(
      'input[name*="title"], input[placeholder*="タイトル"]'
    );
    await titleInput.waitFor({ state: "visible", timeout: 10000 });
    await titleInput.fill(item.title_ja || "商品");

    // 説明文入力
    const descInput = page.locator(
      'textarea[name*="body"], textarea[name*="description"], textarea[placeholder*="説明"]'
    );
    await descInput.waitFor({ state: "visible", timeout: 10000 });
    await descInput.fill(item.desc_ja || "");

    // 写真アップロード（あれば）
    if (photoPath && fs.existsSync(photoPath)) {
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(photoPath);
      // アップロード完了待ち
      await page.waitForTimeout(3000);
    }

    // 価格入力（あれば）
    if (item.estimated_price) {
      const priceInput = page.locator('input[name*="price"]');
      if ((await priceInput.count()) > 0) {
        await priceInput.fill(String(item.estimated_price));
      }
    }

    // スクリーンショット保存（確認用）
    const ssPath = `./data/screenshots/jimoty_${item.id}_${Date.now()}.png`;
    const ssDir = path.dirname(ssPath);
    if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });
    await page.screenshot({ path: ssPath, fullPage: true });

    // ⚠️ 投稿ボタンは押さない（安全のため）
    // 自動投稿を有効にするには JIMOTY_AUTO_SUBMIT=true に設定
    if (process.env.JIMOTY_AUTO_SUBMIT === "true") {
      const submitBtn = page.locator(
        'button[type="submit"], input[type="submit"]'
      );
      if ((await submitBtn.count()) > 0) {
        await submitBtn.first().click();
        await page.waitForTimeout(5000);
        console.log(`✅ 投稿完了: ${item.title_ja}`);
      }
    } else {
      console.log(
        `📸 スクリーンショット保存: ${ssPath} (自動投稿はOFF)`
      );
    }

    return {
      success: true,
      screenshot: ssPath,
      autoSubmitted: process.env.JIMOTY_AUTO_SUBMIT === "true",
    };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    await browser.close();
  }
}

// Step 3: バッチ自動投稿
export async function autoBatchPost(items, onProgress) {
  const results = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const result = await autoPost(item, item.photo_path);
    results.push({ id: item.id, ...result });
    if (onProgress) onProgress(i + 1, items.length);

    // レート制限対策: 投稿間に30秒待つ
    if (i < items.length - 1) {
      await new Promise((r) => setTimeout(r, 30000));
    }
  }
  return results;
}
