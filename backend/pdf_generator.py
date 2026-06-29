"""
Fixed PDF Generator for Dot Matrix Invoice - Matches React component exactly
"""

from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from decimal import Decimal
import io
import math
import textwrap
from datetime import datetime


def format_quantity(value):
    """Format quantity to remove unnecessary trailing zeros (matches React formatQuantity)"""
    if value is None or value == '':
        return '0'
    try:
        decimal_val = Decimal(str(value))
        if decimal_val % 1 == 0:
            return str(int(decimal_val))
        formatted = f"{decimal_val:.3f}".rstrip('0').rstrip('.')
        return formatted
    except (ValueError, TypeError):
        return '0'


class DotMatrixInvoicePDF:
    def __init__(self):
        # Page size matches @page rule in React: 189mm x 203.2mm
        self.page_width = 189 * mm
        self.page_height = 203.2 * mm

        # FIELD_POSITIONS from dot-matrix-invoice.tsx - exact match
        self.positions = {
            'accountNo': {'top': 27 * mm, 'left': 12 * mm},
            'customerName': {'top': 35 * mm, 'left': 5 * mm},
            'customerAddress': {'top': 40 * mm, 'left': 5 * mm, 'width': 50 * mm},
            'salesId': {'top': 77 * mm, 'left': 10 * mm},
            'ticketNo': {'top': 77 * mm, 'left': 30 * mm},
            'date': {'top': 77 * mm, 'left': 60 * mm},
            'time': {'top': 77 * mm, 'left': 95 * mm},
            'pageNumber': {'top': 77 * mm, 'left': 125 * mm},
            'itemsStartTop': 95 * mm,
            'itemsRowHeight': 4 * mm,
            'maxItemsPerPage': 11,
            'columns': {
                'quantity': {'left': 4 * mm, 'width': 7 * mm},
                'description': {'left': 24 * mm, 'width': 72 * mm},
                'price': {'left': 88 * mm, 'width': 20 * mm},
                'value': {'left': 105 * mm, 'width': 25 * mm}
            }
        }

        # Constants matching React
        self.CHARS_PER_LINE = 30
        self.ROW_HEIGHT_MM = 4
        self.ITEMS_START_TOP_MM = 95
        self.ITEMS_AVAILABLE_HEIGHT_MM = 72
        self.NOTES_EXTRA_GAP_MM = 3.5

    def _estimate_lines(self, text):
        """Match React's estimateLines()"""
        if not text:
            return 1
        return max(1, math.ceil(len(text) / self.CHARS_PER_LINE))

    def _get_item_display_text(self, item):
        """Match React's getItemDisplayText()"""
        name = item.get('product_name') or item.get('productName') or item.get('description', '')
        note = item.get('notes') or item.get('remarks')
        return f"{name} ({note})" if note else name

    def _calculate_pagination(self, items):
        """Match React's dynamic pagination using line estimates"""
        item_entries = []
        for item in items:
            text = self._get_item_display_text(item)
            lines = self._estimate_lines(text)
            has_notes = bool(item.get('notes') or item.get('remarks'))
            height = lines * (self.ROW_HEIGHT_MM * mm) + (self.NOTES_EXTRA_GAP_MM * mm if has_notes else 0)
            item_entries.append({'item': item, 'lines': lines, 'height': height})

        pages = []
        page_buffer = []
        page_height = 0
        available_height = self.ITEMS_AVAILABLE_HEIGHT_MM * mm

        for entry in item_entries:
            if page_height + entry['height'] > available_height and page_buffer:
                pages.append({
                    'items': [e['item'] for e in page_buffer],
                    'items_height': page_height,
                })
                page_buffer = [entry]
                page_height = entry['height']
            else:
                page_buffer.append(entry)
                page_height += entry['height']

        if page_buffer:
            pages.append({
                'items': [e['item'] for e in page_buffer],
                'items_height': page_height,
            })

        if not pages:
            pages.append({'items': [], 'items_height': 0})

        return pages

    def _draw_format_date(self, date_str):
        """Format date to DD/MM/YYYY"""
        if not date_str:
            return '-'
        try:
            if 'T' in date_str:
                date_obj = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
            else:
                date_obj = datetime.strptime(str(date_str)[:10], '%Y-%m-%d')
            return date_obj.strftime('%d/%m/%Y')
        except Exception:
            return str(date_str)[:10]

    def _draw_format_time(self, date_str):
        """Extract HH:MM from date string"""
        if not date_str:
            return ''
        try:
            if 'T' in date_str:
                date_obj = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                return date_obj.strftime('%H:%M')
        except Exception:
            pass
        return ''

    def generate_pdf(self, invoice_data):
        """Generate PDF matching the React dot-matrix-invoice component exactly"""
        buffer = io.BytesIO()

        p = canvas.Canvas(buffer, pagesize=(self.page_width, self.page_height))
        p.setPageSize((self.page_width, self.page_height))
        p.setTitle(f"Invoice_{invoice_data.get('sale', {}).get('invoice_number', 'Unknown')}")

        sale = invoice_data.get('sale', {})
        customer = invoice_data.get('customer', {})
        items = invoice_data.get('items', [])

        pages = self._calculate_pagination(items)
        total_pages = len(pages)

        total_amount = sum(
            float(item.get('total_price') or item.get('totalPrice', 0))
            for item in items
        )
        vat_amount = float(sale.get('vat_amount', 0))
        porterage = float(sale.get('porterage', 0))

        for page_idx, page_info in enumerate(pages):
            if page_idx > 0:
                p.showPage()
                p.setPageSize((self.page_width, self.page_height))

            is_last_page = (page_idx == total_pages - 1)

            # --- Header fields (all Courier-Bold) ---

            # Account Number - 11pt bold
            p.setFont("Courier-Bold", 11)
            customer_id = (
                customer.get('id') or
                sale.get('customer_id', '')
            )
            p.drawString(
                self.positions['accountNo']['left'],
                self.page_height - self.positions['accountNo']['top'],
                f"C-{customer_id}"
            )

            # Customer Name - 11pt bold
            customer_name = (
                customer.get('customer_name') or
                customer.get('customerName', '')
            )
            p.drawString(
                self.positions['customerName']['left'],
                self.page_height - self.positions['customerName']['top'],
                str(customer_name)
            )

            # Customer Address - 8pt bold, wrapped
            address = customer.get('address', '')
            if address:
                p.setFont("Courier-Bold", 8)
                wrapped_lines = []
                for line in str(address).split('\n'):
                    wrapped_lines.extend(textwrap.wrap(line, width=35))
                y_pos = self.page_height - self.positions['customerAddress']['top']
                for i, line in enumerate(wrapped_lines[:3]):
                    p.drawString(
                        self.positions['customerAddress']['left'],
                        y_pos - (i * 3.5 * mm),
                        line
                    )

            # Sales ID (createdBy) - 10pt bold
            p.setFont("Courier-Bold", 10)
            header_y = self.page_height - self.positions['salesId']['top']
            p.drawString(
                self.positions['salesId']['left'],
                header_y,
                str(sale.get('createdBy', ''))
            )

            # Ticket No (Invoice Number) - 10pt bold
            p.drawString(
                self.positions['ticketNo']['left'],
                header_y,
                str(sale.get('invoice_number') or sale.get('invoiceNumber', ''))
            )

            # Date - 10pt bold, DD/MM/YYYY
            date_str = sale.get('date', '')
            formatted_date = self._draw_format_date(date_str)
            p.drawString(
                self.positions['date']['left'],
                header_y,
                formatted_date
            )

            # Time - 10pt bold, HH:MM
            formatted_time = self._draw_format_time(date_str)
            p.drawString(
                self.positions['time']['left'],
                header_y,
                formatted_time
            )

            # Page Number - 10pt bold
            p.drawString(
                self.positions['pageNumber']['left'],
                header_y,
                f"{page_idx + 1} of {total_pages}"
            )

            # --- Items with dynamic positioning matching React ---
            cumulative_top = self.positions['itemsStartTop']

            for item in page_info['items']:
                text = self._get_item_display_text(item)
                lines_count = self._estimate_lines(text)
                has_notes = bool(item.get('notes') or item.get('remarks'))
                item_height = lines_count * (self.ROW_HEIGHT_MM * mm) + (
                    self.NOTES_EXTRA_GAP_MM * mm if has_notes else 0
                )

                y_pos = self.page_height - cumulative_top

                # Quantity - left aligned, 11pt bold
                qty = item.get('quantity', 0)
                p.setFont("Courier-Bold", 11)
                p.drawString(
                    self.positions['columns']['quantity']['left'],
                    y_pos,
                    format_quantity(qty)
                )

                # Description - left aligned, 11pt bold
                desc_name = item.get('product_name') or item.get('productName') or item.get('description', '')
                note_text = item.get('notes') or item.get('remarks')
                if note_text:
                    desc_full = f"{desc_name} ({note_text})"
                else:
                    desc_full = desc_name
                p.drawString(
                    self.positions['columns']['description']['left'],
                    y_pos,
                    desc_full
                )

                # Unit Price - right aligned within column, 11pt bold
                unit_price = float(item.get('unit_price') or item.get('unitPrice', 0))
                p.drawRightString(
                    self.positions['columns']['price']['left'] + self.positions['columns']['price']['width'],
                    y_pos,
                    f"{unit_price:.2f}"
                )

                # Total Value - right aligned within column, 11pt bold
                total_price = float(item.get('total_price') or item.get('totalPrice', 0))
                p.drawRightString(
                    self.positions['columns']['value']['left'] + self.positions['columns']['value']['width'],
                    y_pos,
                    f"{total_price:.2f}"
                )

                cumulative_top += item_height

            # --- Porterage (last page only, matching React position) ---
            if is_last_page and porterage > 0:
                porterage_y = self.positions['itemsStartTop'] + page_info['items_height']
                y_pos = self.page_height - porterage_y
                p.setFont("Courier-Bold", 11)
                p.drawString(
                    self.positions['columns']['description']['left'],
                    y_pos,
                    "Porterage"
                )
                p.drawRightString(
                    self.positions['columns']['value']['left'] + self.positions['columns']['value']['width'],
                    y_pos,
                    f"£{porterage:.2f}"
                )

            # --- Packages line (last page only) ---
            if is_last_page:
                total_qty = sum(float(item.get('quantity') or 0) for item in items)
                packages_y = (
                    self.positions['itemsStartTop'] +
                    page_info['items_height'] +
                    (self.ROW_HEIGHT_MM * mm if porterage > 0 else 0)
                )
                y_pos = self.page_height - packages_y
                p.setFont("Courier-Bold", 11)
                p.drawString(
                    self.positions['columns']['description']['left'],
                    y_pos,
                    f"({format_quantity(total_qty)} packages)"
                )

            # --- Total (last page only, fixed position) ---
            if is_last_page:
                grand_total = total_amount + vat_amount + porterage
                y_pos = self.page_height - 185 * mm
                p.setFont("Courier-Bold", 11)
                p.drawRightString(
                    108 * mm + 25 * mm,
                    y_pos,
                    f"£{grand_total:.2f}"
                )

        p.save()
        buffer.seek(0)
        return buffer
