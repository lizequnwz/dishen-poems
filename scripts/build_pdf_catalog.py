#!/usr/bin/env python3
"""Build the frozen, deterministic PDF candidate catalog used by review and publishing."""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

from import_pdf_poems import (
    Candidate,
    DEFAULT_CALIBRATIONS,
    RULES_VERSION,
    deduplicate,
    existing_records,
    scan_pdf,
)

DEFAULT_CONFIG = Path("imports/pdf-review-batches.json")
DEFAULT_DECISIONS = Path("imports/pdf-review-decisions.json")
DEFAULT_OUTPUT = Path("tmp/pdf-import/catalog/catalog.json")


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def is_permanently_excluded(candidate: Candidate, exclusions: list[dict[str, Any]]) -> bool:
    return any(
        candidate.pdf_page == int(item["pdfPage"]) and candidate.title == item["title"]
        for item in exclusions
    )


def decision_for(candidate: Candidate, decisions: dict[str, Any]) -> dict[str, Any] | None:
    decision = decisions.get(candidate.candidate_id)
    if not isinstance(decision, dict):
        return None
    if decision.get("pdfSha256") != candidate.pdf_sha256:
        return None
    if decision.get("extractedContentFingerprint") != candidate.content_fingerprint:
        return None
    return decision


def candidate_payload(
    candidate: Candidate,
    decision: dict[str, Any] | None,
    published_fingerprints: set[str],
) -> dict[str, Any]:
    auto_eligible = candidate.can_publish and (not decision or decision.get("action") not in {"hold", "reject"})
    manual_eligible = bool(decision and decision.get("action") in {"approve", "correct"})
    if candidate.content_fingerprint in published_fingerprints:
        publication_state = "published"
    elif decision and decision.get("action") == "hold":
        publication_state = "held"
    elif decision and decision.get("action") == "reject":
        publication_state = "rejected"
    elif manual_eligible:
        publication_state = "manually-approved"
    elif auto_eligible:
        publication_state = "auto-eligible"
    elif candidate.candidate_type != "poetry":
        publication_state = "excluded"
    else:
        publication_state = "needs-review"

    data = asdict(candidate)
    return {
        "candidateId": data["candidate_id"],
        "reviewBatchId": data["review_batch_id"],
        "title": data["title"],
        "body": data["body"],
        "writtenDate": data["written_date"],
        "pdfPage": data["pdf_page"],
        "region": data["region"],
        "regionSequence": data["region_sequence"],
        "printedPage": data["printed_page"],
        "printedPageRaw": data["printed_page_raw"],
        "layoutTemplate": data["layout_template"],
        "layoutTemplateStatus": data["layout_template_status"],
        "pdfSha256": data["pdf_sha256"],
        "contentFingerprint": data["content_fingerprint"],
        "cropBbox": data["crop_bbox"],
        "confidence": data["confidence"],
        "candidateType": data["candidate_type"],
        "failureReasons": data["failure_reasons"],
        "visualSignals": data["visual_signals"],
        "cropAgreement": data["crop_agreement"],
        "autoEligible": auto_eligible,
        "manualEligible": manual_eligible,
        "publicationState": publication_state,
        "decision": decision,
        "cropImage": f"/__pdf-review/assets/crops/{data['candidate_id']}.png",
        "pageImage": f"/__pdf-review/assets/pages/p{data['pdf_page']:03d}.png",
    }


def render_assets(pdf_path: Path, candidates: list[Candidate], output_dir: Path) -> None:
    try:
        import pdfplumber
    except ImportError as error:
        raise RuntimeError("pdfplumber is required; install requirements/pdf-import.txt") from error

    crops_dir = output_dir / "assets" / "crops"
    pages_dir = output_dir / "assets" / "pages"
    crops_dir.mkdir(parents=True, exist_ok=True)
    pages_dir.mkdir(parents=True, exist_ok=True)
    unique_pages = sorted({candidate.pdf_page for candidate in candidates})

    with pdfplumber.open(pdf_path) as document:
        for page_number in unique_pages:
            document.pages[page_number - 1].to_image(resolution=96).save(
                pages_dir / f"p{page_number:03d}.png",
                format="PNG",
            )
        for candidate in candidates:
            if len(candidate.crop_bbox) != 4:
                raise RuntimeError(f"candidate {candidate.candidate_id} has no valid crop bbox")
            document.pages[candidate.pdf_page - 1].crop(tuple(candidate.crop_bbox)).to_image(
                resolution=180
            ).save(crops_dir / f"{candidate.candidate_id}.png", format="PNG")


def build_catalog(
    config_path: Path,
    decisions_path: Path,
    output_path: Path,
    poems_dir: Path,
    render: bool,
) -> dict[str, Any]:
    config = load_json(config_path)
    pdf_path = Path(config["pdf"])
    decisions_payload = load_json(decisions_path) if decisions_path.exists() else {"decisions": {}}
    decisions = decisions_payload.get("decisions", {})
    exclusions = list(config.get("permanentExclusions", []))
    remaining: list[Candidate] = []
    coverage: list[dict[str, Any]] = []
    pdf_hash: str | None = None

    for batch in config["batches"]:
        batch_hash, scanned, page_range = scan_pdf(
            pdf_path,
            DEFAULT_CALIBRATIONS,
            int(batch["pageFrom"]),
            int(batch["pageTo"]),
        )
        if pdf_hash and batch_hash != pdf_hash:
            raise RuntimeError("PDF changed while building the candidate catalog")
        pdf_hash = batch_hash
        kept: list[Candidate] = []
        permanent = 0
        for candidate in scanned:
            candidate.review_batch_id = str(batch["id"])
            if is_permanently_excluded(candidate, exclusions):
                permanent += 1
                continue
            kept.append(candidate)
        remaining.extend(kept)
        coverage.append(
            {
                "id": batch["id"],
                "pageRange": {"from": page_range[0], "to": page_range[1], "inclusive": True},
                "rawCandidates": len(scanned),
                "includedCandidates": len(kept),
                "permanentlyExcluded": permanent,
            }
        )

    deduplicate(remaining, poems_dir)
    expected = config["expected"]
    actual = {
        "remainingCandidates": len(remaining),
        "poetryCandidates": sum(candidate.candidate_type == "poetry" for candidate in remaining),
        "highConfidence": sum(candidate.confidence == "high" for candidate in remaining),
        "mediumConfidence": sum(candidate.confidence == "medium" for candidate in remaining),
        "lowConfidence": sum(candidate.confidence == "low" for candidate in remaining),
    }
    for key, value in actual.items():
        if int(expected[key]) != value:
            raise RuntimeError(f"catalog baseline mismatch for {key}: expected {expected[key]}, found {value}")

    legacy = config["legacyExceptions"]
    _, legacy_scan, _ = scan_pdf(
        pdf_path,
        DEFAULT_CALIBRATIONS,
        int(legacy["pageFrom"]),
        int(legacy["pageTo"]),
    )
    legacy_titles = set(legacy["titles"])
    legacy_candidates = [candidate for candidate in legacy_scan if candidate.title in legacy_titles]
    for candidate in legacy_candidates:
        candidate.review_batch_id = "legacy-pages-25-50"
    deduplicate(legacy_candidates, poems_dir)
    if len(legacy_candidates) != int(expected["legacyExceptions"]):
        raise RuntimeError(
            f"legacy exception mismatch: expected {expected['legacyExceptions']}, found {len(legacy_candidates)}"
        )

    all_candidates = sorted(
        [*remaining, *legacy_candidates],
        key=lambda candidate: (
            candidate.pdf_page,
            0 if candidate.region == "left" else 1,
            candidate.region_sequence,
            candidate.candidate_id,
        ),
    )
    _, published_fingerprints, _ = existing_records(poems_dir)
    payload_candidates = [
        candidate_payload(candidate, decision_for(candidate, decisions), published_fingerprints)
        for candidate in all_candidates
    ]
    payload = {
        "version": 1,
        "rulesVersion": RULES_VERSION,
        "pdf": str(pdf_path),
        "pdfSha256": pdf_hash,
        "coverage": coverage,
        "summary": {
            **actual,
            "catalogCandidates": len(payload_candidates),
            "reviewExceptions": sum(candidate["confidence"] != "high" for candidate in payload_candidates),
            "permanentlyExcluded": sum(item["permanentlyExcluded"] for item in coverage),
        },
        "candidates": payload_candidates,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if render:
        render_assets(pdf_path, all_candidates, output_path.parent)
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--decisions", type=Path, default=DEFAULT_DECISIONS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--poems-dir", type=Path, default=Path("poems"))
    parser.add_argument("--render", action="store_true", help="Render crop and full-page review images.")
    args = parser.parse_args()
    payload = build_catalog(args.config, args.decisions, args.output, args.poems_dir, args.render)
    print(json.dumps({"catalog": str(args.output), "summary": payload["summary"]}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        raise SystemExit(f"error: {error}") from error
