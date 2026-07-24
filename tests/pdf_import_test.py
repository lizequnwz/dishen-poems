import importlib.util
import sys
import unittest
import json
from pathlib import Path

MODULE_PATH = Path(__file__).parents[1] / "scripts" / "import_pdf_poems.py"
SPEC = importlib.util.spec_from_file_location("import_pdf_poems", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)

PUBLISH_PATH = Path(__file__).parents[1] / "scripts" / "publish_pdf_catalog.py"
PUBLISH_SPEC = importlib.util.spec_from_file_location("publish_pdf_catalog", PUBLISH_PATH)
PUBLISH_MODULE = importlib.util.module_from_spec(PUBLISH_SPEC)
sys.modules[PUBLISH_SPEC.name] = PUBLISH_MODULE
PUBLISH_SPEC.loader.exec_module(PUBLISH_MODULE)


class PdfImportRulesTest(unittest.TestCase):
    def test_explicit_approval_affirms_excluded_candidate_is_poetry(self):
        item = {
            "title": "春姑",
            "body": "春风一缕过山门，\n花影无声照故人。",
            "writtenDate": "2012-04-03",
            "candidateType": "excluded",
            "pdfPage": 143,
            "region": "right",
            "printedPage": 136,
            "printedPageRaw": "一三六",
            "layoutTemplate": "spread-example",
            "layoutTemplateStatus": "calibrated",
            "pdfSha256": "a" * 64,
            "contentFingerprint": "b" * 64,
            "candidateId": "pdf-" + "c" * 24,
            "reviewBatchId": "pages-126-150",
            "regionSequence": 1,
            "cropBbox": [0, 0, 100, 100],
            "confidence": "low",
            "failureReasons": ["verse_line_structure_uncertain"],
            "visualSignals": ["花"],
            "cropAgreement": True,
        }
        decision = {"action": "approve", "id": "review-pdf-" + "c" * 24}
        candidate = PUBLISH_MODULE.candidate_from_catalog(item, decision)
        self.assertEqual(candidate.candidate_type, "poetry")
        self.assertEqual(candidate.confidence, "low")
        self.assertEqual(candidate.failure_reasons, ["verse_line_structure_uncertain"])

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

    def test_candidate_identity_is_stable_and_location_specific(self):
        one = MODULE.candidate_identity("a" * 64, 24, "right", 1, "b" * 64)
        two = MODULE.candidate_identity("a" * 64, 24, "right", 1, "b" * 64)
        moved = MODULE.candidate_identity("a" * 64, 24, "right", 2, "b" * 64)
        self.assertEqual(one, two)
        self.assertNotEqual(one, moved)

    def test_group_couplet_heading_is_permanently_excluded(self):
        kind, failures = MODULE.classify_poetry(
            "师父为坐下弟子建的QQ群写的群联：",
            ["入此门不许你七颠八倒", "横批是：统统放下"],
        )
        self.assertEqual(kind, "excluded")
        self.assertIn("couplet_excluded", failures)

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
        self.assertEqual(MODULE.resolve_page_range(206, 25, 50), (25, 50))
        self.assertEqual(MODULE.resolve_page_range(206, None, None), (1, 206))
        with self.assertRaises(ValueError):
            MODULE.resolve_page_range(458, 50, 25)
        with self.assertRaises(ValueError):
            MODULE.resolve_page_range(206, 1, 207)

    def test_owner_layout_decisions_are_recorded(self):
        registry = MODULE.load_calibrations(Path(__file__).parents[1] / "imports" / "pdf-layout-calibrations.json")
        self.assertEqual(registry["spread-964696f761"]["status"], "rejected")
        self.assertEqual(sum(item["status"] == "calibrated" for item in registry.values()), 7)

    def test_remaining_batch_registry_covers_the_document_tail(self):
        data = json.loads((Path(__file__).parents[1] / "imports" / "pdf-review-batches.json").read_text())
        ranges = [(item["pageFrom"], item["pageTo"]) for item in data["batches"]]
        self.assertEqual(ranges[0], (24, 24))
        self.assertEqual(ranges[-1], (201, 206))
        self.assertEqual(data["expected"]["remainingCandidates"], 177)

    @unittest.skipUnless(importlib.util.find_spec("pdfplumber"), "pdfplumber not installed")
    def test_fixed_remaining_pdf_regression_pages(self):
        root = Path(__file__).parents[1]
        pdf = root / "poems" / "谛深大师诗集（简体）.pdf"
        calibrations = root / "imports" / "pdf-layout-calibrations.json"
        _, page24, _ = MODULE.scan_pdf(pdf, calibrations, 24, 24)
        self.assertEqual([(item.title, item.confidence) for item in page24], [("那罗延窟观善境", "high"), ("九水", "high")])
        _, page204, _ = MODULE.scan_pdf(pdf, calibrations, 204, 204)
        self.assertEqual(len(page204), 1)
        self.assertIn("couplet_excluded", page204[0].failure_reasons)
        self.assertEqual(page204[0].confidence, "low")


if __name__ == "__main__":
    unittest.main()
