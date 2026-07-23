#!/usr/bin/env python3
"""Render one half-page PNG for every layout template in an importer report."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, default=Path("tmp/pdf-import/report.json"))
    parser.add_argument("--output", type=Path, default=Path("tmp/pdf-import/calibration"))
    parser.add_argument("--resolution", type=int, default=144)
    args = parser.parse_args()

    try:
        import pdfplumber
    except ImportError as error:
        raise SystemExit("pdfplumber is required; install requirements/pdf-import.txt") from error

    report = json.loads(args.report.read_text(encoding="utf-8"))
    pdf_path = Path(report["pdf"])
    args.output.mkdir(parents=True, exist_ok=True)
    rendered: list[dict[str, object]] = []

    with pdfplumber.open(pdf_path) as document:
        for template_id, template in sorted(report["templates"].items()):
            representative = template["representative"]
            page_number = int(representative["pdfPage"])
            region = str(representative["region"])
            page = document.pages[page_number - 1]
            midpoint = float(page.width) / 2
            bbox = (0, 0, midpoint, float(page.height)) if region == "left" else (midpoint, 0, float(page.width), float(page.height))
            output_path = args.output / f"{template_id}-p{page_number}-{region}.png"
            page.crop(bbox).to_image(resolution=args.resolution).save(output_path, format="PNG")
            rendered.append(
                {
                    "template": template_id,
                    "status": template["status"],
                    "title": representative["title"],
                    "pdfPage": page_number,
                    "region": region,
                    "image": str(output_path),
                }
            )

    manifest = args.output / "manifest.json"
    manifest.write_text(json.dumps(rendered, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"rendered": len(rendered), "manifest": str(manifest)}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
