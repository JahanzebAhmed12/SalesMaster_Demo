"""
PDF Generator for Dot Matrix Invoice
Generates pixel-perfect PDFs matching the HTML layout
"""

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import PageTemplate, BaseDocTemplate
import io
import os

class DotMatrixInvoicePDF:
    def __init__(self):
        # Custom page size (18.6cm x 20cm)
        self.page_width = 186 * mm
        self.page_height = 200 * mm
        self.margin = 3 * mm
        
        # Field positions (matching your HTML FIELD_POSITIONS)
        self.positions = {
            'accountNo': {'top': 25 * mm, 'left': 1 * mm},
            'customerName': {'top': 35 * mm, 'left': 1 * mm},
            'customerAddress': {'top': 40 * mm, 'left': 1 * mm, 'width': 50 * mm},
            'ticketNo': {'top': 75 * mm, 'left': 23 * mm},
            'date': {'top': 75 * mm, 'left': 50 * mm},
            'pageNumber': {'top': 75 * mm, 'left': 118 * mm},
            'itemsStartTop': 95 * mm,
            'itemsRowHeight': 6 * mm,
            'columns': {
                'quantity': {'left': 1 * mm, 'width': 15 * mm},
                'description': {'left': 13 * mm, 'width': 75 * mm},
                'price': {'left': 80 * mm, 'width': 20 * mm},
                'value': {'left': 95 * mm, 'width': 25 * mm}
            },
            'totals': {
                'goods': {'top': 167 * mm, 'left': 96 * mm, 'width': 25 * mm},
                'vat': {'top': 177 * mm, 'left': 96 * mm, 'width': 25 * mm},
                'total': {'top': 182 * mm, 'left': 96 * mm, 'width': 25 * mm}
            }
        }
    
    def generate_pdf(self, invoice_data):
        """Generate PDF from invoice data with proper pagination"""
        buffer = io.BytesIO()
        
        # Create canvas with explicit page size metadata
        p = canvas.Canvas(buffer, pagesize=(self.page_width, self.page_height))
        
        # Add PDF metadata to prevent scaling
        p.setTitle(f"Invoice {invoice_data.get('sale', {}).get('invoice_number', 'Unknown')}")
        p.setAuthor("Dot Matrix Invoice System")
        p.setSubject("Invoice Document")
        p.setCreator("Custom PDF Generator")
        
        # Set page size explicitly in PDF metadata
        p.setPageSize((self.page_width, self.page_height))
        
        # Add custom PDF properties to prevent auto-scaling
        p._doc.info.producer = "Dot Matrix Invoice Generator"
        p._doc.info.title = f"Invoice {invoice_data.get('sale', {}).get('invoice_number', 'Unknown')}"
        
        # Set up fonts (monospace to match HTML)
        try:
            # Try to use Courier (built-in monospace)
            p.setFont("Courier-Bold", 12)
        except:
            p.setFont("Helvetica", 12)
        
        # Calculate pagination
        items = invoice_data.get('items', [])
        items_per_page = 11  # Max 11 items per page
        total_pages = max(1, (len(items) + items_per_page - 1) // items_per_page)
        
        # Generate pages
        for page_num in range(total_pages):
            if page_num > 0:
                p.showPage()  # Start new page
                p.setPageSize((self.page_width, self.page_height))
            
            # Calculate items for this page
            start_idx = page_num * items_per_page
            end_idx = min(start_idx + items_per_page, len(items))
            page_items = items[start_idx:end_idx]
            is_last_page = (page_num == total_pages - 1)
            
            # Add content for this page
            self._add_header_info(p, invoice_data, page_num + 1, total_pages)
            self._add_items(p, page_items)
            
            # Only add totals on the last page
            if is_last_page:
                self._add_totals(p, invoice_data)
        
        # Add page metadata to prevent scaling
        p.setPageCompression(0)  # Disable compression for better compatibility
        
        # Save PDF with explicit size preservation
        p.save()
        buffer.seek(0)
        return buffer
    
    def _add_header_info(self, canvas, data, page_num=1, total_pages=1):
        """Add header information (customer, invoice number, etc.)"""
        # Account Number (Customer ID)
        canvas.setFont("Courier-Bold", 12)
        y_pos = self.page_height - self.positions['accountNo']['top'] - self.margin
        canvas.drawString(
            self.positions['accountNo']['left'] + self.margin,
            y_pos,
            f"C-{data.get('customer', {}).get('id', data.get('customer_id', ''))}"
        )
        
        # Customer Name
        canvas.setFont("Courier", 12)
        y_pos = self.page_height - self.positions['customerName']['top'] - self.margin
        customer_name = (
            data.get('customer', {}).get('customer_name') or 
            data.get('customer', {}).get('customerName') or 
            data.get('customer_name', '')
        )
        canvas.drawString(
            self.positions['customerName']['left'] + self.margin,
            y_pos,
            customer_name
        )
        
        # Customer Address
        canvas.setFont("Courier", 10)
        address = data.get('customer', {}).get('address', '')
        if address:
            address_lines = address.split('\n')
            y_pos = self.page_height - self.positions['customerAddress']['top'] - self.margin
            for line in address_lines[:3]:  # Max 3 lines
                canvas.drawString(
                    self.positions['customerAddress']['left'] + self.margin,
                    y_pos,
                    line[:40]  # Truncate long lines
                )
                y_pos -= 4 * mm
        
        # Invoice Number
        canvas.setFont("Courier", 12)
        y_pos = self.page_height - self.positions['ticketNo']['top'] - self.margin
        invoice_number = (
            data.get('sale', {}).get('invoice_number') or 
            data.get('sale', {}).get('invoiceNumber') or 
            data.get('invoice_number', '')
        )
        canvas.drawString(
            self.positions['ticketNo']['left'] + self.margin,
            y_pos,
            str(invoice_number)
        )
        
        # Date
        y_pos = self.page_height - self.positions['date']['top'] - self.margin
        date_str = data.get('sale', {}).get('date', '')
        if date_str:
            try:
                from datetime import datetime
                date_obj = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                formatted_date = date_obj.strftime('%d/%m/%Y')
            except:
                formatted_date = str(date_str)[:10]  # Fallback
        else:
            formatted_date = '-'
        
        canvas.drawString(
            self.positions['date']['left'] + self.margin,
            y_pos,
            formatted_date
        )
        
        # Page Number
        canvas.drawString(
            self.positions['pageNumber']['left'] + self.margin,
            y_pos,
            f"{page_num} of {total_pages}"
        )
    
    def _add_items(self, canvas, items):
        """Add invoice items"""
        canvas.setFont("Courier", 12)
        
        start_y = self.page_height - self.positions['itemsStartTop'] - self.margin
        
        for i, item in enumerate(items):  # Process all items passed to this method
            y_pos = start_y - (i * self.positions['itemsRowHeight'])
            
            # Quantity
            canvas.drawString(
                self.positions['columns']['quantity']['left'] + self.margin,
                y_pos,
                str(item.get('quantity', ''))
            )
            
            # Description
            description = (
                item.get('product_name') or 
                item.get('productName') or 
                item.get('description', '')
            )
            # Truncate to fit width
            canvas.drawString(
                self.positions['columns']['description']['left'] + self.margin,
                y_pos,
                description[:30]  # Truncate long descriptions
            )
            
            # Unit Price
            unit_price = item.get('unit_price') or item.get('unitPrice', 0)
            canvas.drawRightString(
                self.positions['columns']['price']['left'] + self.positions['columns']['price']['width'] + self.margin,
                y_pos,
                f"{float(unit_price):.2f}"
            )
            
            # Total Value
            total_price = item.get('total_price') or item.get('totalPrice', 0)
            canvas.drawRightString(
                self.positions['columns']['value']['left'] + self.positions['columns']['value']['width'] + self.margin,
                y_pos,
                f"£{float(total_price):.2f}"
            )
    
    def _add_totals(self, canvas, data):
        """Add totals section"""
        canvas.setFont("Courier", 12)
        
        # Calculate totals
        items = data.get('items', [])
        total_amount = sum(item.get('total_price', item.get('totalPrice', 0)) for item in items)
        vat_amount = data.get('sale', {}).get('vat_amount', 0)
        
        # Goods Total
        y_pos = self.page_height - self.positions['totals']['goods']['top'] - self.margin
        canvas.drawRightString(
            self.positions['totals']['goods']['left'] + self.positions['totals']['goods']['width'] + self.margin,
            y_pos,
            f"£{total_amount:.2f}"
        )
        
        # VAT
        y_pos = self.page_height - self.positions['totals']['vat']['top'] - self.margin
        canvas.drawRightString(
            self.positions['totals']['vat']['left'] + self.positions['totals']['vat']['width'] + self.margin,
            y_pos,
            f"£{float(vat_amount):.2f}"
        )
        
        # Total
        y_pos = self.page_height - self.positions['totals']['total']['top'] - self.margin
        canvas.drawRightString(
            self.positions['totals']['total']['left'] + self.positions['totals']['total']['width'] + self.margin,
            y_pos,
            f"£{total_amount + float(vat_amount):.2f}"
        )