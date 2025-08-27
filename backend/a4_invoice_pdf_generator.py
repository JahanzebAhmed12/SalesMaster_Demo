"""
A4 Invoice PDF Generator
Generates A4 format PDFs matching the invoice.tsx layout
"""

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
import io
import os
from datetime import datetime

class A4InvoicePDF:
    def __init__(self):
        # A4 page size
        self.page_width, self.page_height = A4
        self.margin = 24  # 24 points margin (similar to the 24px in the HTML)
        
        # Colors
        self.primary_color = (26, 35, 126)  # #1a237e
        self.secondary_color = (25, 118, 210)  # #1976d2
        self.gray_color = (136, 136, 136)  # #888
        self.light_gray = (245, 245, 245)  # #f5f5f5
    
    def generate_pdf(self, invoice_data):
        """Generate A4 invoice PDF from invoice data"""
        buffer = io.BytesIO()
        
        # Create canvas
        p = canvas.Canvas(buffer, pagesize=A4)
        
        # Add PDF metadata
        p.setTitle(f"Invoice {invoice_data.get('sale', {}).get('invoice_number', 'Unknown')}")
        p.setAuthor("Invoice System")
        p.setSubject("A4 Invoice Document")
        p.setCreator("A4 Invoice PDF Generator")
        
        # Set page size explicitly
        p.setPageSize(A4)
        
        # Start drawing from top
        y_position = self.page_height - self.margin
        
        # Header: Company Details and Logo
        y_position = self._draw_header(p, invoice_data, y_position)
        
        # Horizontal line
        p.setStrokeColor(self.gray_color)
        p.setLineWidth(1)
        p.line(self.margin, y_position - 10, self.page_width - self.margin, y_position - 10)
        y_position -= 25
        
        # Bill To and Invoice Details
        y_position = self._draw_bill_to_and_details(p, invoice_data, y_position)
        
        # Items Table
        y_position = self._draw_items_table(p, invoice_data, y_position)
        
        # Notes and Totals
        y_position = self._draw_notes_and_totals(p, invoice_data, y_position)
        
        # Footer
        self._draw_footer(p, invoice_data, y_position)
        
        # Save PDF
        p.save()
        buffer.seek(0)
        return buffer
    
    def _draw_header(self, canvas, data, y_position):
        """Draw company header with logo"""
        company = data.get('company', {})
        
        # Company info on left
        canvas.setFont("Helvetica-Bold", 18)
        company_name = company.get('companyName', 'Company Name')
        canvas.drawString(self.margin, y_position, company_name)
        y_position -= 20
        
        canvas.setFont("Helvetica", 14)
        address1 = company.get('address1', '')
        address2 = company.get('address2', '')
        full_address = address1 + (", " + address2 if address2 else "")
        if full_address:
            canvas.drawString(self.margin, y_position, full_address)
            y_position -= 16
        
        if company.get('compRegNo'):
            canvas.drawString(self.margin, y_position, f"Company Reg No: {company['compRegNo']}")
            y_position -= 16
            
        if company.get('vatNo'):
            canvas.drawString(self.margin, y_position, f"VAT No: {company['vatNo']}")
            y_position -= 16
        
        # Logo and INVOICE text on right
        canvas.setFont("Helvetica-Bold", 28)
        canvas.drawRightString(self.page_width - self.margin, self.page_height - self.margin - 60, "INVOICE")
        
        # Note: Logo would need to be handled separately with reportlab's image functions
        # For now, we'll skip the logo to keep it simple
        
        return y_position - 20
    
    def _draw_bill_to_and_details(self, canvas, data, y_position):
        """Draw bill to section and invoice details"""
        customer = data.get('customer', {})
        sale = data.get('sale', {})
        
        # Bill To section (left side)
        canvas.setFont("Helvetica-Bold", 12)
        canvas.drawString(self.margin, y_position, "Bill to :")
        y_position -= 16
        
        # Customer box
        box_x = self.margin
        box_y = y_position - 60
        box_width = 200
        box_height = 60
        
        canvas.setStrokeColor(self.gray_color)
        canvas.setLineWidth(1)
        canvas.rect(box_x, box_y, box_width, box_height)
        
        # Customer details inside box
        canvas.setFont("Helvetica-Bold", 12)
        customer_name = customer.get('customer_name', 'CUSTOMER')
        canvas.drawString(box_x + 8, box_y + box_height - 16, customer_name)
        
        if customer.get('address'):
            canvas.setFont("Helvetica", 10)
            # Split address into lines if too long
            address_lines = self._wrap_text(customer['address'], 25)
            for i, line in enumerate(address_lines[:3]):  # Max 3 lines
                canvas.drawString(box_x + 8, box_y + box_height - 32 - (i * 12), line)
        
        # VAT number below box
        if customer.get('vat_number'):
            canvas.setFont("Helvetica", 10)
            canvas.drawString(box_x, box_y - 16, f"VAT No: {customer['vat_number']}")
        
        # Gate number
        if sale.get('gateNumber'):
            canvas.setFont("Helvetica-Bold", 14)
            canvas.drawString(box_x, box_y - 35, f"Others/Gate: {sale['gateNumber']}")
        
        # Invoice details (right side)
        today_str = datetime.now().strftime('%d/%m/%Y')
        canvas.setFont("Helvetica", 16)
        canvas.drawRightString(self.page_width - self.margin, y_position, f"Date: {today_str}")
        
        canvas.setFont("Helvetica-Bold", 18)
        canvas.setFillColor(self.primary_color)
        invoice_number = sale.get('invoice_number') or sale.get('invoiceNumber', '-')
        canvas.drawRightString(self.page_width - self.margin, y_position - 20, f"Invoice No: {invoice_number}")
        canvas.setFillColorRGB(0, 0, 0)  # Reset to black
        
        canvas.setFont("Helvetica", 14)
        customer_type = sale.get('customer_type', 'account')
        canvas.drawRightString(self.page_width - self.margin, y_position - 40, f"Cust.type: {customer_type}")
        
        return y_position - 100
    
    def _draw_items_table(self, canvas, data, y_position):
        """Draw items table"""
        items = data.get('items', [])
        
        # Table headers
        table_x = self.margin
        table_width = self.page_width - (2 * self.margin)
        col_widths = [table_width * 0.5, table_width * 0.15, table_width * 0.15, table_width * 0.2]
        
        # Header row
        canvas.setFillColor(self.light_gray)
        canvas.rect(table_x, y_position - 20, table_width, 20, fill=1)
        canvas.setFillColorRGB(0, 0, 0)
        
        canvas.setFont("Helvetica-Bold", 12)
        canvas.drawString(table_x + 4, y_position - 15, "Product")
        self._draw_centered_text(canvas, table_x + col_widths[0] + col_widths[1]/2, y_position - 15, "Qty")
        self._draw_centered_text(canvas, table_x + col_widths[0] + col_widths[1] + col_widths[2]/2, y_position - 15, "U.Price")
        self._draw_centered_text(canvas, table_x + col_widths[0] + col_widths[1] + col_widths[2] + col_widths[3]/2, y_position - 15, "Total")
        
        y_position -= 20
        
        # Table borders
        canvas.setStrokeColor(self.gray_color)
        canvas.setLineWidth(1)
        
        # Draw items
        canvas.setFont("Helvetica", 12)
        row_height = 25
        
        for item in items:
            # Row background (alternating could be added here)
            canvas.rect(table_x, y_position - row_height, table_width, row_height)
            
            # Product name and notes
            product_name = item.get('productName') or item.get('description', '-')
            canvas.drawString(table_x + 4, y_position - 15, product_name)
            
            if item.get('notes'):
                canvas.setFont("Helvetica-Oblique", 10)
                canvas.setFillColorRGB(0.4, 0.4, 0.4)
                canvas.drawString(table_x + 4, y_position - 25, item['notes'])
                canvas.setFillColorRGB(0, 0, 0)
                canvas.setFont("Helvetica", 12)
            
            # Quantity
            qty = str(item.get('quantity', ''))
            self._draw_centered_text(canvas, table_x + col_widths[0] + col_widths[1]/2, y_position - 15, qty)
            
            # Unit Price
            unit_price = item.get('unitPrice', 0)
            price_str = f"{unit_price:.2f}" if unit_price else "-"
            self._draw_centered_text(canvas, table_x + col_widths[0] + col_widths[1] + col_widths[2]/2, y_position - 15, price_str)
            
            # Total Price
            total_price = item.get('totalPrice', 0)
            total_str = f"£{total_price:.2f}" if total_price else "-"
            self._draw_centered_text(canvas, table_x + col_widths[0] + col_widths[1] + col_widths[2] + col_widths[3]/2, y_position - 15, total_str)
            
            y_position -= row_height
        
        # Subtotal row
        canvas.setFont("Helvetica-Bold", 12)
        canvas.rect(table_x, y_position - row_height, table_width, row_height)
        
        canvas.drawString(table_x + 4, y_position - 15, "SUB TOTAL")
        
        total_qty = sum(item.get('quantity', 0) for item in items)
        self._draw_centered_text(canvas, table_x + col_widths[0] + col_widths[1]/2, y_position - 15, str(total_qty))
        self._draw_centered_text(canvas, table_x + col_widths[0] + col_widths[1] + col_widths[2]/2, y_position - 15, "X")
        
        subtotal = data.get('sale', {}).get('subtotal', 0)
        self._draw_centered_text(canvas, table_x + col_widths[0] + col_widths[1] + col_widths[2] + col_widths[3]/2, y_position - 15, f"£{subtotal:.2f}")
        
        return y_position - row_height
    
    def _draw_notes_and_totals(self, canvas, data, y_position):
        """Draw notes section and totals"""
        sale = data.get('sale', {})
        notes = data.get('notes', '')
        
        # Notes section (left side)
        notes_x = self.margin
        notes_width = (self.page_width - (2 * self.margin)) * 0.6
        notes_height = 80
        
        canvas.setStrokeColor(self.gray_color)
        canvas.rect(notes_x, y_position - notes_height, notes_width, notes_height)
        
        if notes:
            canvas.setFont("Helvetica-Oblique", 11)
            canvas.setFillColorRGB(0.5, 0.5, 0.5)
            notes_lines = notes.split('\n')
            for i, line in enumerate(notes_lines[:5]):  # Max 5 lines
                canvas.drawString(notes_x + 8, y_position - 20 - (i * 14), line)
            canvas.setFillColorRGB(0, 0, 0)
        
        # Totals section (right side)
        totals_x = notes_x + notes_width
        totals_width = (self.page_width - (2 * self.margin)) * 0.4
        
        canvas.setFont("Helvetica", 12)
        
        # VAT
        vat_amount = sale.get('vat_amount', 0)
        canvas.drawString(totals_x + 8, y_position - 20, "Vat")
        canvas.drawRightString(totals_x + totals_width - 8, y_position - 20, f"£{vat_amount:.2f}")
        
        # Porterage
        porterage = sale.get('porterage', 0)
        canvas.drawString(totals_x + 8, y_position - 40, "Porterage")
        canvas.drawRightString(totals_x + totals_width - 8, y_position - 40, f"£{porterage:.2f}")
        
        # Total
        canvas.setFont("Helvetica-Bold", 12)
        total_amount = sale.get('total_amount') or sale.get('totalAmount', 0)
        canvas.drawString(totals_x + 8, y_position - 60, "TOTAL")
        canvas.drawRightString(totals_x + totals_width - 8, y_position - 60, f"£{total_amount:.2f}")
        
        # Payment details
        customer_type = sale.get('customer_type', 'account')
        paid_amount = sale.get('paid_amount') or sale.get('paidAmount', 0)
        
        if customer_type == 'cash':
            payment_mode = sale.get('payment_mode') or sale.get('paymentMode', 'cash')
            display_mode = {
                'cash': 'Cash',
                'bank': 'Card',
                'bank_transfer': 'Bank Transfer',
                'cheque': 'Cheque'
            }.get(payment_mode, payment_mode)
            
            canvas.drawString(totals_x + 8, y_position - 80, "PAID")
            canvas.drawRightString(totals_x + totals_width - 8, y_position - 80, f"{display_mode} £{paid_amount:.2f}")
        else:
            account_balance = total_amount - paid_amount
            canvas.drawString(totals_x + 8, y_position - 80, "ACCOUNT")
            canvas.drawRightString(totals_x + totals_width - 8, y_position - 80, f"£{account_balance:.2f}")
        
        # Draw totals box border
        canvas.rect(totals_x, y_position - notes_height, totals_width, notes_height)
        
        return y_position - notes_height - 20
    
    def _draw_footer(self, canvas, data, y_position):
        """Draw footer information"""
        sale = data.get('sale', {})
        
        canvas.setFont("Helvetica", 11)
        canvas.setFillColorRGB(0.3, 0.3, 0.3)
        
        # Invoice time
        if sale.get('date'):
            try:
                invoice_date = datetime.fromisoformat(sale['date'].replace('Z', '+00:00'))
                invoice_time_str = invoice_date.strftime('%d/%m/%Y %H:%M:%S')
            except:
                invoice_time_str = str(sale['date'])
        else:
            invoice_time_str = "-"
        
        canvas.drawString(self.margin, y_position, f"Invoice Time: {invoice_time_str}")
        
        # Current time
        current_time_str = datetime.now().strftime('%d/%m/%Y %H:%M:%S')
        canvas.drawString(self.margin, y_position - 16, f"Current Time: {current_time_str}")
        
        canvas.setFillColorRGB(0, 0, 0)  # Reset to black
    
    def _wrap_text(self, text, max_chars):
        """Simple text wrapping"""
        words = text.split()
        lines = []
        current_line = ""
        
        for word in words:
            if len(current_line + " " + word) <= max_chars:
                current_line += (" " + word) if current_line else word
            else:
                if current_line:
                    lines.append(current_line)
                current_line = word
        
        if current_line:
            lines.append(current_line)
        
        return lines
    
    def _draw_centered_text(self, canvas, x, y, text):
        """Helper method to draw centered text"""
        text_width = canvas.stringWidth(str(text))
        canvas.drawString(x - text_width/2, y, str(text))