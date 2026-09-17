#!/usr/bin/env bash
set -euo pipefail

# プロジェクトルートディレクトリに移動
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

echo "=================================================="
echo "Updating all skill submodules to latest commits..."
echo "=================================================="

# 各サブモジュールをリモートの最新ブランチから取得・マージ
git submodule update --init --recursive --remote --merge

echo ""
echo "Current submodule status:"
git submodule status

echo ""
echo "Skills updated successfully."
