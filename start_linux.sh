#!/bin/bash

# Paper-hot Linux 启动脚本
echo "🚀 启动 Paper-hot (Linux)..."

# 检查 Python3 是否安装
if ! command -v python3 &> /dev/null; then
    echo "❌ 错误: 未找到 Python3"
    echo "   Ubuntu/Debian: sudo apt install python3 python3-pip python3-venv"
    echo "   CentOS/RHEL: sudo yum install python3 python3-pip"
    exit 1
fi

# 创建虚拟环境（如果不存在）
if [ ! -d "venv" ]; then
    echo "📦 创建虚拟环境..."
    python3 -m venv venv
fi

# 激活虚拟环境
echo "🔧 激活虚拟环境..."
source venv/bin/activate

# 升级 pip
echo "⬆️  升级 pip..."
pip install --upgrade pip -q

# 安装依赖
echo "📚 安装依赖..."
pip install -r requirements.txt

if [ $? -ne 0 ]; then
    echo "❌ 依赖安装失败"
    exit 1
fi

echo ""
echo "✅ 准备完成！"
echo "🌐 启动服务..."
echo "📱 访问地址: http://localhost:8000/paper-hot"
echo "⏹️  按 Ctrl+C 停止服务"
echo ""

# 启动 FastAPI
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
