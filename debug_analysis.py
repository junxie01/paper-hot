import pandas as pd
from pathlib import Path

RAW_DATA_DIR = Path(__file__).parent / "data" / "raw"

# 测试问题文件
csv_path = RAW_DATA_DIR / "DAS_papers.csv"
print(f"测试文件: {csv_path}")

df = pd.read_csv(csv_path)
print(f"列名: {df.columns}")
print(f"期刊列前几行: {df['journal'].head(10)}")

print("\n=== 测试 get_journal_stats ===")
journals = df["journal"].dropna()
journals = journals[journals != ""]
print(f"有效期刊数: {len(journals)}")
journal_counts = journals.value_counts().head(20)
print(f"计数结果: {journal_counts}")

result = [{"journal": name, "count": count} for name, count in journal_counts.items()]
print(f"最终结果: {result}")
