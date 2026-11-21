import io
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _watermark(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(colors.Color(0.85, 0.2, 0.1, alpha=0.12))
    canvas.setFont("Helvetica-Bold", 48)
    canvas.translate(A4[0] / 2, A4[1] / 2)
    canvas.rotate(35)
    canvas.drawCentredString(0, 0, "DEMO DOCUMENT")
    canvas.restoreState()
    canvas.setFillColor(colors.HexColor("#555555"))
    canvas.setFont("Helvetica", 8)
    canvas.drawString(18 * mm, 10 * mm, "Demo data. Verify with the official partner. Not an official NSFDC form.")


def generate_application_pdf(application, extras=None):
    extras = extras or {}
    payload = application.payload or {}
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm)
    styles = getSampleStyleSheet()
    title = ParagraphStyle("T", parent=styles["Title"], fontSize=16, textColor=colors.HexColor("#9a3412"))
    h = ParagraphStyle("H", parent=styles["Heading2"], fontSize=12, textColor=colors.HexColor("#166534"))
    body = ParagraphStyle("B", parent=styles["Normal"], fontSize=10, leading=14)

    story = [
        Paragraph("Saksham Setu / साक्षम सेतु", title),
        Paragraph("Demo loan application summary", body),
        Spacer(1, 8),
        Paragraph("Applicant", h),
        Paragraph(
            f"Name: {application.applicant_name}<br/>"
            f"Reference: {application.ref_no}<br/>"
            f"Mobile: {payload.get('mobile', '—')}<br/>"
            f"State / District / PIN: {payload.get('state', '—')} / {payload.get('district', '—')} / {payload.get('pin', '—')}<br/>"
            f"Category: {payload.get('caste_category', '—')} &nbsp; Age: {payload.get('age', '—')}<br/>"
            f"Annual family income: Rs {payload.get('annual_family_income', '—')}",
            body,
        ),
        Spacer(1, 8),
        Paragraph("Scheme and loan", h),
        Paragraph(
            f"Scheme: {application.scheme_code}<br/>"
            f"Partner: {application.partner}<br/>"
            f"Loan amount: Rs {payload.get('loan_amount', extras.get('loan_amount', '—'))}<br/>"
            f"EMI summary: {extras.get('emi_summary', payload.get('emi_summary', 'See calculator on the site.'))}",
            body,
        ),
        Spacer(1, 8),
        Paragraph("Checklist", h),
    ]
    checklist = extras.get("checklist") or payload.get("checklist") or [
        "Caste certificate (state list)",
        "Aadhaar / identity proof",
        "Address / domicile proof",
        "Income declaration",
        "Project / course estimate",
        "Passport photos",
    ]
    extra_answers = extras.get("partner_details") or payload.get("partner_details") or {}
    rows = [["Item", "Status"]]
    for item in checklist:
        rows.append([item, extra_answers.get(item, "To be attached")])
    table = Table(rows, colWidths=[120 * mm, 50 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#166534")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.extend([table, Spacer(1, 8), Paragraph("Partner", h)])
    story.append(
        Paragraph(
            extras.get("partner_block")
            or payload.get("partner_block")
            or f"{application.partner}",
            body,
        )
    )
    story.append(Spacer(1, 12))
    story.append(
        Paragraph(
            "This PDF is a demo helper document. It is not an official application to NSFDC or any bank.",
            body,
        )
    )
    doc.build(story, onFirstPage=_watermark, onLaterPages=_watermark)
    return buffer.getvalue()
