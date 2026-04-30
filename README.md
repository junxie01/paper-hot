# PaperCite - 计量文献学统计工具

一个基于 OpenAlex API 的文献搜索、数据统计和可视化工具。

## 功能特性

- 🔍 按关键词搜索文献（OpenAlex API）
- 📊 年度发表与被引趋势分析
- 📚 期刊分布统计
- 🌍 作者国家分布
- 👥 高产作者和高被引作者分析
- 🏷️ 关键词热点分析
- 🕸️ 作者合作网络可视化
- 📄 论文列表与PDF下载
- 📤 CSV文件上传分析
- 📦 批量下载打包成ZIP

## 快速开始（跨平台）

### 前置要求

- Python 3.7 或更高版本
- 能访问互联网（用于调用 OpenAlex API）

### macOS 用户

```bash
# 双击运行或在终端执行
./start_mac.sh
```

### Windows 用户

```cmd
# 双击运行或在命令行执行
start_windows.bat
```

### Linux 用户

```bash
# 赋予执行权限并运行
chmod +x start_linux.sh
./start_linux.sh
```

### 访问应用

启动后，浏览器访问：
```
http://localhost:8000/paper-hot
```

## 手动运行（如果脚本不工作）

### 1. 创建虚拟环境

```bash
# macOS/Linux
python3 -m venv venv
source venv/bin/activate

# Windows
python -m venv venv
venv\Scripts\activate.bat
```

### 2. 安装依赖

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 3. 启动服务

```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

## 项目结构

```
paper_hot/
├── backend/
│   └── main.py          # 后端 API
├── frontend/
│   ├── index.html       # 前端页面
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── app.js       # 前端逻辑
├── data/
│   ├── raw/             # 原始数据
│   ├── processed/       # 处理后数据
│   └── papers/          # 下载的 PDF
├── requirements.txt
├── start_mac.sh         # macOS 启动脚本
├── start_windows.bat    # Windows 启动脚本
├── start_linux.sh       # Linux 启动脚本
└── push_to_github.sh    # GitHub 推送脚本
```

## 部署到服务器

如果你想部署到自己的服务器（如 seis-jun.xyz），可以使用 Nginx 反向代理。

参考配置见 `nginx.conf` 文件。

## 数据来源

本项目使用 [OpenAlex](https://openalex.org/) 免费 API 提供的文献数据，不需要 API Key。
