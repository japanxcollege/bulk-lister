// ジモティー半自動アシスト
// デフォルトモード: テンプレート生成 + コピー + 投稿画面リンク

const JIMOTY_POST_URL = "https://jmty.jp/sale/post";

// ジモティー用の投稿テンプレートを生成
export function generateJimotyTemplate(item) {
  const title = (item.title_ja || "商品").slice(0, 50);

  // ジモティーは手渡し前提なので文体を調整
  const desc = [
    item.desc_ja || "",
    "",
    "【状態】中古品",
    item.estimated_price ? `【希望価格】¥${item.estimated_price.toLocaleString()}` : "【価格】ご相談ください",
    "",
    "※お引き取り可能な方優先です",
    "※場所は相談の上決めさせていただきます",
    "※お気軽にお問い合わせください",
  ].join("\n");

  return { title, desc, price: item.estimated_price || 0 };
}

// 全アイテムのジモティー用テンプレートを一括生成
export function generateBatchTemplates(items) {
  return items
    .filter((i) => i.status === "analyzed")
    .map((item) => ({
      id: item.id,
      photo_path: item.photo_path,
      ...generateJimotyTemplate(item),
    }));
}

// ジモティー投稿画面URL（直リンク）
export function getPostURL() {
  return JIMOTY_POST_URL;
}

// 一括コピー用のプレーンテキストを生成（1アイテム分）
export function formatForClipboard(item) {
  const t = generateJimotyTemplate(item);
  return `━━━━━━━━━━━━━━━━━━━━
タイトル: ${t.title}
価格: ¥${t.price.toLocaleString()}
━━━━━━━━━━━━━━━━━━━━
${t.desc}
━━━━━━━━━━━━━━━━━━━━`;
}

// 全アイテムの投稿チェックリスト（進捗管理用）
export function generateChecklist(items) {
  const analyzed = items.filter((i) => i.status === "analyzed");
  return analyzed.map((item, idx) => ({
    number: idx + 1,
    id: item.id,
    title: item.title_ja || "未タイトル",
    price: item.estimated_price || 0,
    jimoty_status: item.jimoty_status,
    done: item.jimoty_status === "listed",
  }));
}
