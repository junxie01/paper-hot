#!/bin/bash

echo "🚀 启动 PaperCite..."
echo ""
echo "📦 检查依赖..."
if [ ! -d "venv" ]; then
    echo "创建虚拟环境..."
    python3 -m venv venv
fi

source venv/bin/activate

echo "升级 pip..."
pip install --upgrade pip -q

echo "安装依赖..."
pip install -r requirements.txt

echo ""
echo "🌐 启动服务..."
echo "访问地址: http://localhost:8000"
echo ""

uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
