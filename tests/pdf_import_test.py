import importlib.util
import sys
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).parents[1] / "scripts" / "import_pdf_poems.py"
SPEC = importlib.util.spec_from_file_location("import_pdf_poems", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class PdfImportRulesTest(unittest.TestCase):
    def test_accepts_only_valid_full_gregorian_dates(self):
        self.assertEqual(MODULE.parse_gregorian_date("2 0 2 3 · 0 1 · 0 9"), "2023-01-09")
        self.assertIsNone(MODULE.parse_gregorian_date("2023 年春"))
        self.assertIsNone(MODULE.parse_gregorian_date("2023·02·30"))

    def test_classifies_verse_and_rejects_prose_or_couplet_headings(self):
        kind, failures = MODULE.classify_poetry("山中", ["青山入眼云生岫，白鹤随风过远村；", "流水随心月照门，松声满谷夜无尘。"])
        self.assertEqual(kind, "poetry")
        self.assertEqual(failures, [])
        kind, failures = MODULE.classify_poetry("楹联选", ["山静。", "水清。"])
        self.assertEqual(kind, "excluded")
        self.assertIn("couplet_excluded", failures)

    def test_fingerprint_is_stable_across_spacing(self):
        one = MODULE.content_fingerprint("天 山", "山中有 水", "2023-01-01")
        two = MODULE.content_fingerprint("天山", "山中有水", "2023-01-01")
        self.assertEqual(one, two)

    def test_uncalibrated_candidate_cannot_publish(self):
        candidate = MODULE.Candidate(
            title="天山",
            body="天山之水天上流，\n四季如是梦中求。",
            written_date="2006-01-11",
            pdf_page=39,
            region="left",
            printed_page=32,
            printed_page_raw="三二",
            layout_template="spread-example",
            layout_template_status="pending",
            pdf_sha256="a" * 64,
            content_fingerprint="b" * 64,
            confidence="high",
            candidate_type="poetry",
        )
        self.assertFalse(candidate.can_publish)
        self.assertEqual(candidate.content_status, "ingested")

    def test_rejected_or_pre_corpus_layout_cannot_publish(self):
        candidate = MODULE.Candidate(
            title="天山",
            body="天山之水天上流，\n四季如是梦中求。",
            written_date="2006-01-11",
            pdf_page=7,
            region="right",
            printed_page=None,
            printed_page_raw=None,
            layout_template="spread-rejected",
            layout_template_status="rejected",
            pdf_sha256="a" * 64,
            content_fingerprint="b" * 64,
            confidence="high",
            candidate_type="poetry",
        )
        self.assertFalse(candidate.can_publish)
        candidate.layout_template_status = "calibrated"
        self.assertFalse(candidate.can_publish)

    def test_page_range_is_inclusive_and_validated(self):
        self.assertEqual(MODULE.resolve_page_range(458, 25, 50), (25, 50))
        self.assertEqual(MODULE.resolve_page_range(458, None, None), (1, 458))
        with self.assertRaises(ValueError):
            MODULE.resolve_page_range(458, 50, 25)
        with self.assertRaises(ValueError):
            MODULE.resolve_page_range(458, 1, 459)

    def test_owner_layout_decisions_are_recorded(self):
        registry = MODULE.load_calibrations(Path(__file__).parents[1] / "imports" / "pdf-layout-calibrations.json")
        self.assertEqual(registry["spread-964696f761"]["status"], "rejected")
        self.assertEqual(sum(item["status"] == "calibrated" for item in registry.values()), 7)


if __name__ == "__main__":
    unittest.main()
