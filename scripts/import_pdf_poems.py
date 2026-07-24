#!/usr/bin/env python3
"""Conservative, auditable importer for the Dishen poetry PDF.

The default mode is read-only. Markdown is only created with --apply, existing
files are never overwritten, and a layout cannot yield verified content until
its template id has been explicitly calibrated in the calibration registry.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import statistics
import sys
from dataclasses import asdict, dataclass, field
from datetime import date
from pathlib import Path
from typing import Any, Iterable

RULES_VERSION = "pdf-coordinate-v3"
MIN_PUBLIC_PDF_PAGE = 24
DEFAULT_PDF = Path("poems/谛深大师诗集（简体）.pdf")
DEFAULT_CALIBRATIONS = Path("imports/pdf-layout-calibrations.json")
DEFAULT_REPORT = Path("tmp/pdf-import/report.json")
DATE_PATTERN = re.compile(r"(?P<year>(?:19|20)\d{2})[·./年-](?P<month>\d{1,2})[·./月-](?P<day>\d{1,2})日?")
FULLWIDTH_DIGITS = str.maketrans("０１２３４５６７８９", "0123456789")
PUBLIC_STATUSES = {"verified", "curated"}


@dataclass(frozen=True)
class TextLine:
    text: str
    x0: float
    x1: float
    top: float
    bottom: float
    size: float


@dataclass
class Candidate:
    title: str
    body: str
    written_date: str | None
    pdf_page: int
    region: str
    printed_page: int | None
    printed_page_raw: str | None
    layout_template: str
    layout_template_status: str
    pdf_sha256: str
    content_fingerprint: str
    candidate_id: str = ""
    review_batch_id: str | None = None
    region_sequence: int = 0
    crop_bbox: list[float] = field(default_factory=list)
    extraction_rule_version: str = RULES_VERSION
    confidence: str = "low"
    candidate_type: str = "excluded"
    failure_reasons: list[str] = field(default_factory=list)
    visual_signals: list[str] = field(default_factory=list)
    slug: str | None = None
    crop_agreement: bool = False
    content_status: str = "ingested"
    review_decision_id: str | None = None
    extracted_content_fingerprint: str | None = None

    @property
    def can_publish(self) -> bool:
        return (
            self.candidate_type == "poetry"
            and self.written_date is not None
            and self.pdf_page >= MIN_PUBLIC_PDF_PAGE
            and self.confidence == "high"
            and self.layout_template_status == "calibrated"
            and not self.failure_reasons
        )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", "", value.translate(FULLWIDTH_DIGITS)).strip()


def content_fingerprint(title: str, body: str, written_date: str | None) -> str:
    payload = "\n".join([written_date or "", normalize_text(title), normalize_text(body)])
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def candidate_identity(
    pdf_sha256: str,
    pdf_page: int,
    region: str,
    region_sequence: int,
    fingerprint: str,
) -> str:
    payload = f"{pdf_sha256}|{pdf_page}|{region}|{region_sequence}|{fingerprint}"
    return f"pdf-{hashlib.sha256(payload.encode('utf-8')).hexdigest()[:24]}"


def parse_gregorian_date(value: str) -> str | None:
    compact = normalize_text(value)
    match = DATE_PATTERN.search(compact)
    if not match:
        return None
    try:
        parsed = date(int(match["year"]), int(match["month"]), int(match["day"]))
    except ValueError:
        return None
    return parsed.isoformat()


def cluster_lines(chars: list[dict[str, Any]], tolerance: float = 2.5) -> list[TextLine]:
    useful = [char for char in chars if str(char.get("text", "")).strip()]
    useful.sort(key=lambda char: (float(char["top"]), float(char["x0"])))
    clusters: list[list[dict[str, Any]]] = []
    for char in useful:
        if not clusters or abs(float(char["top"]) - statistics.median(float(item["top"]) for item in clusters[-1])) > tolerance:
            clusters.append([char])
        else:
            clusters[-1].append(char)

    lines: list[TextLine] = []
    for cluster in clusters:
        cluster.sort(key=lambda char: float(char["x0"]))
        lines.append(
            TextLine(
                text="".join(str(char["text"]) for char in cluster).strip(),
                x0=min(float(char["x0"]) for char in cluster),
                x1=max(float(char["x1"]) for char in cluster),
                top=min(float(char["top"]) for char in cluster),
                bottom=max(float(char["bottom"]) for char in cluster),
                size=round(statistics.median(float(char["size"]) for char in cluster), 1),
            )
        )
    return lines


def is_title_line(line: TextLine) -> bool:
    compact = normalize_text(line.text)
    return 21 <= line.size <= 27 and 1 <= len(compact) <= 28 and not compact.startswith(("—", "-"))


def is_body_line(line: TextLine) -> bool:
    return 13 <= line.size <= 19 and len(normalize_text(line.text)) >= 2


def line_is_full_date(line: TextLine) -> bool:
    return 8.5 <= line.size <= 12 and parse_gregorian_date(line.text) is not None


def parse_printed_page(lines: Iterable[TextLine], page_height: float) -> tuple[int | None, str | None]:
    candidates = [line.text for line in lines if line.bottom > page_height - 82 and line.size <= 9]
    if not candidates:
        return None, None
    raw = normalize_text(candidates[-1])
    if raw.isdigit():
        return int(raw), raw
    digit_map = {"〇": "0", "○": "0", "零": "0", "一": "1", "二": "2", "三": "3", "四": "4", "五": "5", "六": "6", "七": "7", "八": "8", "九": "9"}
    converted = "".join(digit_map.get(character, "") for character in raw)
    return (int(converted), raw) if converted else (None, raw)


def classify_poetry(title: str, body_lines: list[str]) -> tuple[str, list[str]]:
    failures: list[str] = []
    normalized_lines = [normalize_text(line) for line in body_lines if normalize_text(line)]
    cjk_counts = [len(re.findall(r"[\u3400-\u9fff]", line)) for line in normalized_lines]
    punctuation_lines = sum(bool(re.search(r"[，。；！？、：]", line)) for line in normalized_lines)
    prose_markers = ("简介", "生平", "序言", "前言", "后记", "说明", "楹联", "对联", "群联")
    couplet_markers = ("楹联", "对联", "群联")

    if any(marker in title for marker in prose_markers):
        failures.append("non_poetry_heading")
    if len(normalized_lines) < 2 or sum(cjk_counts) < 18:
        failures.append("insufficient_verse_lines")
    if normalized_lines and punctuation_lines / len(normalized_lines) < 0.5:
        failures.append("verse_line_structure_uncertain")
    if cjk_counts and statistics.median(cjk_counts) > 42:
        failures.append("prose_like_line_length")
    if any(marker in title for marker in couplet_markers):
        failures.append("couplet_excluded")
    return ("poetry", []) if not failures else ("excluded", sorted(set(failures)))


def detect_visual_signals(text: str) -> list[str]:
    terms = {
        "mountain": "山峰岭崖",
        "water": "水溪河海泉浪",
        "mist": "雾云霭烟",
        "rain": "雨淋泼",
        "snow": "雪霜冰",
        "flora": "花叶松桂草枝",
        "moon": "月夜",
        "sun": "日阳光",
        "wind": "风",
        "brush": "笔墨写",
        "lightning": "雷电",
    }
    return [name for name, characters in terms.items() if any(character in text for character in characters)]


def layout_template_id(
    region: str,
    title: TextLine,
    body: list[TextLine],
    date_line: TextLine,
    region_width: float,
    region_x0: float,
) -> str:
    body_size = round(statistics.median(line.size for line in body)) if body else 0
    count_bucket = "short" if len(body) <= 4 else "medium" if len(body) <= 10 else "long"
    title_center = (title.x0 + title.x1) / 2 - region_x0
    alignment = "center" if abs(title_center - region_width / 2) < region_width * 0.18 else "offset"
    raw = f"{region}|t{round(title.size)}|b{body_size}|d{round(date_line.size)}|{count_bucket}|{alignment}"
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:10]
    return f"spread-{digest}"


def load_calibrations(path: Path) -> dict[str, dict[str, Any]]:
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return dict(data.get("templates", {}))


def resolve_page_range(page_count: int, page_from: int | None, page_to: int | None) -> tuple[int, int]:
    first_page = page_from or 1
    last_page = page_to or page_count
    if first_page < 1 or last_page < first_page or last_page > page_count:
        raise ValueError(f"invalid inclusive PDF page range {first_page}-{last_page}; document has {page_count} pages")
    return first_page, last_page


def extract_region_candidates(
    cropped_page: Any,
    pdf_page: int,
    region: str,
    pdf_sha256: str,
    calibrations: dict[str, dict[str, Any]],
) -> list[Candidate]:
    lines = cluster_lines(cropped_page.chars)
    region_x0, region_top, region_x1, region_bottom = map(float, cropped_page.bbox)
    printed_page, printed_raw = parse_printed_page(lines, float(cropped_page.height))
    date_indices = [index for index, line in enumerate(lines) if line_is_full_date(line)]
    candidates: list[Candidate] = []
    previous_date_index = -1

    for date_index in date_indices:
        window = lines[previous_date_index + 1 : date_index]
        title_positions = [index for index, line in enumerate(window) if is_title_line(line)]
        if not title_positions:
            previous_date_index = date_index
            continue
        title_position = title_positions[-1]
        title_line = window[title_position]
        candidate_lines = window[title_position + 1 :]
        body_lines = [line for line in candidate_lines if is_body_line(line) or normalize_text(line.text).startswith(("—", "-"))]
        body_texts = [line.text.strip() for line in body_lines]
        date_line = lines[date_index]
        written_date = parse_gregorian_date(date_line.text)
        template_id = layout_template_id(
            region,
            title_line,
            body_lines,
            date_line,
            float(cropped_page.width),
            region_x0,
        )
        calibration = calibrations.get(template_id, {})
        recorded_status = calibration.get("status")
        template_status = recorded_status if recorded_status in {"calibrated", "rejected"} else "pending"
        candidate_type, failures = classify_poetry(title_line.text, body_texts)

        bbox = (
            max(region_x0, min(date_line.x0, *(line.x0 for line in body_lines), title_line.x0) - 8),
            max(region_top, title_line.top - 5),
            min(region_x1, max(date_line.x1, *(line.x1 for line in body_lines), title_line.x1) + 8),
            min(region_bottom, date_line.bottom + 5),
        )
        crop_text = cropped_page.crop(bbox).extract_text(x_tolerance=2, y_tolerance=3) or ""
        coordinate_text = "\n".join([title_line.text, *body_texts, date_line.text])
        crop_agreement = normalize_text(crop_text) == normalize_text(coordinate_text)
        if not crop_agreement:
            failures.append("coordinate_crop_mismatch")
        if template_status == "rejected":
            failures.append("layout_template_rejected")
        elif template_status != "calibrated":
            failures.append("layout_template_uncalibrated")
        if pdf_page < MIN_PUBLIC_PDF_PAGE:
            failures.append("before_public_poetry_start")
        if not written_date:
            failures.append("missing_or_ambiguous_gregorian_date")
        combined = f"{title_line.text}\n{' '.join(body_texts)}"
        if "�" in combined or "\ufffd" in combined:
            failures.append("garbled_text")
        if not body_lines:
            failures.append("missing_body")

        failures = sorted(set(failures))
        fingerprint = content_fingerprint(title_line.text, "\n".join(body_texts), written_date)
        confidence = "high" if not failures else "medium" if candidate_type == "poetry" and written_date else "low"
        region_sequence = len(candidates) + 1
        candidates.append(
            Candidate(
                title=title_line.text,
                body="\n".join(body_texts),
                written_date=written_date,
                pdf_page=pdf_page,
                region=region,
                printed_page=printed_page,
                printed_page_raw=printed_raw,
                layout_template=template_id,
                layout_template_status=template_status,
                pdf_sha256=pdf_sha256,
                content_fingerprint=fingerprint,
                candidate_id=candidate_identity(pdf_sha256, pdf_page, region, region_sequence, fingerprint),
                region_sequence=region_sequence,
                crop_bbox=[round(float(value), 2) for value in bbox],
                confidence=confidence,
                candidate_type=candidate_type,
                failure_reasons=failures,
                visual_signals=detect_visual_signals(combined),
                crop_agreement=crop_agreement,
            )
        )
        previous_date_index = date_index
    return candidates


def existing_records(poems_dir: Path) -> tuple[set[tuple[str, str]], set[str], set[str]]:
    title_dates: set[tuple[str, str]] = set()
    fingerprints: set[str] = set()
    slugs: set[str] = set()
    for path in poems_dir.glob("*.md"):
        text = path.read_text(encoding="utf-8")
        title_match = re.search(r"^title:\s*[\"']?(.*?)[\"']?\s*$", text, re.MULTILINE)
        date_match = re.search(r"^writtenDate:\s*[\"']?(\d{4}-\d{2}-\d{2})[\"']?\s*$", text, re.MULTILINE)
        slug_match = re.search(r"^slug:\s*(\S+)\s*$", text, re.MULTILINE)
        parts = text.split("---", 2)
        body = parts[2].strip() if len(parts) == 3 else ""
        if title_match and date_match:
            title = title_match.group(1).strip()
            written_date = date_match.group(1)
            title_dates.add((title, written_date))
            fingerprints.add(content_fingerprint(title, body, written_date))
        if slug_match:
            slugs.add(slug_match.group(1))
    return title_dates, fingerprints, slugs


def romanized_title(title: str) -> str:
    try:
        from pypinyin import Style, lazy_pinyin
    except ImportError as error:
        raise RuntimeError("--apply requires pypinyin; install requirements/pdf-import.txt") from error
    syllables = lazy_pinyin(title, style=Style.NORMAL, errors=lambda value: list(value))
    slug = "-".join(filter(None, (re.sub(r"[^a-z0-9]+", "-", syllable.lower()).strip("-") for syllable in syllables)))
    return slug or "poem"


def assign_slugs(candidates: list[Candidate], existing_slugs: set[str]) -> None:
    used = set(existing_slugs)
    for candidate in candidates:
        if not candidate.written_date:
            continue
        base = f"{candidate.written_date}-{romanized_title(candidate.title)}"
        slug = base if base not in used else f"{base}-{candidate.content_fingerprint[:8]}"
        candidate.slug = slug
        used.add(slug)


def yaml_quote(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def candidate_markdown(candidate: Candidate, status: str, pdf_label: str) -> str:
    assert candidate.slug and candidate.written_date
    poem_id = f"poem-{candidate.written_date.replace('-', '')}-{candidate.slug[len(candidate.written_date) + 1:]}"
    source_lines = [
        "source:",
        "  kind: pdf",
        f"  label: {yaml_quote(pdf_label)}",
        f"  file: {yaml_quote(pdf_label)}",
        f"  pdfSha256: {candidate.pdf_sha256}",
        f"  pdfPage: {candidate.pdf_page}",
        f"  region: {candidate.region}",
        f"  regionSequence: {candidate.region_sequence}",
        f"  candidateId: {candidate.candidate_id}",
    ]
    if candidate.printed_page is not None:
        source_lines.append(f"  printedPage: {candidate.printed_page}")
    source_lines.extend(
        [
            f"  rulesVersion: {RULES_VERSION}",
            f"  contentFingerprint: {candidate.content_fingerprint}",
            f"  confidence: {candidate.confidence}",
        ]
    )
    if candidate.extracted_content_fingerprint:
        source_lines.append(f"  extractedContentFingerprint: {candidate.extracted_content_fingerprint}")
    if candidate.review_decision_id:
        source_lines.append(f"  reviewDecisionId: {candidate.review_decision_id}")
    if candidate.failure_reasons:
        source_lines.extend(["  failureReasons:", *[f"    - {reason}" for reason in candidate.failure_reasons]])
    else:
        source_lines.append("  failureReasons: []")
    source_lines.extend(
        [
            f"  layoutTemplate: {candidate.layout_template}",
            f"  layoutTemplateStatus: {candidate.layout_template_status}",
        ]
    )
    return "\n".join(
        [
            "---",
            f"id: {poem_id}",
            f"slug: {candidate.slug}",
            f"title: {yaml_quote(candidate.title)}",
            f"writtenDate: {yaml_quote(candidate.written_date)}",
            "originalScript: simplified",
            *source_lines,
            f"status: {status}",
            "descriptiveTags: []",
            "---",
            candidate.body,
            "",
        ]
    )


def scan_pdf(
    pdf_path: Path,
    calibrations_path: Path,
    page_from: int | None = None,
    page_to: int | None = None,
) -> tuple[str, list[Candidate], tuple[int, int]]:
    try:
        import pdfplumber
    except ImportError as error:
        raise RuntimeError("pdfplumber is required; install requirements/pdf-import.txt") from error
    pdf_hash = sha256_file(pdf_path)
    calibrations = load_calibrations(calibrations_path)
    candidates: list[Candidate] = []
    with pdfplumber.open(pdf_path) as document:
        try:
            first_page, last_page = resolve_page_range(len(document.pages), page_from, page_to)
        except ValueError as error:
            raise RuntimeError(str(error)) from error
        for page_number in range(first_page, last_page + 1):
            page = document.pages[page_number - 1]
            midpoint = float(page.width) / 2
            regions = [
                ("left", page.crop((0, 0, midpoint, float(page.height)))),
                ("right", page.crop((midpoint, 0, float(page.width), float(page.height)))),
            ]
            for region_name, region_page in regions:
                candidates.extend(
                    extract_region_candidates(region_page, page_number, region_name, pdf_hash, calibrations)
                )
    return pdf_hash, candidates, (first_page, last_page)


def deduplicate(candidates: list[Candidate], poems_dir: Path) -> set[str]:
    title_dates, fingerprints, slugs = existing_records(poems_dir)
    seen_title_dates = set(title_dates)
    seen_fingerprints = set(fingerprints)
    for candidate in candidates:
        key = (candidate.title, candidate.written_date or "")
        if candidate.written_date and key in seen_title_dates:
            candidate.failure_reasons.append("existing_title_date_conflict")
        if candidate.content_fingerprint in seen_fingerprints:
            candidate.failure_reasons.append("existing_content_fingerprint")
        if candidate.written_date:
            seen_title_dates.add(key)
        seen_fingerprints.add(candidate.content_fingerprint)
        candidate.failure_reasons = sorted(set(candidate.failure_reasons))
        if candidate.failure_reasons:
            candidate.confidence = "medium" if candidate.candidate_type == "poetry" else "low"
    return slugs


def write_report(
    path: Path,
    pdf_path: Path,
    pdf_hash: str,
    candidates: list[Candidate],
    applied: list[str],
    apply_mode: bool,
    page_range: tuple[int, int],
) -> None:
    templates: dict[str, dict[str, Any]] = {}
    for candidate in candidates:
        item = templates.setdefault(
            candidate.layout_template,
            {
                "status": candidate.layout_template_status,
                "candidateCount": 0,
                "representative": {
                    "pdfPage": candidate.pdf_page,
                    "region": candidate.region,
                    "title": candidate.title,
                },
            },
        )
        item["candidateCount"] += 1
    payload = {
        "rulesVersion": RULES_VERSION,
        "mode": "apply" if apply_mode else "dry-run",
        "pdf": str(pdf_path),
        "pdfSha256": pdf_hash,
        "pageRange": {"from": page_range[0], "to": page_range[1], "inclusive": True},
        "summary": {
            "candidates": len(candidates),
            "poetry": sum(candidate.candidate_type == "poetry" for candidate in candidates),
            "highConfidence": sum(candidate.confidence == "high" for candidate in candidates),
            "pendingCalibration": sum(candidate.layout_template_status == "pending" for candidate in candidates),
            "rejectedLayoutCandidates": sum(candidate.layout_template_status == "rejected" for candidate in candidates),
            "applied": len(applied),
        },
        "templates": templates,
        "appliedFiles": applied,
        "candidates": [asdict(candidate) | {"can_publish": candidate.can_publish} for candidate in candidates],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", nargs="?", type=Path, default=DEFAULT_PDF)
    parser.add_argument("--calibrations", type=Path, default=DEFAULT_CALIBRATIONS)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--poems-dir", type=Path, default=Path("poems"))
    parser.add_argument("--page-from", type=int, help="First physical PDF page to scan, inclusive.")
    parser.add_argument("--page-to", type=int, help="Last physical PDF page to scan, inclusive.")
    parser.add_argument("--apply", action="store_true", help="Create new Markdown files; never overwrite existing files.")
    parser.add_argument(
        "--publish-year",
        default="latest",
        help="Year eligible for verified status: latest, none, or an explicit YYYY. All other candidates stay ingested.",
    )
    args = parser.parse_args(argv)

    if not args.pdf.is_file():
        parser.error(f"PDF not found: {args.pdf}")
    pdf_hash, candidates, page_range = scan_pdf(args.pdf, args.calibrations, args.page_from, args.page_to)
    existing_slugs = deduplicate(candidates, args.poems_dir)
    applied: list[str] = []

    if args.apply:
        eligible_years = sorted(
            {candidate.written_date[:4] for candidate in candidates if candidate.can_publish and candidate.written_date},
            reverse=True,
        )
        publish_year = eligible_years[0] if args.publish_year == "latest" and eligible_years else args.publish_year
        selected = [
            candidate
            for candidate in candidates
            if candidate.can_publish
            and candidate.written_date
            and publish_year != "none"
            and candidate.written_date.startswith(f"{publish_year}-")
        ]
        assign_slugs(selected, existing_slugs)
        for candidate in selected:
            if not candidate.slug or not candidate.written_date:
                continue
            candidate.content_status = "verified"
            output = args.poems_dir / f"{candidate.written_date}-{candidate.title}.md"
            if any(character in candidate.title for character in ("/", "\\", "\x00")):
                candidate.failure_reasons.append("unsafe_filename_character")
                continue
            if output.exists():
                candidate.failure_reasons.append("output_file_exists")
                continue
            output.write_text(candidate_markdown(candidate, "verified", args.pdf.name), encoding="utf-8")
            applied.append(str(output))

    write_report(args.report, args.pdf, pdf_hash, candidates, applied, args.apply, page_range)
    summary = {
        "mode": "apply" if args.apply else "dry-run",
        "report": str(args.report),
        "candidates": len(candidates),
        "poetry": sum(candidate.candidate_type == "poetry" for candidate in candidates),
        "highConfidence": sum(candidate.confidence == "high" for candidate in candidates),
        "pageRange": {"from": page_range[0], "to": page_range[1]},
        "applied": len(applied),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(2)
