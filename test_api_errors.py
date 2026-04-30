import requests
import json

# 测试后端是否正常响应
BASE_URL = "http://localhost:8000"

def test_api_endpoint(endpoint, method="GET", data=None):
    url = f"{BASE_URL}{endpoint}"
    print(f"测试端点: {url}")
    try:
        if method == "GET":
            response = requests.get(url)
        else:
            response = requests.post(url, json=data)
        print(f"状态码: {response.status_code}")
        print(f"响应头 Content-Type: {response.headers.get('Content-Type', 'N/A')}")
        
        # 尝试解析 JSON
        try:
            result = response.json()
            print(f"JSON 响应: {json.dumps(result, indent=2, ensure_ascii=False)}")
            return result
        except Exception as e:
            print(f"JSON 解析失败: {e}")
            print(f"响应内容: {response.text[:200]}")
            return None
    except Exception as e:
        print(f"请求错误: {e}")
        return None

# 测试文件列表
print("=== 测试文件列表 ===")
test_api_endpoint("/api/files")

print("\n=== 测试搜索 ===")
# 测试搜索
test_api_endpoint(
    "/api/search", 
    method="POST",
    data={"keyword": "test", "max_results": 10}
)
