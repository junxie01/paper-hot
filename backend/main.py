from fastapi import FastAPI, HTTPException, UploadFile, File, Request, Header
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import requests
import pandas as pd
import numpy as np
import networkx as nx
import os
import json
import zipfile
from pathlib import Path
import asyncio
from concurrent.futures import ThreadPoolExecutor
import uuid
import shutil
from datetime import datetime
import io
import re
import unicodedata
import secrets


class CustomJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        try:
            if pd.isna(obj):
                return None
        except Exception:
            pass
        if isinstance(obj, np.floating):
            if np.isnan(obj):
                return None
            if np.isinf(obj):
                return None
            return float(obj)
        if isinstance(obj, np.integer):
            return int(obj)
        return super().default(obj)


def safe_json_response(data: Dict):
    return json.loads(json.dumps(data, cls=CustomJSONEncoder))


app = FastAPI(title="PaperHot - 计量文献学统计工具")
base_prefix = "/paper-hot"
SESSION_COOKIE_NAME = "paperhot_session"
SESSION_MAX_AGE = 60 * 60 * 24 * 180
SESSION_ID_RE = re.compile(r"^[a-f0-9]{32}$")
ADMIN_PASSWORD_ENV = "PAPERHOT_ADMIN_PASSWORD"

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
RAW_DATA_DIR = DATA_DIR / "raw"
PROCESSED_DATA_DIR = DATA_DIR / "processed"
BACKUP_DATA_DIR = PROCESSED_DATA_DIR / "backups"
PAPERS_DIR = DATA_DIR / "papers"
SESSIONS_DATA_DIR = DATA_DIR / "sessions"
FRONTEND_DIR = BASE_DIR / "frontend"

RAW_DATA_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DATA_DIR.mkdir(parents=True, exist_ok=True)
BACKUP_DATA_DIR.mkdir(parents=True, exist_ok=True)
PAPERS_DIR.mkdir(parents=True, exist_ok=True)
SESSIONS_DATA_DIR.mkdir(parents=True, exist_ok=True)

app.mount(f"{base_prefix}/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.middleware("http")
async def attach_session_cookie(request: Request, call_next):
    session_id = request.cookies.get(SESSION_COOKIE_NAME, "")
    if not SESSION_ID_RE.fullmatch(session_id):
        session_id = uuid.uuid4().hex

    request.state.session_id = session_id
    response = await call_next(request)

    if request.url.path == "/" or request.url.path.startswith(base_prefix):
        response.set_cookie(
            SESSION_COOKIE_NAME,
            session_id,
            max_age=SESSION_MAX_AGE,
            httponly=True,
            samesite="lax",
            path="/",
        )

    return response

PAPER_COLUMNS = [
    "id",
    "doi",
    "title",
    "journal",
    "year",
    "publication_date",
    "authors",
    "affiliations",
    "countries",
    "cited_by_count",
    "references_count",
    "references",
    "concepts",
    "abstract",
    "type",
    "is_open_access",
    "pdf_url",
]

class SearchRequest(BaseModel):
    keyword: str
    max_results: int = 500
    start_year: Optional[int] = None
    end_year: Optional[int] = None

class TitleSearchRequest(BaseModel):
    title: str
    max_results: int = 8

class DeletePapersRequest(BaseModel):
    indices: List[int]

class AppendPapersRequest(BaseModel):
    papers: List[Dict[str, Any]]

def get_session_id(request: Request) -> str:
    session_id = getattr(request.state, "session_id", "")
    if not SESSION_ID_RE.fullmatch(session_id):
        raise HTTPException(status_code=400, detail="Invalid session")
    return session_id

def get_session_paths(session_id: str) -> Dict[str, Path]:
    if not SESSION_ID_RE.fullmatch(session_id):
        raise HTTPException(status_code=400, detail="Invalid session")

    session_root = SESSIONS_DATA_DIR / session_id
    raw_dir = session_root / "raw"
    processed_dir = session_root / "processed"
    backup_dir = processed_dir / "backups"
    papers_dir = session_root / "papers"

    raw_dir.mkdir(parents=True, exist_ok=True)
    processed_dir.mkdir(parents=True, exist_ok=True)
    backup_dir.mkdir(parents=True, exist_ok=True)
    papers_dir.mkdir(parents=True, exist_ok=True)

    return {
        "root": session_root,
        "raw": raw_dir,
        "processed": processed_dir,
        "backups": backup_dir,
        "papers": papers_dir,
    }

def get_request_paths(request: Request) -> Dict[str, Path]:
    return get_session_paths(get_session_id(request))

def get_csv_path(filename: str, raw_dir: Optional[Path] = None) -> Path:
    safe_name = Path(filename).name
    if not safe_name or safe_name != filename or not safe_name.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Invalid CSV filename")
    return (raw_dir or RAW_DATA_DIR) / safe_name

def get_unique_csv_path(filename: str, raw_dir: Path) -> tuple[str, Path]:
    csv_path = get_csv_path(filename, raw_dir)
    if not csv_path.exists():
        return filename, csv_path

    path = Path(filename)
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    unique_name = f"{path.stem}_{timestamp}_{uuid.uuid4().hex[:6]}{path.suffix}"
    return unique_name, get_csv_path(unique_name, raw_dir)

def get_admin_raw_dir(owner_id: str) -> Path:
    if owner_id == "legacy":
        return RAW_DATA_DIR
    if SESSION_ID_RE.fullmatch(owner_id):
        return SESSIONS_DATA_DIR / owner_id / "raw"
    raise HTTPException(status_code=400, detail="Invalid owner")

def verify_admin_password(password: Optional[str]) -> None:
    expected = os.environ.get(ADMIN_PASSWORD_ENV, "")
    if not expected:
        raise HTTPException(status_code=503, detail="Admin password is not configured")
    if not password or not secrets.compare_digest(password, expected):
        raise HTTPException(status_code=401, detail="Invalid admin password")

def count_csv_rows(csv_path: Path) -> int:
    try:
        with open(csv_path, "r", encoding="utf-8-sig", errors="ignore") as handle:
            return max(sum(1 for _ in handle) - 1, 0)
    except Exception:
        return 0

def build_file_record(csv_path: Path, owner_id: str, owner_label: str) -> Dict[str, Any]:
    stat = csv_path.stat()
    return {
        "owner_id": owner_id,
        "owner_label": owner_label,
        "filename": csv_path.name,
        "size": stat.st_size,
        "rows": count_csv_rows(csv_path),
        "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds"),
    }

def normalize_open_access(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    return text in {"true", "1", "yes", "y", "open", "oa"}

def clean_text(value: Any) -> str:
    if pd.isna(value):
        return ""
    text = unicodedata.normalize("NFKC", str(value)).strip()
    text = re.sub(r"\s+", " ", text)
    if text.lower() == "nan":
        return ""
    return text

def canonical_text(value: Any) -> str:
    return clean_text(value).casefold()

def split_values(value: Any) -> List[str]:
    return [clean_text(part) for part in str(value).split(";") if clean_text(part)]

def top_label_counts(values: List[str], label_key: str, top_n: int) -> List[Dict[str, Any]]:
    grouped: Dict[str, Dict[str, Any]] = {}
    for value in values:
        label = clean_text(value)
        key = canonical_text(label)
        if not key:
            continue
        if key not in grouped:
            grouped[key] = {"count": 0, "labels": {}}
        grouped[key]["count"] += 1
        grouped[key]["labels"][label] = grouped[key]["labels"].get(label, 0) + 1

    records = []
    for item in grouped.values():
        display_label = max(item["labels"].items(), key=lambda pair: (pair[1], len(pair[0])))[0]
        records.append({label_key: display_label, "count": item["count"]})

    records.sort(key=lambda row: (-row["count"], row[label_key].casefold()))
    return records[:top_n]

def normalize_papers_df(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    for column in PAPER_COLUMNS:
        if column not in df.columns:
            df[column] = ""

    df = df[PAPER_COLUMNS]
    df["cited_by_count"] = pd.to_numeric(df["cited_by_count"], errors="coerce").fillna(0).astype(int)
    df["references_count"] = pd.to_numeric(df["references_count"], errors="coerce").fillna(0).astype(int)
    df["year"] = pd.to_numeric(df["year"], errors="coerce").astype("Int64")
    df["references"] = df["references"].apply(lambda value: "[]" if pd.isna(value) or str(value).strip() == "" else value)
    df["is_open_access"] = df["is_open_access"].apply(normalize_open_access)
    text_columns = [
        "id",
        "doi",
        "title",
        "journal",
        "publication_date",
        "authors",
        "affiliations",
        "countries",
        "references",
        "concepts",
        "abstract",
        "type",
        "pdf_url",
    ]
    for column in text_columns:
        df[column] = df[column].fillna("").astype(str)
    return df

def read_papers_csv(filename: str, raw_dir: Optional[Path] = None) -> pd.DataFrame:
    csv_path = get_csv_path(filename, raw_dir)
    if not csv_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return normalize_papers_df(pd.read_csv(csv_path))

def backup_csv_file(csv_path: Path, backup_dir: Optional[Path] = None) -> Optional[Path]:
    if not csv_path.exists():
        return None
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    backup_name = f"{csv_path.stem}_{timestamp}_{uuid.uuid4().hex[:6]}.csv"
    target_backup_dir = backup_dir or BACKUP_DATA_DIR
    target_backup_dir.mkdir(parents=True, exist_ok=True)
    backup_path = target_backup_dir / backup_name
    shutil.copy2(csv_path, backup_path)
    return backup_path

def write_papers_csv(
    filename: str,
    df: pd.DataFrame,
    create_backup: bool = True,
    raw_dir: Optional[Path] = None,
    backup_dir: Optional[Path] = None,
) -> Optional[Path]:
    csv_path = get_csv_path(filename, raw_dir)
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    backup_path = backup_csv_file(csv_path, backup_dir) if create_backup else None
    normalized_df = normalize_papers_df(df)
    normalized_df.to_csv(csv_path, index=False, encoding="utf-8-sig")
    return backup_path

def normalize_doi(value: Any) -> str:
    text = str(value).strip().lower()
    if not text or text == "nan":
        return ""
    return text.replace("https://doi.org/", "").replace("http://doi.org/", "")

def normalize_title(value: Any) -> str:
    text = str(value).strip().lower()
    if not text or text == "nan":
        return ""
    return " ".join(text.split())

def paper_identity(row: pd.Series) -> Optional[str]:
    openalex_id = str(row.get("id", "")).strip().lower()
    if openalex_id and openalex_id != "nan":
        return f"id:{openalex_id}"

    doi = normalize_doi(row.get("doi", ""))
    if doi:
        return f"doi:{doi}"

    title = normalize_title(row.get("title", ""))
    if title:
        return f"title:{title}"

    return None

def dedupe_papers(df: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    seen = set()
    rows = []
    skipped = 0
    for _, row in normalize_papers_df(df).iterrows():
        identity = paper_identity(row)
        if identity and identity in seen:
            skipped += 1
            continue
        if identity:
            seen.add(identity)
        rows.append(row)
    return pd.DataFrame(rows, columns=PAPER_COLUMNS).reset_index(drop=True), skipped

def parse_references(value: Any) -> List[str]:
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    if pd.isna(value):
        return []
    text = str(value).strip()
    if not text or text == "nan":
        return []
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return [str(item) for item in parsed if str(item).strip()]
    except Exception:
        pass
    return [part.strip() for part in text.split(";") if part.strip()]

def get_total_stats(df: pd.DataFrame) -> Dict[str, int]:
    journals = {
        canonical_text(journal)
        for journal in df["journal"].dropna()
        if canonical_text(journal)
    }

    authors = set()
    for authors_text in df["authors"].dropna():
        for author in split_values(authors_text):
            authors.add(canonical_text(author))

    return {
        "total_papers": int(len(df)),
        "total_citations": int(pd.to_numeric(df["cited_by_count"], errors="coerce").fillna(0).sum()),
        "total_journals": int(len(journals)),
        "total_authors": int(len(authors)),
    }

@app.get(base_prefix)
@app.get(f"{base_prefix}/")
async def read_root():
    return FileResponse(str(FRONTEND_DIR / "index.html"))

@app.get(f"{base_prefix}/admin")
async def read_admin():
    return FileResponse(str(FRONTEND_DIR / "admin.html"))

@app.get("/")
async def read_root_redirect():
    return FileResponse(str(FRONTEND_DIR / "index.html"))

@app.post(f"{base_prefix}/api/search")
async def search_papers(payload: SearchRequest, request: Request):
    try:
        paths = get_request_paths(request)
        max_results = max(1, min(payload.max_results, 5000))
        papers = fetch_from_openalex(
            keyword=payload.keyword,
            max_results=max_results,
            start_year=payload.start_year,
            end_year=payload.end_year
        )
        
        df = pd.DataFrame(papers)
        safe_keyword = "".join(
            c if c.isalnum() or c in (" ", "-", "_") else "_"
            for c in payload.keyword
        ).strip().replace(" ", "_")
        if not safe_keyword:
            safe_keyword = f"search_{uuid.uuid4().hex[:8]}"
        filename = f"{safe_keyword}_papers.csv"
        filename, csv_path = get_unique_csv_path(filename, paths["raw"])
        write_papers_csv(filename, df, create_backup=False, raw_dir=paths["raw"], backup_dir=paths["backups"])
        
        result = {
            "success": True,
            "count": len(papers),
            "papers": papers,
            "csv_path": str(csv_path)
        }
        return safe_json_response(result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def fetch_from_openalex(keyword: str, max_results: int, start_year: Optional[int], end_year: Optional[int]):
    papers = []
    per_page = 200
    page = 1
    
    base_url = "https://api.openalex.org/works"
    
    filters = [f"title_and_abstract.search:{keyword}"]
    if start_year:
        filters.append(f"from_publication_date:{start_year}-01-01")
    if end_year:
        filters.append(f"to_publication_date:{end_year}-12-31")
    
    filter_str = ",".join(filters)
    
    while len(papers) < max_results:
        params = {
            "filter": filter_str,
            "per-page": min(per_page, max_results - len(papers)),
            "page": page
        }
        
        response = requests.get(base_url, params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        if not data.get("results"):
            break
            
        for work in data["results"]:
            paper = extract_paper_info(work)
            papers.append(paper)
            
        page += 1
        if len(data["results"]) < per_page:
            break
            
    return papers[:max_results]

def search_title_from_openalex(title: str, max_results: int = 8) -> List[Dict[str, Any]]:
    base_url = "https://api.openalex.org/works"
    params = {
        "filter": f"title.search:{title}",
        "per-page": max(1, min(max_results, 25))
    }
    response = requests.get(base_url, params=params, timeout=30)
    response.raise_for_status()
    data = response.json()
    return [extract_paper_info(work) for work in data.get("results", [])]

@app.post(f"{base_prefix}/api/title-search")
async def title_search(request: TitleSearchRequest):
    try:
        if not request.title.strip():
            raise HTTPException(status_code=400, detail="Title is required")

        papers = search_title_from_openalex(request.title.strip(), request.max_results)
        result = {"success": True, "count": len(papers), "papers": papers}
        return safe_json_response(result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def extract_paper_info(work: Dict[str, Any]) -> Dict[str, Any]:
    authors = []
    affiliations = []
    countries = []
    
    try:
        for auth in work.get("authorships", []):
            author = auth.get("author", {})
            if author and author.get("display_name"):
                authors.append(author["display_name"])
            
            for aff in auth.get("affiliations", []):
                if aff.get("display_name"):
                    affiliations.append(aff["display_name"])
            
            for country in auth.get("countries", []):
                if country:
                    countries.append(country)
    except Exception:
        pass
    
    cited_by = work.get("cited_by_count", 0)
    references = work.get("referenced_works", [])
    
    concepts = []
    try:
        concepts = [c["display_name"] for c in work.get("concepts", [])[:10] if c.get("display_name")]
    except Exception:
        pass
    
    open_access = work.get("open_access", {}) or {}
    
    # 获取期刊名称，尝试多个可能的字段
    journal_name = ""
    try:
        # 1. 尝试 host_venue
        host_venue = work.get("host_venue")
        if host_venue and isinstance(host_venue, dict):
            journal_name = host_venue.get("display_name", "")
            if not journal_name:
                journal_name = host_venue.get("title", "")
            if not journal_name:
                journal_name = host_venue.get("venue", "")
        
        # 2. 如果host_venue没有，尝试 primary_location
        if not journal_name:
            primary_loc = work.get("primary_location")
            if primary_loc and isinstance(primary_loc, dict):
                source = primary_loc.get("source")
                if source and isinstance(source, dict):
                    journal_name = source.get("display_name", "")
                    
        # 3. 如果还是没有，可能是预印本或者其他类型
        if not journal_name:
            work_type = work.get("type", "")
            if work_type == "preprint":
                journal_name = "Preprint"
            else:
                journal_name = "Unknown Journal"
                
    except Exception:
        journal_name = "Unknown Journal"
    
    return {
        "id": work.get("id", ""),
        "doi": work.get("doi", ""),
        "title": work.get("title", ""),
        "journal": journal_name,
        "year": work.get("publication_year", ""),
        "publication_date": work.get("publication_date", ""),
        "authors": "; ".join(authors),
        "affiliations": "; ".join(list(set(affiliations))),
        "countries": "; ".join(list(set(countries))),
        "cited_by_count": cited_by,
        "references_count": len(references),
        "references": json.dumps(references),
        "concepts": "; ".join(concepts),
        "abstract": work.get("abstract", ""),
        "type": work.get("type", ""),
        "is_open_access": open_access.get("is_oa", False),
        "pdf_url": open_access.get("oa_url", "")
    }

@app.post(f"{base_prefix}/api/upload")
async def upload_csv(request: Request, file: UploadFile = File(...)):
    try:
        paths = get_request_paths(request)
        original_name = Path(file.filename or "upload.csv").name
        if not original_name.lower().endswith('.csv'):
            raise HTTPException(status_code=400, detail="Only CSV files are allowed")
        
        file_uuid = str(uuid.uuid4())[:8]
        safe_filename = f"upload_{file_uuid}_{original_name.replace(' ', '_')}"
        safe_filename, csv_path = get_unique_csv_path(safe_filename, paths["raw"])
        
        contents = await file.read()
        with open(csv_path, 'wb') as f:
            f.write(contents)
        
        result = {
            "success": True,
            "filename": safe_filename,
            "message": "File uploaded successfully"
        }
        return safe_json_response(result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get(base_prefix + "/api/analysis/{filename}")
async def get_analysis(filename: str, request: Request, author_count: int = 50):
    try:
        paths = get_request_paths(request)
        df = read_papers_csv(filename, paths["raw"])
        
        analysis = {
            "total_stats": get_total_stats(df),
            "yearly_stats": get_yearly_stats(df),
            "journal_stats": get_journal_stats(df),
            "country_stats": get_country_stats(df),
            "author_stats": get_author_stats(df, author_count),
            "top_cited_authors": get_top_cited_authors(df),
            "concept_stats": get_concept_stats(df),
            "citation_stats": get_citation_stats(df)
        }
        
        result = {"success": True, "analysis": analysis}
        return safe_json_response(result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def get_yearly_stats(df):
    yearly = df.groupby("year").size().sort_index().reset_index(name="count")
    yearly["citations"] = df.groupby("year")["cited_by_count"].sum().values
    # 处理掉NaN值
    yearly = yearly.fillna(0)
    records = yearly.to_dict("records")
    # 确保没有NaN或inf值
    for r in records:
        for k, v in r.items():
            if pd.isna(v) or (isinstance(v, float) and (v == float('inf') or v == float('-inf'))):
                r[k] = 0
    return records

def get_journal_stats(df):
    journals = [clean_text(journal) for journal in df["journal"].dropna()]
    return top_label_counts(journals, "journal", 20)

def get_country_stats(df):
    all_countries = []
    for countries in df["countries"].dropna():
        all_countries.extend(split_values(countries))
    return top_label_counts(all_countries, "country", 20)

def get_author_stats(df, top_n=50):
    all_authors = []
    for authors in df["authors"].dropna():
        all_authors.extend(split_values(authors))
    return top_label_counts(all_authors, "author", top_n)

def get_concept_stats(df):
    all_concepts = []
    for concepts in df["concepts"].dropna():
        all_concepts.extend(split_values(concepts))
    return top_label_counts(all_concepts, "concept", 30)

def get_citation_stats(df):
    top_cited = df.nlargest(20, "cited_by_count")[["title", "authors", "year", "cited_by_count"]].copy()
    # 处理NaN值
    top_cited = top_cited.fillna("")
    # 转换数字类型
    for col in ["year", "cited_by_count"]:
        if col in top_cited.columns:
            top_cited[col] = pd.to_numeric(top_cited[col], errors='coerce').fillna(0)
    records = top_cited.to_dict("records")
    # 确保没有NaN值
    for r in records:
        for k, v in r.items():
            if pd.isna(v):
                if k in ["year", "cited_by_count"]:
                    r[k] = 0
                else:
                    r[k] = ""
    return records

def get_top_cited_authors(df):
    author_data = []
    df, _ = dedupe_papers(df)
    
    for idx, row in df.iterrows():
        authors_str = str(row.get("authors", ""))
        if not authors_str or authors_str == "nan":
            continue
            
        authors = split_values(authors_str)
        if not authors:
            continue
            
        # 只取第一作者
        first_author = authors[0]
        
        cited_by = row.get("cited_by_count", 0)
        # 确保cited_by是数字
        try:
            cited_by = int(float(cited_by))
        except (ValueError, TypeError):
            cited_by = 0
        
        author_data.append({
            "author": first_author,
            "author_key": canonical_text(first_author),
            "cited_by": cited_by
        })
    
    if not author_data:
        return []
        
    df_authors = pd.DataFrame(author_data)
    
    # 按作者分组聚合
    author_stats = df_authors.groupby("author_key").agg({
        "author": lambda values: max(values.value_counts().items(), key=lambda pair: (pair[1], len(pair[0])))[0],
        "author_key": "count",
        "cited_by": ["sum", "max"]
    }).reset_index()
    
    # 重新命名列
    author_stats.columns = ["author_key", "author", "paper_count", "total_citations", "max_citations"]
    author_stats["avg_citations"] = author_stats["total_citations"] / author_stats["paper_count"]
    
    # 按总被引排序，取前20
    author_stats = author_stats.sort_values("total_citations", ascending=False).head(20)
    
    # 转换为字典列表
    result = []
    for idx, row in author_stats.iterrows():
        result.append({
            "author": str(row["author"]),
            "paper_count": int(row["paper_count"]),
            "total_citations": int(row["total_citations"]),
            "max_citations": int(row["max_citations"]),
            "avg_citations": float(row["avg_citations"])
        })
    
    return result

@app.get(base_prefix + "/api/network/{filename}")
async def get_network(filename: str, request: Request):
    try:
        paths = get_request_paths(request)
        df = read_papers_csv(filename, paths["raw"])
        network_data = build_coauthorship_network(df)
        
        result = {"success": True, "network": network_data}
        return safe_json_response(result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def build_coauthorship_network(df):
    G = nx.Graph()
    
    for idx, row in df.iterrows():
        authors = str(row["authors"]).split(";")
        authors = [a.strip() for a in authors if a.strip()]

        for author in authors:
            if author not in G:
                G.add_node(author, size=1)
            else:
                G.nodes[author]["size"] += 1
        
        for i, author1 in enumerate(authors):
            for author2 in authors[i+1:]:
                if G.has_edge(author1, author2):
                    G[author1][author2]["weight"] += 1
                else:
                    G.add_edge(author1, author2, weight=1)
    
    top_nodes = sorted(G.nodes(data=True), key=lambda x: x[1]["size"], reverse=True)[:100]
    top_node_names = [n[0] for n in top_nodes]
    G_sub = G.subgraph(top_node_names)
    
    nodes = []
    edges = []
    
    for node, attr in G_sub.nodes(data=True):
        nodes.append({"id": node, "name": node, "value": attr["size"]})
        
    for u, v, attr in G_sub.edges(data=True):
        edges.append({"source": u, "target": v, "value": attr["weight"]})
        
    return {"nodes": nodes, "edges": edges}

@app.get(base_prefix + "/api/citation-network/{filename}")
async def get_citation_network(filename: str, request: Request):
    try:
        paths = get_request_paths(request)
        df = read_papers_csv(filename, paths["raw"])
        network_data = build_citation_network(df)

        result = {"success": True, "network": network_data}
        return safe_json_response(result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def build_citation_network(df):
    nodes = []
    edges = []
    openalex_to_node = {}

    for idx, row in df.iterrows():
        openalex_id = str(row.get("id", "")).strip()
        node_id = openalex_id if openalex_id and openalex_id.lower() != "nan" else f"row_{idx}"
        if openalex_id and openalex_id.lower() != "nan":
            openalex_to_node[openalex_id] = node_id

        cited_by = row.get("cited_by_count", 0)
        try:
            cited_by = int(float(cited_by))
        except (ValueError, TypeError):
            cited_by = 0

        year = row.get("year", "")
        nodes.append({
            "id": node_id,
            "name": str(row.get("title", "")) or f"Untitled {idx + 1}",
            "title": str(row.get("title", "")),
            "authors": str(row.get("authors", "")),
            "journal": str(row.get("journal", "")),
            "year": "" if pd.isna(year) else str(year),
            "value": cited_by,
            "index": int(idx),
        })

    internal_citation_counts = {node["id"]: 0 for node in nodes}
    seen_edges = set()

    for idx, row in df.iterrows():
        source_openalex_id = str(row.get("id", "")).strip()
        source_node = source_openalex_id if source_openalex_id and source_openalex_id.lower() != "nan" else f"row_{idx}"
        for reference in parse_references(row.get("references", "")):
            target_node = openalex_to_node.get(reference)
            if not target_node or target_node == source_node:
                continue
            edge_key = (source_node, target_node)
            if edge_key in seen_edges:
                continue
            seen_edges.add(edge_key)
            internal_citation_counts[target_node] = internal_citation_counts.get(target_node, 0) + 1
            edges.append({
                "source": source_node,
                "target": target_node,
                "value": 1,
            })

    for node in nodes:
        node["internal_citations"] = internal_citation_counts.get(node["id"], 0)

    return {"nodes": nodes, "edges": edges}

@app.get(base_prefix + "/api/papers/{filename}")
async def get_papers_list(filename: str, request: Request):
    try:
        paths = get_request_paths(request)
        df = read_papers_csv(filename, paths["raw"])
        
        papers = []
        for idx, row in df.iterrows():
            has_pdf = pd.notna(row["pdf_url"]) and str(row["pdf_url"]).strip() != ""
            papers.append({
                "index": idx,
                "title": str(row.get("title", "")),
                "journal": str(row.get("journal", "")),
                "year": "" if pd.isna(row.get("year", "")) else str(row.get("year", "")),
                "authors": str(row.get("authors", "")),
                "cited_by_count": int(row.get("cited_by_count", 0)),
                "doi": str(row.get("doi", "")),
                "is_open_access": bool(row.get("is_open_access", False)),
                "pdf_url": str(row.get("pdf_url", "")),
                "has_pdf": has_pdf
            })
        
        result = {"success": True, "papers": papers}
        return safe_json_response(result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post(base_prefix + "/api/papers/{filename}/delete")
async def delete_papers(filename: str, payload: DeletePapersRequest, request: Request):
    try:
        paths = get_request_paths(request)
        df = read_papers_csv(filename, paths["raw"])
        valid_indices = sorted({idx for idx in payload.indices if 0 <= idx < len(df)})
        if not valid_indices:
            raise HTTPException(status_code=400, detail="No valid paper indices provided")

        updated_df = df.drop(index=valid_indices).reset_index(drop=True)
        backup_path = write_papers_csv(
            filename,
            updated_df,
            create_backup=True,
            raw_dir=paths["raw"],
            backup_dir=paths["backups"],
        )

        result = {
            "success": True,
            "deleted": len(valid_indices),
            "count": len(updated_df),
            "backup_path": str(backup_path) if backup_path else None,
        }
        return safe_json_response(result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post(base_prefix + "/api/papers/{filename}/append")
async def append_papers(filename: str, payload: AppendPapersRequest, request: Request):
    try:
        paths = get_request_paths(request)
        if not payload.papers:
            raise HTTPException(status_code=400, detail="No papers provided")

        current_df = read_papers_csv(filename, paths["raw"])
        incoming_df = normalize_papers_df(pd.DataFrame(payload.papers))
        combined_df = pd.concat([current_df, incoming_df], ignore_index=True)
        deduped_df, _ = dedupe_papers(combined_df)
        added = max(len(deduped_df) - len(current_df), 0)
        skipped = max(len(incoming_df) - added, 0)
        backup_path = write_papers_csv(
            filename,
            deduped_df,
            create_backup=True,
            raw_dir=paths["raw"],
            backup_dir=paths["backups"],
        )

        result = {
            "success": True,
            "added": added,
            "skipped": skipped,
            "count": len(deduped_df),
            "backup_path": str(backup_path) if backup_path else None,
        }
        return safe_json_response(result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post(base_prefix + "/api/papers/{filename}/append-csv")
async def append_csv_to_collection(filename: str, request: Request, file: UploadFile = File(...)):
    try:
        paths = get_request_paths(request)
        original_name = Path(file.filename or "upload.csv").name
        if not original_name.lower().endswith(".csv"):
            raise HTTPException(status_code=400, detail="Only CSV files are allowed")

        current_df = read_papers_csv(filename, paths["raw"])
        contents = await file.read()
        incoming_df = normalize_papers_df(pd.read_csv(io.BytesIO(contents)))
        combined_df = pd.concat([current_df, incoming_df], ignore_index=True)
        deduped_df, _ = dedupe_papers(combined_df)
        added = max(len(deduped_df) - len(current_df), 0)
        skipped = max(len(incoming_df) - added, 0)
        backup_path = write_papers_csv(
            filename,
            deduped_df,
            create_backup=True,
            raw_dir=paths["raw"],
            backup_dir=paths["backups"],
        )

        result = {
            "success": True,
            "added": added,
            "skipped": skipped,
            "count": len(deduped_df),
            "backup_path": str(backup_path) if backup_path else None,
        }
        return safe_json_response(result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post(base_prefix + "/api/download/{filename}")
async def download_papers(filename: str, request: Request):
    try:
        paths = get_request_paths(request)
        df = read_papers_csv(filename, paths["raw"])
        df = df[df["pdf_url"].notna() & (df["pdf_url"] != "")]
        
        # 创建临时目录
        temp_dir = paths["papers"] / f"temp_{uuid.uuid4().hex[:8]}"
        temp_dir.mkdir(parents=True, exist_ok=True)
        
        downloaded = []
        for idx, row in df.iterrows():
            try:
                if pd.notna(row["pdf_url"]):
                    title = str(row.get("title", f"paper_{idx}"))
                    # 清理文件名
                    safe_title = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_')).rstrip()
                    pdf_name = f"{safe_title[:50]}.pdf"
                    pdf_path = temp_dir / pdf_name
                    
                    response = requests.get(row["pdf_url"], timeout=30)
                    if response.status_code == 200 and "application/pdf" in response.headers.get("content-type", ""):
                        with open(pdf_path, "wb") as f:
                            f.write(response.content)
                        downloaded.append(pdf_path)
            except Exception as e:
                continue
        
        # 如果没有下载到任何文件
        if not downloaded:
            if temp_dir.exists():
                temp_dir.rmdir()
            return safe_json_response({"success": False, "message": "没有可下载的 PDF"})
        
        # 创建 ZIP 文件
        zip_filename = f"papers_{filename.replace('.csv', '')}_{uuid.uuid4().hex[:8]}.zip"
        zip_path = paths["papers"] / zip_filename
        
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for pdf_file in downloaded:
                zipf.write(pdf_file, pdf_file.name)
        
        # 清理临时文件
        for pdf_file in downloaded:
            pdf_file.unlink()
        temp_dir.rmdir()
        
        # 返回 ZIP 文件供下载
        return FileResponse(
            path=zip_path,
            filename=zip_filename,
            media_type='application/zip'
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get(base_prefix + "/api/download-csv/{filename}")
async def download_csv(filename: str, request: Request):
    try:
        paths = get_request_paths(request)
        csv_path = get_csv_path(filename, paths["raw"])
        if not csv_path.exists():
            raise HTTPException(status_code=404, detail="File not found")

        return FileResponse(
            path=csv_path,
            filename=csv_path.name,
            media_type="text/csv"
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get(f"{base_prefix}/api/files")
async def list_files(request: Request):
    try:
        paths = get_request_paths(request)
        files = list(paths["raw"].glob("*.csv"))
        result = {
            "success": True,
            "files": [{"name": f.name, "path": str(f)} for f in files]
        }
        return safe_json_response(result)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get(f"{base_prefix}/api/admin/files")
async def admin_list_files(
    x_paperhot_admin_password: Optional[str] = Header(default=None, alias="X-PaperHot-Admin-Password"),
):
    try:
        verify_admin_password(x_paperhot_admin_password)
        records = []

        if RAW_DATA_DIR.exists():
            for csv_path in sorted(RAW_DATA_DIR.glob("*.csv"), key=lambda path: path.stat().st_mtime, reverse=True):
                records.append(build_file_record(csv_path, "legacy", "旧全局数据"))

        if SESSIONS_DATA_DIR.exists():
            for session_dir in sorted(SESSIONS_DATA_DIR.iterdir(), key=lambda path: path.name):
                if not session_dir.is_dir() or not SESSION_ID_RE.fullmatch(session_dir.name):
                    continue
                raw_dir = session_dir / "raw"
                if not raw_dir.exists():
                    continue
                owner_label = f"会话 {session_dir.name[:8]}"
                for csv_path in sorted(raw_dir.glob("*.csv"), key=lambda path: path.stat().st_mtime, reverse=True):
                    records.append(build_file_record(csv_path, session_dir.name, owner_label))

        records.sort(key=lambda item: item["modified_at"], reverse=True)
        return safe_json_response({"success": True, "files": records})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get(f"{base_prefix}/api/admin/download-csv/{{owner_id}}/{{filename}}")
async def admin_download_csv(
    owner_id: str,
    filename: str,
    x_paperhot_admin_password: Optional[str] = Header(default=None, alias="X-PaperHot-Admin-Password"),
):
    try:
        verify_admin_password(x_paperhot_admin_password)
        raw_dir = get_admin_raw_dir(owner_id)
        csv_path = get_csv_path(filename, raw_dir)
        if not csv_path.exists():
            raise HTTPException(status_code=404, detail="File not found")

        return FileResponse(
            path=csv_path,
            filename=csv_path.name,
            media_type="text/csv",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post(f"{base_prefix}/api/admin/files/{{owner_id}}/{{filename}}/copy")
async def admin_copy_csv_to_current_session(
    owner_id: str,
    filename: str,
    request: Request,
    x_paperhot_admin_password: Optional[str] = Header(default=None, alias="X-PaperHot-Admin-Password"),
):
    try:
        verify_admin_password(x_paperhot_admin_password)
        source_raw_dir = get_admin_raw_dir(owner_id)
        source_path = get_csv_path(filename, source_raw_dir)
        if not source_path.exists():
            raise HTTPException(status_code=404, detail="File not found")

        paths = get_request_paths(request)
        target_filename, target_path = get_unique_csv_path(filename, paths["raw"])
        shutil.copy2(source_path, target_path)
        return safe_json_response({
            "success": True,
            "filename": target_filename,
            "message": "File copied to current session",
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete(f"{base_prefix}/api/admin/files/{{owner_id}}/{{filename}}")
async def admin_delete_csv(
    owner_id: str,
    filename: str,
    x_paperhot_admin_password: Optional[str] = Header(default=None, alias="X-PaperHot-Admin-Password"),
):
    try:
        verify_admin_password(x_paperhot_admin_password)
        raw_dir = get_admin_raw_dir(owner_id)
        csv_path = get_csv_path(filename, raw_dir)
        if not csv_path.exists():
            raise HTTPException(status_code=404, detail="File not found")

        csv_path.unlink()
        return safe_json_response({"success": True, "deleted": filename})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
