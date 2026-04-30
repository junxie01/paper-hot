#!/bin/bash

# Paper-hot GitHub 推送脚本
# 使用前请确保已配置好 SSH 密钥

set -e

echo "🚀 开始推送到 GitHub..."

# 检查是否已初始化 Git 仓库
if [ ! -d ".git" ]; then
    echo "📦 初始化 Git 仓库..."
    git init
fi

# 添加所有文件
echo "📝 添加文件到 Git..."
git add .

# 提交
echo "💬 请输入提交信息:"
read commit_message
if [ -z "$commit_message" ]; then
    commit_message="Update paper-hot"
fi

git commit -m "$commit_message" || true

# 检查是否已配置远程仓库
if ! git remote | grep -q "origin"; then
    echo "🔗 配置远程仓库..."
    git remote add origin git@github.com:$(git config user.name)/paper-hot.git || true
fi

# 推送到 GitHub
echo "🚀 推送到 GitHub (main 分支)..."
git branch -M main
git push -u origin main || git push origin main

echo "✅ 推送完成！"
