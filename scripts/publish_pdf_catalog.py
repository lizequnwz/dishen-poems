#!/usr/bin/env python3
"""Publish one year from the frozen PDF candidate catalog without rescanning the PDF."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from import_pdf_poems import (
    Candidate,
    RULES_VERSION,
    assign_slugs,
    candidate_markdown,
    content_fingerprint,
    existing_records,
    sha256_file,
)

DEFAULT_CATALOG = Path("tmp/pdf-import/catalog/catalog.json")
DEFAULT_DECISIONS = Path("imports/pdf-review-decisions.json")


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def valid_decision(item: dict[str, Any], decision: dict[str, Any] | None) -> bool:
    return bool(
        decision
        and decision.get("pdfSha256") == item["pdfSha256"]
        and decision.get("extractedContentFingerprint") == item["contentFingerprint"]
    )


def candidate_from_catalog(item: dict[str, Any], decision: dict[str, Any] | None) -> Candidate:
    title = item["title"]
    body = item["body"]
    written_date = item["writtenDate"]
    candidate_type = item["candidateType"]
    review_decision_id = None
    extracted_fingerprint = None
    if decision and decision.get("action") == "correct":
        corrections = decision.get("corrections") or {}
        title = corrections.get("title", title)
        body = corrections.get("body", body)
        written_date = corrections.get("writtenDate", written_date)
        candidate_type = corrections.get("candidateType", candidate_type)
        extracted_fingerprint = item["contentFingerprint"]
        review_decision_id = decision.get("id")
    elif decision and decision.get("action") == "approve":
        review_decision_id = decision.get("id")
        # The explicit human approval also affirms that a low/excluded
        # extraction is a poem. Keep its original confidence and failure
        # reasons in the source audit instead of disguising it as auto-high.
        candidate_type = "poetry"

    return Candidate(
        title=title,
        body=body,
        written_date=written_date,
        pdf_page=int(item["pdfPage"]),
        region=item["region"],
        printed_page=item.get("printedPage"),
        printed_page_raw=item.get("printedPageRaw"),
        layout_template=item["layoutTemplate"],
        layout_template_status=item["layoutTemplateStatus"],
        pdf_sha256=item["pdfSha256"],
        content_fingerprint=content_fingerprint(title, body, written_date),
        candidate_id=item["candidateId"],
        review_batch_id=item.get("reviewBatchId"),
        region_sequence=int(item["regionSequence"]),
        crop_bbox=list(item["cropBbox"]),
        extraction_rule_version=RULES_VERSION,
        confidence=item["confidence"],
        candidate_type=candidate_type,
        failure_reasons=list(item["failureReasons"]),
        visual_signals=list(item["visualSignals"]),
        crop_agreement=bool(item["cropAgreement"]),
        review_decision_id=review_decision_id,
        extracted_content_fingerprint=extracted_fingerprint,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--decisions", type=Path, default=DEFAULT_DECISIONS)
    parser.add_argument("--poems-dir", type=Path, default=Path("poems"))
    parser.add_argument("--publish-year", required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--include-reviewed", action="store_true")
    args = parser.parse_args()

    if not args.publish_year.isdigit() or len(args.publish_year) != 4:
        parser.error("--publish-year must be YYYY")
    catalog = load_json(args.catalog)
    if catalog.get("rulesVersion") != RULES_VERSION:
        raise SystemExit("error: catalog rules version does not match the publisher")
    pdf_path = Path(catalog["pdf"])
    if sha256_file(pdf_path) != catalog["pdfSha256"]:
        raise SystemExit("error: PDF checksum does not match the frozen catalog")
    decisions_payload = load_json(args.decisions) if args.decisions.exists() else {"decisions": {}}
    decisions = decisions_payload.get("decisions", {})

    selected: list[Candidate] = []
    blocked: list[dict[str, str]] = []
    for item in catalog["candidates"]:
        written_date = item.get("writtenDate") or ""
        if not written_date.startswith(f"{args.publish_year}-"):
            continue
        decision = decisions.get(item["candidateId"])
        decision = decision if isinstance(decision, dict) and valid_decision(item, decision) else None
        action = decision.get("action") if decision else None
        if action in {"hold", "reject"}:
            blocked.append({"candidateId": item["candidateId"], "title": item["title"], "action": action})
            continue
        auto_eligible = bool(item["autoEligible"] and item["confidence"] == "high" and not item["failureReasons"])
        manual_eligible = bool(
            args.include_reviewed
            and decision
            and action in {"approve", "correct"}
            and item["layoutTemplateStatus"] == "calibrated"
        )
        if auto_eligible or manual_eligible:
            candidate = candidate_from_catalog(item, decision if manual_eligible else None)
            if candidate.candidate_type == "poetry" and candidate.written_date:
                selected.append(candidate)

    _, _, existing_slugs = existing_records(args.poems_dir)
    assign_slugs(selected, existing_slugs)
    planned: list[str] = []
    applied: list[str] = []
    for candidate in selected:
        output = args.poems_dir / f"{candidate.written_date}-{candidate.title}.md"
        if any(character in candidate.title for character in ("/", "\\", "\x00")):
            blocked.append({"candidateId": candidate.candidate_id, "title": candidate.title, "action": "unsafe_filename"})
            continue
        planned.append(str(output))
        if not args.apply:
            continue
        if output.exists():
            continue
        output.write_text(candidate_markdown(candidate, "verified", pdf_path.name), encoding="utf-8")
        applied.append(str(output))

    print(
        json.dumps(
            {
                "mode": "apply" if args.apply else "dry-run",
                "year": args.publish_year,
                "eligible": len(selected),
                "planned": planned,
                "applied": applied,
                "blocked": blocked,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
