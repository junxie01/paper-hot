import requests
import json

print("测试分析API...")
response = requests.get("http://localhost:8000/api/analysis/DAS_papers.csv")
print(f"状态码: {response.status_code}")

if response.status_code == 200:
    data = response.json()
    print(f"分析成功: {data.get('success')}")
    
    analysis = data.get('analysis', {})
    
    print("\n=== 检查所有分析字段 ===")
    for key in analysis.keys():
        print(f"- {key}: {len(analysis[key]) if isinstance(analysis[key], list) else 'object'}")
    
    if 'top_cited_authors' in analysis:
        authors = analysis['top_cited_authors']
        print(f"\n=== 高被引作者 (前5) ===")
        for i, a in enumerate(authors[:5]):
            print(f"{i+1}. {a['author']}")
            print(f"   - 论文数: {a['paper_count']}")
            print(f"   - 总被引: {a['total_citations']}")
            print(f"   - 最高单篇被引: {a['max_citations']}")
            print(f"   - 平均被引: {a['avg_citations']:.1f}")
else:
    print(f"错误: {response.text}")
