#!/bin/bash
# ============================================
#  Nexora - 一键启动 (macOS / Linux)
# ============================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/backend"

echo "========================================"
echo "  Nexora - 启动中..."
echo "========================================"

# 检查 Python
if ! command -v python3 &> /dev/null; then
    echo "错误: 未找到 python3，请先安装 Python 3.10+"
    exit 1
fi

# 安装依赖
echo ""
echo "[1/2] 安装 Python 依赖..."
pip3 install -r requirements.txt --break-system-packages -q 2>/dev/null || \
pip3 install -r requirements.txt -q

# 启动服务
echo "[2/2] 启动服务..."
echo ""
echo "========================================"
echo "  服务已启动！"
echo "  打开浏览器访问: http://localhost:8000"
echo "  API 文档: http://localhost:8000/docs"
echo "  按 Ctrl+C 停止服务"
echo "========================================"
echo ""

uvicorn app.main:app --host 0.0.0.0 --port 8000