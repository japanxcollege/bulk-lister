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
- **Deploy**: fly.io (Tokyo リージョン) または **Vercel**（無料枠あり、写真は少なめ）

## 🚀 デプロイ手順

### Vercel でホスト（おすすめ・無料枠で運用）

fly.io の $38 プランを使わず、**Vercel の無料枠**で動かせます。写真は **Vercel Blob** に保存（無料枠内で少なめに使う想定）です。

1. **Vercel にプロジェクトをインポート**
   - [vercel.com](https://vercel.com) でログイン → **Add New** → **Project** → GitHub の **japanxcollege/bulk-lister** を選択
   - Framework は **Other** のままで OK → **Deploy** はまだ押さない

2. **ストレージを追加（Dashboard で）**
   - プロジェクトの **Storage** タブ → **Create Database** → **Postgres**（Vercel Postgres）を追加
   - 同じく **Create Store** → **Blob** を追加  
   → これで `POSTGRES_URL` と `BLOB_READ_WRITE_TOKEN` が自動で環境変数に入ります

3. **環境変数を設定**
   - プロジェクト **Settings** → **Environment Variables**
   - `ANTHROPIC_API_KEY` = [Anthropic Console](https://console.anthropic.com/) で発行したキー（`sk-ant-...`）を追加

4. **Deploy**
   - **Deploy** を実行。完了後、`https://bulk-lister-xxx.vercel.app` でアクセスできます。

**注意**
- 写真は **Vercel Blob** に保存されます。無料枠（1GB など）を超えると課金になるので、**そんなに保存しない**運用にすると安心です。
- リクエスト body の制限（約 4.5MB）のため、一度に上げる写真は少なめにしてください。

### 前提条件
- [flyctl](https://fly.io/docs/flyctl/install/) インストール済み
- [Anthropic API Key](https://console.anthropic.com/) 取得済み
- クレジットカード登録済み (fly.io)

### GitHub からローンチ（japanxcollege@gmail.com）

1. **GitHub にリポジトリを作る**
   - [github.com](https://github.com) に **japanxcollege@gmail.com** でサインイン
   - 「New repository」→ 名前は `bulk-lister`（任意）→ Create repository（README 等は追加しない）

2. **このフォルダを GitHub に push**
   ```bash
   cd "/Users/shuta/Downloads/Bulk Lister v2"
   git remote add origin https://github.com/<あなたのユーザー名>/bulk-lister.git
   git push -u origin main
   ```
   ※ `<あなたのユーザー名>` は japanxcollege の GitHub ユーザー名に置き換え。初回 push で GitHub のログインを求められたら japanxcollege@gmail.com で認証。

3. **fly.io で GitHub からデプロイ**
   - [fly.io Dashboard](https://fly.io/dashboard) を開く
   - 「Sign in」→ **GitHub** を選び、**japanxcollege@gmail.com** の GitHub アカウントでログイン
   - 「Launch app」→ **Deploy from GitHub** を選択
   - リポジトリ一覧から `bulk-lister` を選び、ブランチ `main`、ビルドは自動検出
   - アプリ名を `bulk-lister` にし、リージョン **Nrt (Tokyo)** を選択してデプロイ
   - デプロイ後、**Secrets** で `ANTHROPIC_API_KEY` を設定（取得方法は下記）
   - **Volumes** で `lister_data`（1GB、Nrt）を作成し、マウント先 `/data` を設定（fly.toml の `[mounts]` と一致させる）。Volume は「取ってくる」のではなく **fly.io 上で新規作成** する（手順は下記）

4. **CLI で既存アプリに合わせる場合（任意）**
   - すでに `fly launch` や `./deploy.sh` で `bulk-lister` を作っている場合は、このリポジトリを clone したあと `fly deploy` するだけでも更新できます。

### ANTHROPIC_API_KEY の取り方

**「取ってくる」= Anthropic のサイトで API キーを 1 つ発行します。**

1. [Anthropic Console](https://console.anthropic.com/) を開く
2. アカウントでログイン（なければサインアップ）
3. 左メニューや設定から **「API Keys」** を開く
4. **「Create Key」** で新しいキーを作成
5. 表示されたキー（`sk-ant-api03-...` のような文字列）を **一度だけ** コピーして保存（再表示されないため）
6. fly.io ではこの値を **Secrets** に登録する（下記「fly.io での設定」参照）

※ 課金は利用量に応じて発生します。料金は [Anthropic の料金ページ](https://www.anthropic.com/pricing) を参照。

### Volumes（lister_data）の作り方

**「取ってくる」ものではなく、fly.io 上でボリュームを新規作成します。** 写真や SQLite の DB を保存するためのディスクです。

- **Dashboard の場合**
  1. [fly.io Dashboard](https://fly.io/dashboard) → アプリ **bulk-lister** を開く
  2. 左の **「Volumes」** をクリック
  3. **「Create Volume」** → 名前 `lister_data`、リージョン **Nrt (Tokyo)**、サイズ **1 GB**、マウントパス **`/data`** で作成

- **CLI の場合**
  ```bash
  fly volumes create lister_data --region nrt --size 1 -a bulk-lister
  ```
  作成後、fly.toml の `[mounts]` のとおり `/data` にマウントされます（デプロイ時に自動で紐づく場合があります。紐づいていなければ Dashboard の Volumes でマウント先を `/data` に設定）。

### fly.io での設定まとめ（Secrets と Volume）

| 項目 | 取り方・作り方 | fly.io での設定場所 |
|------|----------------|----------------------|
| **ANTHROPIC_API_KEY** | [Anthropic Console](https://console.anthropic.com/) → API Keys → Create Key で発行 | Dashboard → bulk-lister → **Secrets** → `ANTHROPIC_API_KEY` を追加。または CLI: `fly secrets set ANTHROPIC_API_KEY=sk-ant-... -a bulk-lister` |
| **lister_data** | 外部から取得しない。fly.io 上で新規作成 | Dashboard → bulk-lister → **Volumes** → Create Volume（名前 `lister_data`、リージョン Nrt、1GB、マウント `/data`）。または CLI: `fly volumes create lister_data --region nrt --size 1 -a bulk-lister` |

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
