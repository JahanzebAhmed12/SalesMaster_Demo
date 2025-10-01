"""
Fixed PDF Generator for Dot Matrix Invoice - Mobility Print Compatible
Addresses positioning, scaling, and mobile printing issues
"""

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm, inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from decimal import Decimal
from reportlab.platypus import PageTemplate, BaseDocTemplate
import io
import os

def format_quantity(value):
    """Format quantity to remove unnecessary trailing zeros"""
    if value is None or value == '':
        return '0'
    
    try:
        # Convert to Decimal for precise handling
        decimal_val = Decimal(str(value))
        
        # If it's a whole number, return without decimals
        if decimal_val % 1 == 0:
            return str(int(decimal_val))
        
        # Otherwise, format with up to 3 decimal places and remove trailing zeros
        formatted = f"{decimal_val:.3f}".rstrip('0').rstrip('.')
        return formatted
    except (ValueError, TypeError):
        return '0'

class DotMatrixInvoicePDF:
    def __init__(self):
        # EXACT custom page size (186mm x 200mm) with precise conversion
        self.page_width = 186 * mm  # 186mm = 527.24 points
        self.page_height = 200 * mm  # 200mm = 566.93 points
        
        # UNIFIED field positions - single source of truth
        # These must match your React component exactly
        self.positions = {
            'accountNo': {'top': 27 * mm, 'left': 1 * mm},
            'customerName': {'top': 35 * mm, 'left': 1 * mm},
            'customerAddress': {'top': 40 * mm, 'left': 3 * mm, 'width': 50 * mm},
            'ticketNo': {'top': 77 * mm, 'left': 23 * mm},
            'date': {'top': 77 * mm, 'left': 48 * mm},
            'pageNumber': {'top': 77 * mm, 'left': 118 * mm},
            'itemsStartTop': 95 * mm,
            'itemsRowHeight': 6 * mm,
            'maxItemsPerPage': 10,  # Match React exactly
            'columns': {
                'quantity': {'left': 1 * mm, 'width': 15 * mm},
                'description': {'left': 10 * mm, 'width': 75 * mm},
                'price': {'left': 77 * mm, 'width': 20 * mm},
                'value': {'left': 95 * mm, 'width': 25 * mm}
            },
            'totals': {
                'goods': {'top': 167 * mm, 'left': 96 * mm, 'width': 25 * mm},
                'vat': {'top': 177 * mm, 'left': 96 * mm, 'width': 25 * mm},
                'total': {'top': 186 * mm, 'left': 96 * mm, 'width': 25 * mm}
            }
        }
    
    def generate_pdf(self, invoice_data):
        """Generate PDF with Mobility Print compatibility"""
        buffer = io.BytesIO()
        
        # Create canvas with EXACT dimensions and NO margins
        p = canvas.Canvas(buffer, pagesize=(self.page_width, self.page_height))
        
        # CRITICAL: Mobility Print compatibility settings
        p.setPageSize((self.page_width, self.page_height))
        
        # Enhanced PDF metadata for Mobility Print
        p.setTitle(f"Invoice_{invoice_data.get('sale', {}).get('invoice_number', 'Unknown')}")
        p.setAuthor("Dot_Matrix_System")
        p.setSubject("Invoice_Exact_Size")
        p.setCreator("Custom_PDF_Generator_v2")
        
        # MOBILITY PRINT SPECIFIC: Add custom properties
        try:
            # These help Mobility Print recognize the exact sizing requirements
            p._doc.info.producer = f"ExactSize_{self.page_width/mm:.1f}x{self.page_height/mm:.1f}mm"
            p._doc.info.keywords = "NoAutoScale,NoMargin,ExactFit,DotMatrix"
            p._doc.info.subject = f"CustomSize_{self.page_width/mm:.0f}mm_x_{self.page_height/mm:.0f}mm"
            
            # Add custom PDF dictionary entries that some print systems respect
            catalog = p._doc.catalog
            if hasattr(catalog, 'ViewerPreferences'):
                catalog.ViewerPreferences = {
                    'PrintScaling': 'None',  # Prevent auto-scaling
                    'Duplex': 'Simplex',     # Single-sided
                    'FitWindow': False,      # Don't fit to window
                    'CenterWindow': True     # Center the document
                }
        except Exception as e:
            print(f"Warning: Could not set advanced PDF properties: {e}")
        
        # Force exact font sizing for consistency
        try:
            # Use built-in Courier font for maximum compatibility
            p.setFont("Courier", 10)  # 10pt = exact match to CSS
        except:
            p.setFont("Helvetica", 10)  # Fallback
        
        # Calculate pagination (match React exactly)
        items = invoice_data.get('items', [])
        items_per_page = self.positions['maxItemsPerPage']  # Use same constant
        total_pages = max(1, (len(items) + items_per_page - 1) // items_per_page)
        
        # Generate pages
        for page_num in range(total_pages):
            if page_num > 0:
                p.showPage()
                # Re-enforce page size for each new page
                p.setPageSize((self.page_width, self.page_height))
                p.setFont("Courier", 10)  # Reset font
            
            # Calculate items for this page (exact match to React logic)
            start_idx = page_num * items_per_page
            end_idx = min(start_idx + items_per_page, len(items))
            page_items = items[start_idx:end_idx]
            is_last_page = (page_num == total_pages - 1)
            
            # Add content
            self._add_header_info(p, invoice_data, page_num + 1, total_pages)
            self._add_items(p, page_items, start_idx)  # Pass start_idx for debugging
            
            if is_last_page:
                self._add_totals(p, invoice_data)
        
        # MOBILITY PRINT: Final settings for better compatibility
        p.setPageCompression(1)  # Enable compression for smaller files
        
        # Add final page properties
        try:
            # Set PDF version for better compatibility
            p._doc.version = (1, 4)  # PDF 1.4 is widely supported
        except:
            pass
        
        p.save()
        buffer.seek(0)
        return buffer
    
    def _add_header_info(self, canvas, data, page_num=1, total_pages=1):
        """Add header information with exact positioning"""
        
        # Account Number (Customer ID)
        canvas.setFont("Courier-Bold", 10)
        y_pos = self.page_height - self.positions['accountNo']['top']
        customer_id = (
            data.get('customer', {}).get('id') or 
            data.get('sale', {}).get('customer_id') or 
            data.get('customer_id', '')
        )
        canvas.drawString(
            self.positions['accountNo']['left'],
            y_pos,
            f"C-{customer_id}"
        )
        
        # Customer Name
        canvas.setFont("Courier", 10)
        y_pos = self.page_height - self.positions['customerName']['top']
        customer_name = (
            data.get('customer', {}).get('customer_name') or 
            data.get('customer', {}).get('customerName') or 
            ''
        )
        canvas.drawString(
            self.positions['customerName']['left'],
            y_pos,
            str(customer_name)
        )
        
        # Customer Address (handle multi-line properly)
        canvas.setFont("Courier", 8)
        address = data.get('customer', {}).get('address', '')
        if address:
            # Split address and handle line wrapping
            import textwrap
            # Wrap text to fit within the allocated width (approximately 35 chars for 50mm width)
            wrapped_lines = []
            for line in str(address).split('\n'):
                wrapped_lines.extend(textwrap.wrap(line, width=35))
            
            y_pos = self.page_height - self.positions['customerAddress']['top']
            for i, line in enumerate(wrapped_lines[:3]):  # Max 3 lines
                canvas.drawString(
                    self.positions['customerAddress']['left'],
                    y_pos - (i * 3.5 * mm),  # 3.5mm line spacing
                    line
                )
        
        # Invoice Number
        canvas.setFont("Courier", 10)
        y_pos = self.page_height - self.positions['ticketNo']['top']
        invoice_number = (
            data.get('sale', {}).get('invoice_number') or 
            data.get('sale', {}).get('invoiceNumber') or 
            ''
        )
        canvas.drawString(
            self.positions['ticketNo']['left'],
            y_pos,
            str(invoice_number)
        )
        
        # Date
        y_pos = self.page_height - self.positions['date']['top']
        date_str = data.get('sale', {}).get('date', '')
        if date_str:
            try:
                from datetime import datetime
                # Handle various date formats
                if 'T' in date_str:
                    date_obj = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                else:
                    date_obj = datetime.strptime(date_str, '%Y-%m-%d')
                formatted_date = date_obj.strftime('%d/%m/%Y')
            except:
                formatted_date = str(date_str)[:10]
        else:
            formatted_date = '-'
        
        canvas.drawString(
            self.positions['date']['left'],
            y_pos,
            formatted_date
        )
        
        # Page Number
        canvas.drawString(
            self.positions['pageNumber']['left'],
            y_pos,
            f"{page_num} of {total_pages}"
        )
    
    def _add_items(self, canvas, items, page_start_index=0):
        """Add invoice items with exact positioning to match React"""
        canvas.setFont("Courier", 10)
        
        # Calculate starting Y position (match React calculation exactly)
        start_y = self.page_height - self.positions['itemsStartTop']
        
        for i, item in enumerate(items):
            # Y position calculation must match React exactly
            y_pos = start_y - (i * self.positions['itemsRowHeight'])
            
            # Debug output to match React console logs
            product_name = (
                item.get('product_name') or 
                item.get('productName') or 
                item.get('description', '')
            )
            print(f"PDF: Item {i}: {product_name} at {(self.positions['itemsStartTop'] + i * self.positions['itemsRowHeight'])/mm:.0f}mm")
            
            # Quantity - left aligned
            quantity = item.get('quantity', '')
            canvas.drawString(
                self.positions['columns']['quantity']['left'],
                y_pos,
                format_quantity(quantity)
            )
            
            # Description - left aligned, truncated to fit
            # Calculate max characters based on column width (roughly 3.5 chars per mm)
            max_chars = int((self.positions['columns']['description']['width'] / mm) * 2.8)
            description = product_name[:max_chars] if product_name else ''
            canvas.drawString(
                self.positions['columns']['description']['left'],
                y_pos,
                description
            )
            
            # Unit Price - right aligned within column
            unit_price = item.get('unit_price') or item.get('unitPrice', 0)
            canvas.drawRightString(
                self.positions['columns']['price']['left'] + self.positions['columns']['price']['width'],
                y_pos,
                f"{float(unit_price):.2f}"
            )
            
            # Total Value - right aligned within column (match React format exactly)
            total_price = item.get('total_price') or item.get('totalPrice', 0)
            canvas.drawRightString(
                self.positions['columns']['value']['left'] + self.positions['columns']['value']['width'],
                y_pos,
                f"£{float(total_price):.2f}"
            )
    
    def _add_totals(self, canvas, data):
        """Add totals section with exact positioning"""
        canvas.setFont("Courier", 10)
        
        # Calculate totals (match React calculation exactly)
        items = data.get('items', [])
        total_amount = sum(
            float(item.get('total_price') or item.get('totalPrice', 0)) 
            for item in items
        )
        vat_amount = float(data.get('sale', {}).get('vat_amount', 0))
        
        # Goods Total
        y_pos = self.page_height - self.positions['totals']['goods']['top']
        canvas.drawRightString(
            self.positions['totals']['goods']['left'] + self.positions['totals']['goods']['width'],
            y_pos,
            f"£{total_amount:.2f}"
        )
        
        # VAT
        y_pos = self.page_height - self.positions['totals']['vat']['top']
        canvas.drawRightString(
            self.positions['totals']['vat']['left'] + self.positions['totals']['vat']['width'],
            y_pos,
            f"£{vat_amount:.2f}"
        )
        
        # Grand Total
        y_pos = self.page_height - self.positions['totals']['total']['top']
        canvas.drawRightString(
            self.positions['totals']['total']['left'] + self.positions['totals']['total']['width'],
            y_pos,
            f"£{(total_amount + vat_amount):.2f}"
        )

# Additional utility function for Mobility Print server configuration
def get_mobility_print_settings():
    """
    Return recommended Mobility Print server settings for this custom paper size
    """
    return {
        'paper_size_name': 'DotMatrix_186x200',
        'width_mm': 186,
        'height_mm': 200,
        'margins_mm': {'top': 0, 'bottom': 0, 'left': 0, 'right': 0},
        'scaling': 'none',
        'fit_to_page': False,
        'center_horizontally': False,
        'center_vertically': False,
        'print_quality': 'draft',  # Better for dot matrix
        'color_mode': 'monochrome'
    }