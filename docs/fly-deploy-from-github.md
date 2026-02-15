# fly.io「Deploy from GitHub」でエラーになる場合の設定

## フォームで必ず合わせる値

| 項目 | 間違いやすい値 | 正しい値 |
|------|----------------|----------|
| **Region** | ams (Amsterdam) | **nrt (Tokyo)** |
| **Memory** | 256MB | **512MB** |
| **Internal port** | 8080 | 8080 のままでOK |

Volume は **nrt** に作る必要があるため、Region は必ず **nrt** にしてください。

## デプロイ後の必須設定（どれか忘れるとエラーになります）

### 1. Secret: ANTHROPIC_API_KEY

- Dashboard → **bulk-lister** → **Secrets**
- **Set secret**: 名前 `ANTHROPIC_API_KEY`、値は [Anthropic Console](https://console.anthropic.com/) で発行したキー（`sk-ant-...`）

### 2. Volume: lister_data

- Dashboard → **bulk-lister** → **Volumes**
- **Create Volume**
  - Name: `lister_data`
  - Region: **nrt (Tokyo)**（アプリと同じリージョン）
  - Size: 1 GB
  - Mount path: `/data`

Volume を作らないと `/data` に書き込めず、アプリが起動時に落ちます。

### 3. メモリが 256MB のままの場合

- Dashboard → **bulk-lister** → **Metrics** の横あたり、または **Settings** で VM サイズを **512MB** に変更
- または CLI: `fly scale memory 512 -a bulk-lister`

---

## 手順のおすすめ順

1. **Deploy** で一度デプロイ（Region を **nrt**、Memory を **512MB** にしてから）
2. デプロイ完了後、**Secrets** で `ANTHROPIC_API_KEY` を設定
3. **Volumes** で `lister_data`（nrt, 1GB, マウント `/data`）を作成
4. 必要なら **Restart** またはもう一度 **Deploy** して反映

これで「Deploy from GitHub」のエラーは解消する想定です。
