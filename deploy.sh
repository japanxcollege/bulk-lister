#!/bin/bash
# ========================================
# Bulk Lister - fly.io デプロイスクリプト
# ========================================
set -e

echo "🚀 Bulk Lister デプロイ開始"
echo ""

# 1. fly CLI チェック
if ! command -v fly &> /dev/null; then
  echo "❌ flyctl が見つかりません"
  echo "   インストール: curl -L https://fly.io/install.sh | sh"
  exit 1
fi

# 2. ログインチェック
if ! fly auth whoami &> /dev/null; then
  echo "🔐 fly.io にログインしてください"
  fly auth login
fi

# 3. アプリ作成（初回のみ）
if ! fly apps list | grep -q "bulk-lister"; then
  echo "📦 アプリを作成します..."
  fly apps create bulk-lister
fi

# 4. ボリューム作成（初回のみ）
if ! fly volumes list -a bulk-lister 2>/dev/null | grep -q "lister_data"; then
  echo "💾 永続ボリュームを作成します..."
  fly volumes create lister_data --region nrt --size 1 -a bulk-lister
fi

# 5. シークレット設定
echo ""
echo "🔑 Anthropic API キーを設定します"
if [ -z "$ANTHROPIC_API_KEY" ]; then
  read -p "ANTHROPIC_API_KEY を入力: " API_KEY
  fly secrets set ANTHROPIC_API_KEY="$API_KEY" -a bulk-lister
else
  fly secrets set ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" -a bulk-lister
fi

# 6. デプロイ
echo ""
echo "🏗️  デプロイ中..."
fly deploy

echo ""
echo "✅ デプロイ完了！"
echo "🌐 URL: https://bulk-lister.fly.dev"
echo ""
echo "📊 ステータス確認: fly status -a bulk-lister"
echo "📝 ログ確認:       fly logs -a bulk-lister"
echo "🛑 停止:           fly machine stop -a bulk-lister"
