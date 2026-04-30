@echo off
REM Paper-hot Windows 启动脚本
chcp 65001 >nul
echo 🚀 启动 Paper-hot (Windows)...

REM 检查 Python 是否安装
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 错误: 未找到 Python，请先安装 Python3
    echo    可以从 https://www.python.org/downloads/ 下载
    pause
    exit /b 1
)

REM 创建虚拟环境（如果不存在）
if not exist "venv" (
    echo 📦 创建虚拟环境...
    python -m venv venv
)

REM 激活虚拟环境
echo 🔧 激活虚拟环境...
call venv\Scripts\activate.bat

REM 升级 pip
echo ⬆️  升级 pip...
python -m pip install --upgrade pip -q

REM 安装依赖
echo 📚 安装依赖...
pip install -r requirements.txt

if errorlevel 1 (
    echo ❌ 依赖安装失败
    pause
    exit /b 1
)

echo.
echo ✅ 准备完成！
echo 🌐 启动服务...
echo 📱 访问地址: http://localhost:8000/paper-hot
echo ⏹️  按 Ctrl+C 停止服务
echo.

REM 启动 FastAPI
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

pause
