# 📦 Bulk Lister - バルク出品ワークフローシステム

写真をアップロード → Claude AIが商品説明・価格を自動生成 → メルカリ/ジモティーに出品

## 🏗️ アーキテクチャ

```
[写真アップロード] → [Claude Vision API] → [レビューUI] → [出品]
                                                           ├→ メルカリ (コピペ)
                                                           └→ ジモティー (CSV)
```

- **Server**: Hono (Node.js)
- **DB**: SQLite (永続ボリューム)
- **AI**: Claude Sonnet (Vision)
- **Deploy**: fly.io (Tokyo リージョン)

## 🚀 デプロイ手順

### 前提条件
- [flyctl](https://fly.io/docs/flyctl/install/) インストール済み
- [Anthropic API Key](https://console.anthropic.com/) 取得済み
- クレジットカード登録済み (fly.io)

### コマンド

```bash
# 1. リポジトリをクローン
git clone <your-repo>
cd bulk-lister

# 2. デプロイ（対話式）
chmod +x deploy.sh
./deploy.sh

# または手動で:
fly launch           # 初回セットアップ
fly volumes create lister_data --region nrt --size 1
fly secrets set ANTHROPIC_API_KEY=sk-ant-...
fly deploy
```

### ローカル開発

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...
npm run dev
# → http://localhost:8080
```

### デプロイ後の状態把握

**fly.io の管理は「fly.io にログインした人」だけが行えます。** アプリ本体（Bulk Lister）にはログイン機能はなく、URL を知っている人は誰でも利用できます。

| やり方 | コマンド / 場所 | 用途 |
|--------|------------------|------|
| **稼働状況** | `fly status -a bulk-lister` | マシンが起動中か・リージョン・アプリ名を確認 |
| **ログ** | `fly logs -a bulk-lister` | リアルタイムログ（エラー・アクセス確認） |
| **Web ダッシュボード** | [fly.io Dashboard](https://fly.io/dashboard) にログイン → アプリ `bulk-lister` を選択 | グラフ・メトリクス・ログ・シークレット・スケール設定をブラウザで確認 |
| **停止** | `fly machine stop -a bulk-lister` | マシンを止める（課金抑止） |
| **再開** | `fly machine start -a bulk-lister` または `fly apps restart bulk-lister` | 停止したマシンを再度起動 |

### 管理アカウントの作成（fly.io）

デプロイ・状態確認・停止・再開を行う「管理者」になるには、**fly.io のアカウント**を 1 つ作ります。

1. **サインアップ**
   - [https://fly.io/app/sign-up](https://fly.io/app/sign-up) でメールアドレス or GitHub で登録
   - クレジットカードを登録（無料枠内でも必須）

2. **CLI からログイン**
   ```bash
   curl -L https://fly.io/install.sh | sh   # 未導入なら
   fly auth login
   ```
   ブラウザが開くので、fly.io のアカウントでログインする。

3. **誰が「管理者」か**
   - 最初に `fly apps create bulk-lister` や `./deploy.sh` を実行した人 = そのアプリのオーナー（管理者）
   - チームで管理者を増やしたい場合は、fly.io の [Organizations](https://fly.io/dashboard) で Organization を作成し、メンバーを追加。その Org にアプリを作り直すか、既存アプリを移す必要があります。

4. **利用者（チームのスマホ）**
   - アカウント不要。**URL `https://bulk-lister.fly.dev` を共有するだけ**で、ブラウザから利用できます。Bulk Lister アプリ側のログインはありません。

## 📱 使い方

1. **写真アップロード**: ブラウザでドラッグ＆ドロップ（複数可）
2. **AI解析**: 「🤖 全て解析」ボタンで一括処理
3. **レビュー**: 生成された説明文を確認・編集
4. **出品**:
   - メルカリ → 「📋 メルカリ用コピー」→ アプリで貼り付け
   - ジモティー → 「📥 CSV出力」→ 手動投稿 or 自動化

## 💰 コスト目安（1日利用）

| 項目 | 費用 |
|------|------|
| fly.io (shared-cpu, 2-3時間) | $0 (免除範囲内) |
| Claude API (50アイテム) | ~$0.50 |
| **合計** | **~¥75** |

## 📁 ファイル構成

```
bulk-lister/
├── fly.toml          # fly.io設定
├── Dockerfile        # コンテナ定義
├── deploy.sh         # デプロイスクリプト
├── package.json
└── src/
    ├── index.js          # エントリポイント
    ├── routes/
    │   └── api.js        # REST API
    ├── services/
    │   ├── db.js         # SQLite
    │   └── ai.js         # Claude Vision
    └── public/
        └── index.html    # フロントエンド SPA
```

## 🔌 API エンドポイント

| Method | Path | 説明 |
|--------|------|------|
| POST | `/api/upload` | 写真アップロード (multipart) |
| POST | `/api/analyze/:id` | 単体AI解析 |
| POST | `/api/analyze-all` | 一括AI解析 |
| GET | `/api/items` | アイテム一覧 |
| PUT | `/api/items/:id` | アイテム編集 |
| DELETE | `/api/items/:id` | アイテム削除 |
| GET | `/api/export/jimoty-csv` | ジモティーCSV出力 |

---

Built for Spiral Building cleanup day 🏢
