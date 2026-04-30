import requests

def test_openalex_api():
    url = "https://api.openalex.org/works"
    params = {
        "filter": "title_and_abstract.search:machine learning",
        "per-page": 10,
        "page": 1
    }
    
    print(f"调用API: {url}")
    print(f"参数: {params}")
    
    try:
        response = requests.get(url, params=params)
        print(f"状态码: {response.status_code}")
        data = response.json()
        print(f"返回结果数量: {len(data.get('results', []))}")
        
        if data.get('results'):
            for i, result in enumerate(data['results']):
                print(f"\n=== 文章 {i+1} ===")
                print(f"标题: {result.get('title', 'N/A')}")
                print(f"年份: {result.get('publication_year', 'N/A')}")
                print(f"host_venue: {result.get('host_venue', 'N/A')}")
                if result.get('host_venue'):
                    print(f"host_venue display_name: {result.get('host_venue', {}).get('display_name', 'N/A')}")
                print(f"primary_location: {result.get('primary_location', {}).get('source', {}).get('display_name', 'N/A')}")
                print(f"type: {result.get('type', 'N/A')}")
    except Exception as e:
        print(f"错误: {e}")

if __name__ == "__main__":
    test_openalex_api()
