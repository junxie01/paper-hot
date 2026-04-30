import pandas as pd
from pathlib import Path
import networkx as nx

RAW_DATA_DIR = Path(__file__).parent / "data" / "raw"
csv_path = RAW_DATA_DIR / "DAS_papers.csv"
df = pd.read_csv(csv_path)

print("=== 测试所有函数 ===")

def get_yearly_stats(df):
    try:
        print("测试 get_yearly_stats")
        yearly = df.groupby("year").size().sort_index().reset_index(name="count")
        yearly["citations"] = df.groupby("year")["cited_by_count"].sum().values
        return yearly.to_dict("records")
    except Exception as e:
        print(f"get_yearly_stats 错误: {e}")
        return []

def get_journal_stats(df):
    try:
        print("测试 get_journal_stats")
        journals = df["journal"].dropna()
        journals = journals[journals != ""]
        journal_counts = journals.value_counts().head(20)
        result = [{"journal": name, "count": count} for name, count in journal_counts.items()]
        return result
    except Exception as e:
        print(f"get_journal_stats 错误: {e}")
        return []

def get_country_stats(df):
    try:
        print("测试 get_country_stats")
        all_countries = []
        for countries in df["countries"].dropna():
            all_countries.extend([c.strip() for c in str(countries).split(";") if c.strip()])
        country_series = pd.Series(all_countries).value_counts().head(20)
        return [{"country": k, "count": v} for k, v in country_series.items()]
    except Exception as e:
        print(f"get_country_stats 错误: {e}")
        return []

def get_author_stats(df, top_n=50):
    try:
        print("测试 get_author_stats")
        all_authors = []
        for authors in df["authors"].dropna():
            all_authors.extend([a.strip() for a in str(authors).split(";") if a.strip()])
        author_series = pd.Series(all_authors).value_counts().head(top_n)
        return [{"author": k, "count": v} for k, v in author_series.items()]
    except Exception as e:
        print(f"get_author_stats 错误: {e}")
        return []

def get_concept_stats(df):
    try:
        print("测试 get_concept_stats")
        all_concepts = []
        for concepts in df["concepts"].dropna():
            all_concepts.extend([c.strip() for c in str(concepts).split(";") if c.strip()])
        concept_series = pd.Series(all_concepts).value_counts().head(30)
        return [{"concept": k, "count": v} for k, v in concept_series.items()]
    except Exception as e:
        print(f"get_concept_stats 错误: {e}")
        return []

def get_citation_stats(df):
    try:
        print("测试 get_citation_stats")
        top_cited = df.nlargest(20, "cited_by_count")[["title", "authors", "year", "cited_by_count"]]
        return top_cited.to_dict("records")
    except Exception as e:
        print(f"get_citation_stats 错误: {e}")
        return []

print(get_yearly_stats(df))
print(get_journal_stats(df))
print(get_country_stats(df))
print(get_author_stats(df))
print(get_concept_stats(df))
print(get_citation_stats(df))
