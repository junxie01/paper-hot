import requests

base_url = "https://api.openalex.org/works"
params = {
    "filter": "title_and_abstract.search:machine learning",
    "per-page": 5,
    "page": 1
}

print("测试 OpenAlex API...")
response = requests.get(base_url, params=params)
print(f"状态码: {response.status_code}")

if response.status_code == 200:
    data = response.json()
    print(f"获取到 {len(data.get('results', []))} 条结果")
    print("\n第一篇:")
    first = data['results'][0]
    print(f"标题: {first.get('title')}")
    print(f"年份: {first.get('publication_year')}")
else:
    print(f"错误: {response.text}")
