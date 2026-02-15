import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

const client = new Anthropic();

const SYSTEM_PROMPT = `あなたはフリマアプリの出品代行アシスタントです。
商品の写真を見て、以下の情報をJSON形式で返してください。

{
  "title_ja": "商品名（日本語、30文字以内）",
  "desc_ja": "商品説明（日本語、メルカリ/ジモティー向け。状態・サイズ・特徴を含む。200文字程度）",
  "title_en": "Product name (English, concise)",
  "desc_en": "Product description (English, for reference)",
  "category": "カテゴリ（家具/家電/衣類/雑貨/本/その他）",
  "estimated_price": 数値（円、中古相場を考慮した適正価格）,
  "condition": "状態（新品同様/目立った傷や汚れなし/やや傷や汚れあり/傷や汚れあり/全体的に状態が悪い）",
  "mercari_desc": "メルカリ用の出品文（絵文字あり、フレンドリー、送料込み前提で記載）",
  "jimoty_desc": "ジモティー用の出品文（手渡し前提、場所の柔軟性を示唆、丁寧語）"
}

注意:
- 写真から読み取れる情報のみを記載し、推測は最小限に
- 価格は控えめに設定（早く売れることを優先）
- 必ず valid JSON のみを返すこと（マークダウンやコメント不要）`;

export async function analyzePhoto(photoPath) {
  const ext = path.extname(photoPath).toLowerCase();
  const mediaType = ext === ".png" ? "image/png"
    : ext === ".webp" ? "image/webp"
    : "image/jpeg";

  const imageData = fs.readFileSync(photoPath);
  const base64 = imageData.toString("base64");

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: base64 },
          },
          {
            type: "text",
            text: "この商品を出品してください。JSON形式で返してください。",
          },
        ],
      },
    ],
    system: SYSTEM_PROMPT,
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  // Parse JSON, strip markdown fences if present
  const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(clean);
}

export async function analyzeBatch(photoPaths, onProgress) {
  const results = [];
  const CONCURRENCY = 3;

  for (let i = 0; i < photoPaths.length; i += CONCURRENCY) {
    const batch = photoPaths.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (p, idx) => {
        try {
          const data = await analyzePhoto(p);
          if (onProgress) onProgress(i + idx + 1, photoPaths.length);
          return { path: p, success: true, data };
        } catch (err) {
          return { path: p, success: false, error: err.message };
        }
      })
    );
    results.push(...batchResults);
  }
  return results;
}
