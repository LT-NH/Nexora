@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ========================================
echo   Nexora - 一键启动 (Windows)
echo ========================================

cd /d "%~dp0backend"

echo.
echo [1/2] 安装 Python 依赖...
pip install -r requirements.txt -q

echo [2/2] 启动服务...
echo.
echo ========================================
echo   服务已启动！
echo   打开浏览器访问: http://localhost:8000
echo   API 文档: http://localhost:8000/docs
echo   按 Ctrl+C 停止服务
echo ========================================
echo.

uvicorn app.main:app --host 0.0.0.0 --port 8000

pause