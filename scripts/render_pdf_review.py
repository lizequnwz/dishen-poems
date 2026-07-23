#!/usr/bin/env python3
"""Render a deterministic, per-candidate PDF review bundle from an importer report."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def review_state(candidate: dict[str, Any]) -> str:
    if candidate["candidate_type"] != "poetry":
        return "excluded"
    if candidate.get("can_publish"):
        return "eligible-after-batch-approval"
    return "needs-review"


def markdown_block(value: str) -> str:
    lines = value.splitlines() or [""]
    return "\n".join(f"    {line}" for line in lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, default=Path("tmp/pdf-import/review-25-50.json"))
    parser.add_argument("--output", type=Path, default=Path("tmp/pdf-import/review-25-50"))
    parser.add_argument("--resolution", type=int, default=180)
    args = parser.parse_args()

    try:
        import pdfplumber
    except ImportError as error:
        raise SystemExit("pdfplumber is required; install requirements/pdf-import.txt") from error

    report = json.loads(args.report.read_text(encoding="utf-8"))
    pdf_path = Path(report["pdf"])
    crops_dir = args.output / "crops"
    crops_dir.mkdir(parents=True, exist_ok=True)
    review_items: list[dict[str, Any]] = []

    with pdfplumber.open(pdf_path) as document:
        for index, candidate in enumerate(report["candidates"], start=1):
            bbox = candidate.get("crop_bbox")
            if not isinstance(bbox, list) or len(bbox) != 4:
                raise SystemExit(f"candidate {index} has no valid crop_bbox")
            page_number = int(candidate["pdf_page"])
            region_sequence = int(candidate.get("region_sequence", 0))
            fingerprint = str(candidate["content_fingerprint"])
            filename = (
                f"{index:03d}-p{page_number:03d}-{candidate['region']}-"
                f"{region_sequence:02d}-{fingerprint[:8]}.png"
            )
            output_path = crops_dir / filename
            document.pages[page_number - 1].crop(tuple(float(value) for value in bbox)).to_image(
                resolution=args.resolution
            ).save(output_path, format="PNG")
            review_items.append(
                {
                    "index": index,
                    "pdfPage": page_number,
                    "region": candidate["region"],
                    "regionSequence": region_sequence,
                    "printedPage": candidate.get("printed_page"),
                    "title": candidate["title"],
                    "body": candidate["body"],
                    "writtenDate": candidate.get("written_date"),
                    "candidateType": candidate["candidate_type"],
                    "confidence": candidate["confidence"],
                    "failureReasons": candidate["failure_reasons"],
                    "contentFingerprint": fingerprint,
                    "layoutTemplate": candidate["layout_template"],
                    "layoutTemplateStatus": candidate["layout_template_status"],
                    "cropAgreement": candidate["crop_agreement"],
                    "cropImage": f"crops/{filename}",
                    "publicationState": review_state(candidate),
                }
            )

    args.output.mkdir(parents=True, exist_ok=True)
    review_json = args.output / "review.json"
    review_json.write_text(
        json.dumps(
            {
                "rulesVersion": report["rulesVersion"],
                "pdf": report["pdf"],
                "pdfSha256": report["pdfSha256"],
                "pageRange": report["pageRange"],
                "summary": {
                    "candidates": len(review_items),
                    "poetry": sum(item["candidateType"] == "poetry" for item in review_items),
                    "excluded": sum(item["candidateType"] != "poetry" for item in review_items),
                    "eligibleAfterBatchApproval": sum(
                        item["publicationState"] == "eligible-after-batch-approval" for item in review_items
                    ),
                },
                "candidates": review_items,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    review_md = args.output / "REVIEW.md"
    markdown: list[str] = [
        "# PDF poem review: physical pages "
        f"{report['pageRange']['from']}-{report['pageRange']['to']}",
        "",
        "This is a review bundle only. Checking a box does not publish a poem.",
        "",
    ]
    for item in review_items:
        reasons = ", ".join(item["failureReasons"]) or "none"
        markdown.extend(
            [
                f"## {item['index']:03d}. {item['title']}",
                "",
                "- [ ] Title, body, punctuation, and date match the crop.",
                f"- Location: PDF {item['pdfPage']}, {item['region']} #{item['regionSequence']}"
                + (f", printed page {item['printedPage']}" if item["printedPage"] is not None else ""),
                f"- Date: {item['writtenDate']}",
                f"- Classification: {item['candidateType']} / {item['confidence']}",
                f"- Publication state: {item['publicationState']}",
                f"- Layout: {item['layoutTemplate']} / {item['layoutTemplateStatus']}",
                f"- Crop agreement: {str(item['cropAgreement']).lower()}",
                f"- Failure reasons: {reasons}",
                f"- Fingerprint: `{item['contentFingerprint']}`",
                "",
                f"![PDF crop for {item['title']}]({item['cropImage']})",
                "",
                markdown_block(item["body"]),
                "",
            ]
        )
    review_md.write_text("\n".join(markdown), encoding="utf-8")

    print(
        json.dumps(
            {
                "rendered": len(review_items),
                "reviewJson": str(review_json),
                "reviewMarkdown": str(review_md),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
