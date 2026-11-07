"""Generate email PDFs using the layout of the frontend bulk A4 invoice page."""

from datetime import datetime
from io import BytesIO
import os
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


class BulkA4InvoicePDF:
    def __init__(self):
        self.styles = getSampleStyleSheet()
        self.body_style = ParagraphStyle(
            "BulkA4Body",
            parent=self.styles["Normal"],
            fontName="Helvetica",
            fontSize=9.75,
            leading=13.2,
            textColor=colors.HexColor("#111111"),
        )
        self.small_style = ParagraphStyle(
            "BulkA4Small",
            parent=self.body_style,
            fontSize=8.25,
            leading=11,
        )
        self.right_style = ParagraphStyle(
            "BulkA4Right",
            parent=self.body_style,
            alignment=TA_RIGHT,
        )

    @staticmethod
    def _value(mapping, *keys, default=None):
        for key in keys:
            value = mapping.get(key)
            if value is not None:
                return value
        return default

    @staticmethod
    def _number(value):
        try:
            return float(value or 0)
        except (TypeError, ValueError):
            return 0.0

    @staticmethod
    def _format_quantity(value):
        number = BulkA4InvoicePDF._number(value)
        if number.is_integer():
            return str(int(number))
        return f"{number:.3f}".rstrip("0").rstrip(".")

    @staticmethod
    def _format_date(value, include_time=False):
        if not value:
            return "-"
        try:
            parsed = value if isinstance(value, datetime) else datetime.fromisoformat(
                str(value).replace("Z", "+00:00")
            )
            return parsed.strftime("%d/%m/%Y, %H:%M:%S" if include_time else "%d/%m/%Y")
        except (TypeError, ValueError):
            return str(value)

    @staticmethod
    def _text(value):
        return escape(str(value)) if value is not None else ""

    def _invoice_flowables(self, data):
        company = data.get("company") or {}
        customer = data.get("customer") or {}
        sale = data.get("sale") or {}
        items = data.get("items") or []
        width = A4[0] - 20 * mm
        left_width = width * 0.64
        right_width = width - left_width

        company_lines = [
            f'<font size="15"><b>{self._text(company.get("companyName") or "Company Name")}</b></font>'
        ]
        address = ", ".join(
            part for part in (company.get("address1"), company.get("address2")) if part
        )
        if address:
            company_lines.append(self._text(address))
        for label, key in (("Company Reg No", "compRegNo"), ("VAT No", "vatNo"), ("", "email")):
            if company.get(key):
                text = f'{label}: {self._text(company[key])}' if label else self._text(company[key])
                company_lines.append(text)
        company_block = Paragraph("<br/>".join(company_lines), self.body_style)

        logo_path = os.path.join(
            os.path.dirname(__file__), "..", "client", "src", "public", "printlogo.png"
        )
        logo = Image(logo_path, width=90, height=60, kind="proportional") if os.path.exists(logo_path) else ""
        header = Table([[company_block, logo]], colWidths=[left_width, right_width])
        header.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ALIGN", (1, 0), (1, 0), "RIGHT"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))

        elements = [header, Spacer(1, 3), Table(
            [[""]], colWidths=[width],
            style=TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.6, colors.HexColor("#888888"))]),
        )]
        title = Paragraph("INVOICE", ParagraphStyle(
            "BulkA4Title", parent=self.body_style, fontSize=15, alignment=TA_RIGHT,
            spaceBefore=5, spaceAfter=7,
        ))

        customer_name = customer.get("customer_name") or customer.get("customerName") or "CUSTOMER"
        customer_content = f"<b>{self._text(customer_name)}</b>"
        if customer.get("address"):
            customer_content += f'<br/>{self._text(customer["address"])}'
        customer_box = Table(
            [[Paragraph(customer_content, self.body_style)]],
            colWidths=[min(180, left_width)],
            style=TableStyle([
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#cccccc")),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]),
        )
        left_content = [
            Paragraph("<b>Bill to :</b>", self.body_style),
            Spacer(1, 3),
            customer_box,
        ]
        customer_vat = customer.get("vat_number") or customer.get("vatNumber")
        if customer_vat:
            left_content.append(Paragraph(f"VAT No: {self._text(customer_vat)}", self.body_style))
        gate_number = self._value(sale, "gate_number", "gateNumber")
        if gate_number:
            left_content.append(Paragraph(f"<b>Others/Gate: {self._text(gate_number)}</b>", self.body_style))

        invoice_number = self._value(sale, "invoice_number", "invoiceNumber", default="-")
        customer_type = self._value(
            sale, "payment_mode", "paymentMode", "customer_type", "customerType",
            default="account",
        )
        right_content = [
            Paragraph(f"Date: {self._format_date(sale.get('date'))}", self.right_style),
            Paragraph(f"<b><font color='#1a237e'>Invoice No: {self._text(invoice_number)}</font></b>", self.right_style),
            Paragraph(f"Cust_type: {self._text(customer_type)}", self.right_style),
        ]
        billing = Table([[left_content, right_content]], colWidths=[left_width, right_width])
        billing.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))

        subtotal = self._number(sale.get("subtotal"))
        item_rows = [[
            Paragraph("<b>Product</b>", self.body_style),
            Paragraph("<b>Qty</b>", self.body_style),
            Paragraph("<b>U.Price</b>", self.body_style),
            Paragraph("<b>Total</b>", self.body_style),
        ]]
        quantity_sum = 0
        highlighted_rows = []
        for row_index, item in enumerate(items, start=1):
            quantity = self._number(item.get("quantity"))
            quantity_sum += quantity
            if item.get("highlighted"):
                highlighted_rows.append(row_index)
            product = item.get("productName") or item.get("description") or "-"
            notes = item.get("notes")
            product_text = self._text(product)
            if notes:
                product_text += f' <font size="8.25"><i>- {self._text(notes)}</i></font>'
            item_rows.append([
                Paragraph(product_text, self.body_style),
                Paragraph(self._format_quantity(quantity), self.body_style),
                Paragraph(f'{self._number(item.get("unitPrice")):.2f}', self.body_style),
                Paragraph(f'£{self._number(item.get("totalPrice")):.2f}', self.body_style),
            ])
        item_rows.append([
            Paragraph("<b>SUB TOTAL</b>", self.body_style),
            Paragraph(f"<b>{self._format_quantity(quantity_sum)}</b>", self.body_style),
            Paragraph("<b>X</b>", self.body_style),
            Paragraph(f"<b>£{subtotal:.2f}</b>", self.body_style),
        ])
        item_table = Table(
            item_rows,
            colWidths=[width * 0.60, width * 0.12, width * 0.14, width * 0.14],
            repeatRows=1,
        )
        item_table_style = [
            ("GRID", (0, 0), (-1, -1), 0.6, colors.HexColor("#cccccc")),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f5f5f5")),
            ("ALIGN", (1, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 3.75),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3.75),
        ]
        item_table_style.extend(
            ("BACKGROUND", (0, row_index), (-1, row_index), colors.HexColor("#fff3a3"))
            for row_index in highlighted_rows
        )
        item_table.setStyle(TableStyle(item_table_style))

        invoice_footer = data.get("invoiceFooter") or ""
        notes = Paragraph(self._text(invoice_footer).replace("\n", "<br/>") or "&nbsp;", self.small_style)
        vat = self._number(self._value(sale, "vat_amount", "vatAmount"))
        porterage = self._number(sale.get("porterage"))
        total = self._number(self._value(sale, "total_amount", "totalAmount"))
        paid = self._number(self._value(sale, "paid_amount", "paidAmount", default=data.get("paidAmount")))
        customer_type_key = self._value(sale, "customer_type", "customerType")
        totals_rows = []
        if vat > 0:
            totals_rows.append(["Vat", f"£{vat:.2f}"])
        if porterage > 0:
            totals_rows.append(["Porterage", f"£{porterage:.2f}"])
        totals_rows.append([Paragraph("<b>TOTAL</b>", self.body_style), Paragraph(f"<b>£{total:.2f}</b>", self.body_style)])
        if customer_type_key == "cash" and paid > 0:
            totals_rows.append(["PAID", f"£{paid:.2f}"])
        totals = Table(totals_rows, colWidths=[right_width * 0.48, right_width * 0.52])
        totals.setStyle(TableStyle([
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 3.75),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3.75),
        ]))
        totals_grid = Table([[notes, totals]], colWidths=[left_width, right_width])
        totals_grid.setStyle(TableStyle([
            ("BOX", (0, 0), (0, 0), 0.6, colors.HexColor("#cccccc")),
            ("BOX", (1, 0), (1, 0), 0.6, colors.HexColor("#cccccc")),
            ("LINEABOVE", (0, 0), (-1, 0), 0, colors.white),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("MINROWHEIGHT", (0, 0), (0, 0), 52.5),
        ]))
        footer = Table([[
            Paragraph(f"Invoice Time: {self._format_date(sale.get('date'), include_time=True)}<br/>"
                      f"Current Time: {datetime.now().strftime('%d/%m/%Y, %H:%M:%S')}",
                      ParagraphStyle("BulkA4Footer", parent=self.small_style, alignment=TA_RIGHT))
        ]], colWidths=[width])
        footer.setStyle(TableStyle([
            ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))

        is_paid = (
            str(self._value(sale, "payment_status", "paymentStatus", default="")).lower()
            in ("paid", "overpaid")
            or (total > 0 and paid >= total - 0.01)
            or (data.get("balance") is not None and self._number(data.get("balance")) <= 0.01)
        )
        return [
            *elements,
            title,
            billing,
            Spacer(1, 7.5),
            item_table,
            totals_grid,
            Spacer(1, 13.5),
            footer,
        ], is_paid

    def generate_pdf(self, invoice_data):
        buffer = BytesIO()
        flowables, is_paid = self._invoice_flowables(invoice_data)

        def draw_watermark(canvas, _document):
            if not is_paid:
                return
            canvas.saveState()
            canvas.translate(A4[0] / 2, A4[1] * 0.58)
            canvas.rotate(-22)
            canvas.setStrokeColor(colors.Color(0.78, 0, 0, alpha=0.28))
            canvas.setFillColor(colors.Color(0.78, 0, 0, alpha=0.28))
            canvas.setLineWidth(2)
            canvas.roundRect(-90, -20, 180, 40, 8, stroke=1, fill=0)
            canvas.setFont("Helvetica-Bold", 38)
            canvas.drawCentredString(0, -12, "PAID")
            canvas.restoreState()

        document = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=10 * mm,
            leftMargin=10 * mm,
            topMargin=10 * mm,
            bottomMargin=10 * mm,
            title=f"Invoice {self._value(invoice_data.get('sale') or {}, 'invoice_number', 'invoiceNumber', default='')}",
        )
        document.build(flowables, onFirstPage=draw_watermark, onLaterPages=draw_watermark)
        buffer.seek(0)
        return buffer

    def generate_combined_pdf(self, invoices):
        from pypdf import PdfWriter

        writer = PdfWriter()
        for invoice in invoices:
            writer.append(self.generate_pdf(invoice))
        output = BytesIO()
        writer.write(output)
        writer.close()
        output.seek(0)
        return output
