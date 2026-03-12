#!/usr/bin/env python3
"""Fill the Mieterselbstauskunft PDF with personal data.

Accepts field values via --json flag (for server integration) or CLI arguments.
"""

import argparse
import json
import sys
from datetime import date
from io import BytesIO
from pathlib import Path
from reportlab.pdfgen import canvas
from pypdf import PdfReader, PdfWriter

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_TEMPLATE = SCRIPT_DIR / "templates" / "Selbstauskunft____neutral.pdf"
DEFAULT_ATTACHMENT = SCRIPT_DIR / "attachments" / "Ignacio_Guri_Bewerbungsunterlagen.pdf"

W, H = 595.5, 842.0
COL_X = 250


def create_overlay_page1(data):
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=(W, H))
    c.setFont("Helvetica", 10)

    # Adresse/Lage
    c.drawString(45, 708, data.get("address", ""))

    # ab dem (move-in date)
    c.drawString(75, 661, data.get("moveIn", ""))

    # Name, Vorname
    c.drawString(COL_X, 496, data.get("name", ""))

    # Familienstand
    c.drawString(COL_X, 476, data.get("maritalStatus", ""))

    # Geburtsdatum
    c.drawString(COL_X, 457, data.get("birthDate", ""))

    # Aktuelle Anschrift (split into street + city lines)
    current_address = data.get("currentAddress", "")
    if "," in current_address:
        parts = [p.strip() for p in current_address.split(",", 1)]
        c.drawString(COL_X, 440, parts[0])
        c.drawString(COL_X, 427, parts[1])
    else:
        c.drawString(COL_X, 440, current_address)

    # Telefon
    c.drawString(COL_X, 369, data.get("phone", ""))

    # Email
    c.drawString(COL_X, 350, data.get("email", ""))

    # Ausgeübter Beruf
    c.drawString(COL_X, 331, data.get("profession", ""))

    # Mtl. Nettoeinkommen
    c.drawString(COL_X, 312, data.get("netIncome", ""))

    # Derzeitiger Arbeitgeber
    c.setFont("Helvetica", 9)
    employer = data.get("employer", "")
    employer_lines = [l.strip() for l in employer.split(",", 1)] if "," in employer else [employer]
    c.drawString(COL_X, 295, employer_lines[0])
    if len(employer_lines) > 1:
        c.drawString(COL_X, 283, employer_lines[1])
    employed_since = data.get("employedSince", "")
    if employed_since:
        y_employed = 283 if len(employer_lines) <= 1 else 271
        c.drawString(COL_X, y_employed, f"beschäftigt seit {employed_since}")

    # Derzeitiger Vermieter
    c.setFont("Helvetica", 9)
    c.drawString(COL_X, 229, data.get("currentLandlord", ""))
    c.drawString(COL_X, 217, data.get("landlordPhone", ""))
    c.drawString(COL_X, 205, data.get("landlordEmail", ""))

    # "Weitere Personen" nein checkbox
    c.setFont("Helvetica-Bold", 11)
    c.drawString(399, 137, "X")

    c.save()
    buf.seek(0)
    return buf


def create_overlay_page2(data):
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=(W, H))
    c.setFont("Helvetica-Bold", 11)

    # "nein" checkboxes
    nein_x = 256
    rows_y = [753, 720, 681, 632, 591, 553, 508, 470]
    for y in rows_y:
        c.drawString(nein_x, y, "X")

    # Ort, Datum
    c.setFont("Helvetica", 10)
    signing_date = data.get("signingDate", date.today().strftime("%d.%m.%Y"))
    c.drawString(40, 185, f"München, {signing_date}")

    # Signature
    signature_name = data.get("signatureName", data.get("name", "").split(",")[0].strip())
    # If name is "Last, First", flip to "First Last" for signature
    name_parts = data.get("name", "").split(",")
    if len(name_parts) == 2 and not signature_name:
        signature_name = f"{name_parts[1].strip()} {name_parts[0].strip()}"
    c.drawString(260, 185, signature_name)

    c.save()
    buf.seek(0)
    return buf


def generate_pdf(data, template_path=None, output_path=None, attachments=None, no_attach=False):
    """Generate the filled PDF. Returns the output path."""
    template = Path(template_path) if template_path else DEFAULT_TEMPLATE
    if not template.exists():
        raise FileNotFoundError(f"Template not found: {template}")

    reader = PdfReader(template)
    writer = PdfWriter()

    overlay1 = PdfReader(create_overlay_page1(data))
    page1 = reader.pages[0]
    page1.merge_page(overlay1.pages[0])
    writer.add_page(page1)

    overlay2 = PdfReader(create_overlay_page2(data))
    page2 = reader.pages[1]
    page2.merge_page(overlay2.pages[0])
    writer.add_page(page2)

    # Append supporting documents
    if not no_attach:
        attach_list = attachments if attachments else ([str(DEFAULT_ATTACHMENT)] if DEFAULT_ATTACHMENT.exists() else [])
        for pdf_path in attach_list:
            p = Path(pdf_path)
            if p.exists():
                attachment = PdfReader(p)
                for page in attachment.pages:
                    writer.add_page(page)
            else:
                print(f"Warning: attachment not found: {pdf_path}", file=sys.stderr)

    # Determine output path
    if not output_path:
        street = data.get("address", "output").split(",")[0].strip().replace(" ", "_")
        name_part = data.get("name", "").split(",")[0].strip() or "Tenant"
        output_path = f"/tmp/Bewerbungsunterlagen_{name_part}_{street}.pdf"

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "wb") as f:
        writer.write(f)

    return str(out), len(writer.pages)


def main():
    parser = argparse.ArgumentParser(description="Fill Mieterselbstauskunft PDF.")
    parser.add_argument("address", nargs="?", help="Apartment address")
    parser.add_argument("-o", "--output", help="Output PDF path")
    parser.add_argument("--move-in", default="", help="Desired move-in date")
    parser.add_argument("--date", default=date.today().strftime("%d.%m.%Y"), help="Signing date (default: today)")
    parser.add_argument("--json", dest="json_input", help="JSON string with all fields")
    parser.add_argument("--json-file", help="Path to JSON file with all fields")
    parser.add_argument("--template", help="Path to blank template PDF")
    parser.add_argument("--attach", nargs="+", metavar="PDF", help="Additional PDFs to append")
    parser.add_argument("--no-attach", action="store_true", help="Skip default attachment")
    args = parser.parse_args()

    # Build data from JSON or CLI args
    if args.json_input:
        data = json.loads(args.json_input)
    elif args.json_file:
        with open(args.json_file) as f:
            data = json.load(f)
    elif args.address:
        data = {
            "address": args.address,
            "moveIn": args.move_in,
            "signingDate": args.date,
        }
    else:
        parser.error("Provide an address or --json/--json-file")

    # CLI overrides
    if args.move_in and "moveIn" not in data:
        data["moveIn"] = args.move_in
    if "signingDate" not in data:
        data["signingDate"] = args.date

    output_path, total_pages = generate_pdf(
        data,
        template_path=args.template,
        output_path=args.output,
        attachments=args.attach,
        no_attach=args.no_attach,
    )

    # Output as JSON for server consumption
    result = {"outputPath": output_path, "pages": total_pages}
    print(json.dumps(result))


if __name__ == "__main__":
    main()
