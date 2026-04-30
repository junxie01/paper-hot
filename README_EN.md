# PaperHot - Bibliometric Statistics Tool

A literature search, data statistics, and visualization tool based on the OpenAlex API.

## Features

- 🔍 Search literature by keywords (OpenAlex API)
- 📊 Annual publication and citation trend analysis
- 📚 Journal distribution statistics
- 🌍 Author country distribution
- 👥 High-yield and highly cited authors analysis
- 🏷️ Hot keyword analysis
- 🕸️ Author collaboration network visualization
- 📄 Paper list and PDF download
- 📤 CSV file upload analysis
- 📦 Batch download packaged as ZIP

## Quick Start (Cross-Platform)

### Prerequisites

- Python 3.7 or higher
- Internet access (for OpenAlex API calls)

### macOS Users

```bash
# Double-click or run in terminal
./start_mac.sh
```

### Windows Users

```cmd
# Double-click or run in command prompt
start_windows.bat
```

### Linux Users

```bash
# Give execute permission and run
chmod +x start_linux.sh
./start_linux.sh
```

### Access the App

After starting, open in browser:
```
http://localhost:8000/paper-hot
```

## Manual Run (If Scripts Don't Work)

### 1. Create Virtual Environment

```bash
# macOS/Linux
python3 -m venv venv
source venv/bin/activate

# Windows
python -m venv venv
venv\Scripts\activate.bat
```

### 2. Install Dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 3. Start Service

```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

## Project Structure

```
paper_hot/
├── backend/
│   └── main.py          # Backend API
├── frontend/
│   ├── index.html       # Frontend page
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── app.js       # Frontend logic
├── data/
│   ├── raw/             # Raw data
│   ├── processed/       # Processed data
│   └── papers/          # Downloaded PDFs
├── requirements.txt
├── start_mac.sh         # macOS startup script
├── start_windows.bat    # Windows startup script
├── start_linux.sh       # Linux startup script
└── push_to_github.sh    # GitHub push script
```

## Deploy to Server

If you want to deploy to your own server (like seis-jun.xyz), you can use Nginx reverse proxy.

See `nginx.conf` file for reference configuration.

## Data Source

This project uses [OpenAlex](https://openalex.org/) free API for literature data, no API Key required.

## Preparing Your Own CSV

You can use `example.csv` as a reference. Your CSV should include these columns:

- `title`: Paper title
- `authors`: Authors (separated by ;)
- `journal`: Journal name
- `year`: Publication year
- `cited_by_count`: Number of citations
- `concepts`: Keywords (separated by ;)
- `countries`: Countries (separated by ;)
- `pdf_url`: PDF download link (optional)
