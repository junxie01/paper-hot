import pandas as pd
import sys
sys.path.insert(0, '/Users/junxie/Work/paper_cite/backend')

def get_top_cited_authors(df):
    author_data = []
    
    print(f"开始处理，数据行数: {len(df)}")
    
    for idx, row in df.iterrows():
        authors_str = str(row.get("authors", ""))
        if not authors_str or authors_str == "nan":
            continue
            
        authors = [a.strip() for a in authors_str.split(";") if a.strip()]
        cited_by = row.get("cited_by_count", 0)
        # 确保cited_by是数字
        try:
            cited_by = int(float(cited_by))
        except (ValueError, TypeError):
            cited_by = 0
        
        for author in authors:
            author_data.append({
                "author": author,
                "paper_count": 1,
                "total_citations": cited_by,
                "all_citations": [cited_by]
            })
    
    if not author_data:
        return []
        
    df_authors = pd.DataFrame(author_data)
    
    print(f"作者数据行数: {len(df_authors)}")
    
    # 按作者分组聚合
    author_stats = df_authors.groupby("author").agg({
        "paper_count": "sum",
        "total_citations": "sum",
        "all_citations": lambda x: list(x)
    }).reset_index()
    
    print(f"作者统计行数: {len(author_stats)}")
    print(author_stats.head())
    
    # 计算平均和最大
    author_stats["max_citations"] = author_stats["all_citations"].apply(max)
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

# 测试
print("读取数据...")
df = pd.read_csv('/Users/junxie/Work/paper_cite/data/raw/DAS_papers.csv')
print(f"数据列: {df.columns}")
print(df[['authors', 'cited_by_count']].head())

print("\n开始运行函数...")
result = get_top_cited_authors(df)
print(f"\n成功! 结果数: {len(result)}")
for i, a in enumerate(result[:3]):
    print(f"{i+1}. {a['author']}: {a['total_citations']} 次")
