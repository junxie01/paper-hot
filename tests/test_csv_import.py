import unittest

import pandas as pd

from backend.main import get_citation_stats, normalize_papers_df


class CsvImportTests(unittest.TestCase):
    def test_publish_or_perish_columns_are_mapped(self):
        source = pd.DataFrame(
            {
                "Cites": [12],
                "Authors": ["A Author, B Author"],
                "Title": ["Example paper"],
                "Year": [2024],
                "Source": ["Example Journal"],
                "Type": ["Journal article"],
                "DOI": ["10.1000/example"],
                "Abstract": ["Example abstract"],
                "FullTextURL": ["https://example.test/paper.pdf"],
                "GSRank": [1],
                "QueryDate": ["2026-07-21 15:18:47"],
            }
        )

        normalized = normalize_papers_df(source)
        paper = normalized.iloc[0]

        self.assertEqual(paper["cited_by_count"], 12)
        self.assertEqual(paper["authors"], "A Author; B Author")
        self.assertEqual(paper["title"], "Example paper")
        self.assertEqual(paper["year"], 2024)
        self.assertEqual(paper["journal"], "Example Journal")
        self.assertEqual(paper["type"], "Journal article")
        self.assertEqual(paper["doi"], "10.1000/example")
        self.assertEqual(paper["abstract"], "Example abstract")
        self.assertEqual(paper["pdf_url"], "https://example.test/paper.pdf")

    def test_missing_year_does_not_break_citation_stats(self):
        normalized = normalize_papers_df(
            pd.DataFrame(
                {
                    "title": ["Paper without year"],
                    "authors": ["A Author"],
                    "year": [""],
                    "cited_by_count": [3],
                }
            )
        )

        records = get_citation_stats(normalized)

        self.assertEqual(records[0]["year"], 0)
        self.assertEqual(records[0]["cited_by_count"], 3)


if __name__ == "__main__":
    unittest.main()
