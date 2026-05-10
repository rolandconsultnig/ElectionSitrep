"""
Build database/parties_annex.json + database/extracted_logos/{001..091}.png from sitrep-app/parties.pdf.
Requires: pip install pymupdf
"""
import json
import re
import sys
from pathlib import Path

try:
    import fitz
except ImportError:
    print("pip install pymupdf", file=sys.stderr)
    sys.exit(1)


ROOT = Path(__file__).resolve().parent.parent
PDF_PATH = ROOT / "sitrep-app" / "parties.pdf"
OUT_JSON = ROOT / "database" / "parties_annex.json"
OUT_LOGOS = ROOT / "database" / "extracted_logos"


def parse_rows(lines: list[str]) -> list[dict]:
    starts = []
    for i, ln in enumerate(lines):
        if re.fullmatch(r"\d+", ln):
            n = int(ln)
            if 1 <= n <= 91:
                starts.append(i)
    chunks = []
    for k in range(len(starts)):
        a = starts[k]
        b = starts[k + 1] if k + 1 < len(starts) else len(lines)
        chunks.append(lines[a:b])
    if len(chunks) != 91:
        raise SystemExit(f"Expected 91 party chunks, got {len(chunks)}")

    rows = []
    for i, chunk in enumerate(chunks):
        sn = i + 1
        if len(chunk) < 4:
            raise SystemExit(f"Chunk {sn} too short: {chunk}")
        abbr = chunk[-2]
        candidate = chunk[-1]
        name = " ".join(chunk[1:-2]).strip()
        rows.append(
            {
                "annexSn": sn,
                "inecRegisterCode": f"INEC-ANNEX-{sn:03d}",
                "name": name,
                "abbreviation": abbr,
                "presidentialCandidate": candidate if candidate != "NO CANDIDATE" else None,
            }
        )

    # PDF text wraps some candidate names across lines; serial chunk layout mis-aligns these rows.
    overrides = {
        40: {
            "name": "JUSTICE MUST PREVAIL PARTY",
            "abbreviation": "JMPP",
            "presidentialCandidate": "CHUKWU-EGUZOLUGO SUNDAY CHIKENDU",
        },
        45: {
            "name": "MASS ACTION JOINT ALLIANCE",
            "abbreviation": "MAJA",
            "presidentialCandidate": "ADESANYA-DAVIES MERCY OLUFUNMILAYO",
        },
    }
    for row in rows:
        o = overrides.get(row["annexSn"])
        if o:
            row.update(o)
        if len(row["abbreviation"]) > 16:
            raise SystemExit(f"Annex {row['annexSn']}: abbreviation too long for DB (max 16): {row['abbreviation']!r}")
    return rows


def extract_images(doc: fitz.Document, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    idx = 0
    for page_index in range(len(doc)):
        page = doc[page_index]
        for img in page.get_images(full=True):
            xref = img[0]
            pix = fitz.Pixmap(doc, xref)
            try:
                if pix.n - pix.alpha < 4:
                    pix = fitz.Pixmap(fitz.csRGB, pix)
                png_bytes = pix.tobytes("png")
            finally:
                pix = None
            idx += 1
            dest = out_dir / f"{idx:03d}.png"
            dest.write_bytes(png_bytes)
    if idx != 91:
        raise SystemExit(f"Expected 91 embedded images, extracted {idx}")


def main():
    doc = fitz.open(PDF_PATH)
    text = "\n".join(doc[p].get_text() for p in range(len(doc)))
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    start = next(i for i, ln in enumerate(lines) if ln == "1")
    lines = lines[start:]

    rows = parse_rows(lines)
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    print(f"Wrote {OUT_JSON} ({len(rows)} parties)")

    extract_images(doc, OUT_LOGOS)
    print(f"Wrote 91 PNGs under {OUT_LOGOS}")
    doc.close()


if __name__ == "__main__":
    main()
