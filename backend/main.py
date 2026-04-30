from fastapi import FastAPI, HTTPException, UploadFile, File
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


class CustomJSONEncoder(json.JSONEncoder):
    def default(self, obj):
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

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
RAW_DATA_DIR = DATA_DIR / "raw"
PROCESSED_DATA_DIR = DATA_DIR / "processed"
PAPERS_DIR = DATA_DIR / "papers"
FRONTEND_DIR = BASE_DIR / "frontend"

RAW_DATA_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DATA_DIR.mkdir(parents=True, exist_ok=True)
PAPERS_DIR.mkdir(parents=True, exist_ok=True)

app.mount(f"{base_prefix}/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

class SearchRequest(BaseModel):
    keyword: str
    max_results: int = 500
    start_year: Optional[int] = None
    end_year: Optional[int] = None

@app.get(base_prefix)
@app.get(f"{base_prefix}/")
async def read_root():
    return FileResponse(str(FRONTEND_DIR / "index.html"))

@app.get("/")
async def read_root_redirect():
    return FileResponse(str(FRONTEND_DIR / "index.html"))

@app.post(f"{base_prefix}/api/search")
async def search_papers(request: SearchRequest):
    try:
        papers = fetch_from_openalex(
            keyword=request.keyword,
            max_results=request.max_results,
            start_year=request.start_year,
            end_year=request.end_year
        )
        
        df = pd.DataFrame(papers)
        csv_path = RAW_DATA_DIR / f"{request.keyword.replace(' ', '_')}_papers.csv"
        df.to_csv(csv_path, index=False, encoding='utf-8-sig')
        
        result = {
            "success": True,
            "count": len(papers),
            "papers": papers,
            "csv_path": str(csv_path)
        }
        return safe_json_response(result)
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
        
        response = requests.get(base_url, params=params)
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
    
    open_access = work.get("open_access", {})
    
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
async def upload_csv(file: UploadFile = File(...)):
    try:
        if not file.filename.endswith('.csv'):
            raise HTTPException(status_code=400, detail="Only CSV files are allowed")
        
        file_uuid = str(uuid.uuid4())[:8]
        safe_filename = f"upload_{file_uuid}_{file.filename.replace(' ', '_')}"
        csv_path = RAW_DATA_DIR / safe_filename
        
        contents = await file.read()
        with open(csv_path, 'wb') as f:
            f.write(contents)
        
        result = {
            "success": True,
            "filename": safe_filename,
            "message": "File uploaded successfully"
        }
        return safe_json_response(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get(base_prefix + "/api/analysis/{filename}")
async def get_analysis(filename: str, author_count: int = 50):
    try:
        csv_path = RAW_DATA_DIR / filename
        if not csv_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
            
        df = pd.read_csv(csv_path)
        
        analysis = {
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
    journals = df["journal"].dropna()
    journals = journals[journals != ""]
    journal_counts = journals.value_counts().head(20)
    result = [{"journal": name, "count": count} for name, count in journal_counts.items()]
    return result

def get_country_stats(df):
    all_countries = []
    for countries in df["countries"].dropna():
        all_countries.extend([c.strip() for c in str(countries).split(";") if c.strip()])
    country_series = pd.Series(all_countries).value_counts().head(20)
    return [{"country": k, "count": v} for k, v in country_series.items()]

def get_author_stats(df, top_n=50):
    all_authors = []
    for authors in df["authors"].dropna():
        all_authors.extend([a.strip() for a in str(authors).split(";") if a.strip()])
    author_series = pd.Series(all_authors).value_counts().head(top_n)
    return [{"author": k, "count": v} for k, v in author_series.items()]

def get_concept_stats(df):
    all_concepts = []
    for concepts in df["concepts"].dropna():
        all_concepts.extend([c.strip() for c in str(concepts).split(";") if c.strip()])
    concept_series = pd.Series(all_concepts).value_counts().head(30)
    return [{"concept": k, "count": v} for k, v in concept_series.items()]

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
    
    # 去重：优先按 DOI 去重，没有 DOI 的按 title 去重
    # 先处理有 DOI 的
    has_doi = df[df['doi'].notna()].drop_duplicates(subset=['doi'], keep='first')
    # 再处理没有 DOI 的，按 title 去重
    no_doi = df[df['doi'].isna()].drop_duplicates(subset=['title'], keep='first')
    # 合并
    df = pd.concat([has_doi, no_doi], ignore_index=True)
    
    for idx, row in df.iterrows():
        authors_str = str(row.get("authors", ""))
        if not authors_str or authors_str == "nan":
            continue
            
        authors = [a.strip() for a in authors_str.split(";") if a.strip()]
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
            "cited_by": cited_by
        })
    
    if not author_data:
        return []
        
    df_authors = pd.DataFrame(author_data)
    
    # 按作者分组聚合
    author_stats = df_authors.groupby("author").agg({
        "author": "count",
        "cited_by": ["sum", "max"]
    }).reset_index()
    
    # 重新命名列
    author_stats.columns = ["author", "paper_count", "total_citations", "max_citations"]
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
async def get_network(filename: str):
    try:
        csv_path = RAW_DATA_DIR / filename
        if not csv_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
            
        df = pd.read_csv(csv_path)
        network_data = build_coauthorship_network(df)
        
        result = {"success": True, "network": network_data}
        return safe_json_response(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def build_coauthorship_network(df):
    G = nx.Graph()
    
    for idx, row in df.iterrows():
        authors = str(row["authors"]).split(";")
        authors = [a.strip() for a in authors if a.strip()]
        
        for i, author1 in enumerate(authors):
            if author1 not in G:
                G.add_node(author1, size=1)
            else:
                G.nodes[author1]["size"] += 1
                
            for author2 in authors[i+1:]:
                if author2 not in G:
                    G.add_node(author2, size=1)
                else:
                    G.nodes[author2]["size"] += 1
                    
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

@app.get(base_prefix + "/api/papers/{filename}")
async def get_papers_list(filename: str):
    try:
        csv_path = RAW_DATA_DIR / filename
        if not csv_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
            
        df = pd.read_csv(csv_path)
        
        papers = []
        for idx, row in df.iterrows():
            has_pdf = pd.notna(row["pdf_url"]) and str(row["pdf_url"]).strip() != ""
            papers.append({
                "index": idx,
                "title": str(row.get("title", "")),
                "authors": str(row.get("authors", "")),
                "pdf_url": str(row.get("pdf_url", "")),
                "has_pdf": has_pdf
            })
        
        result = {"success": True, "papers": papers}
        return safe_json_response(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post(base_prefix + "/api/download/{filename}")
async def download_papers(filename: str):
    try:
        csv_path = RAW_DATA_DIR / filename
        if not csv_path.exists():
            raise HTTPException(status_code=404, detail="File not found")
            
        df = pd.read_csv(csv_path)
        df = df[df["pdf_url"].notna() & (df["pdf_url"] != "")]
        
        # 创建临时目录
        temp_dir = PAPERS_DIR / f"temp_{uuid.uuid4().hex[:8]}"
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
            return safe_json_response({"success": False, "message": "没有可下载的 PDF"})
        
        # 创建 ZIP 文件
        zip_filename = f"papers_{filename.replace('.csv', '')}_{uuid.uuid4().hex[:8]}.zip"
        zip_path = PAPERS_DIR / zip_filename
        
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get(f"{base_prefix}/api/files")
async def list_files():
    try:
        files = list(RAW_DATA_DIR.glob("*.csv"))
        result = {
            "success": True,
            "files": [{"name": f.name, "path": str(f)} for f in files]
        }
        return safe_json_response(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
