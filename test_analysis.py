import requests
import json
BASE_URL = 'http://localhost:8000'

# 获取第一个文件
r = requests.get(f'{BASE_URL}/api/files')
if r.ok:
    files_result = r.json()
    if files_result.get('success') and files_result.get('files'):
        filename = files_result['files'][0]['name']
        print(f'使用文件: {filename}')
        
        # 测试分析API
        print('测试分析API...')
        r2 = requests.get(f'{BASE_URL}/api/analysis/{filename}')
        print(f'状态码: {r2.status_code}')
        print(f'Content-Type: {r2.headers.get("Content-Type")}')
        try:
            result = r2.json()
            print(f'分析成功: {result.get("success")}')
            if result.get('success') and result.get('analysis', {}).get('journal_stats'):
                print(f'期刊统计: {result["analysis"]["journal_stats"]}')
        except Exception as e:
            print(f'解析失败: {e}')
            print(f'响应: {r2.text[:500]}')
