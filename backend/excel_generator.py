"""
Excel Generator for Invoice Export
Generates Excel files for invoice data
"""

import io
import pandas as pd
from datetime import datetime
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, Border, Side, PatternFill
from openpyxl.utils.dataframe import dataframe_to_rows

class InvoiceExcelGenerator:
    def __init__(self):
        self.header_font = Font(bold=True, size=12)
        self.title_font = Font(bold=True, size=14)
        self.border = Border(
            left=Side(style='thin'),
            right=Side(style='thin'),
            top=Side(style='thin'),
            bottom=Side(style='thin')
        )
        self.header_fill = PatternFill(start_color='E6E6FA', end_color='E6E6FA', fill_type='solid')
    
    def generate_invoice_excel(self, invoice_data):
        """Generate Excel file from invoice data"""
        wb = Workbook()
        ws = wb.active
        ws.title = "Invoice"
        
        # Company header
        ws['A1'] = "TROPIFRUIT UK LTD"
        ws['A1'].font = self.title_font
        ws['A2'] = "3 Dolphin Way, Purfleet, RM19 1NZ"
        
        # Invoice details
        row = 4
        ws[f'A{row}'] = "INVOICE"
        ws[f'A{row}'].font = self.title_font
        
        row += 2
        ws[f'A{row}'] = "Invoice Number:"
        ws[f'B{row}'] = invoice_data.get('sale', {}).get('invoice_number', 'N/A')
        ws[f'A{row}'].font = self.header_font
        
        row += 1
        ws[f'A{row}'] = "Date:"
        ws[f'B{row}'] = invoice_data.get('sale', {}).get('date', datetime.now().strftime('%Y-%m-%d'))
        ws[f'A{row}'].font = self.header_font
        
        row += 1
        ws[f'A{row}'] = "Customer:"
        customer_name = invoice_data.get('customer', {}).get('customer_name') or invoice_data.get('customer', {}).get('customerName', 'N/A')
        ws[f'B{row}'] = customer_name
        ws[f'A{row}'].font = self.header_font
        
        # Vehicle and gate details if present
        if invoice_data.get('sale', {}).get('vehicle_details'):
            row += 1
            ws[f'A{row}'] = "Vehicle Details:"
            ws[f'B{row}'] = invoice_data.get('sale', {}).get('vehicle_details')
            ws[f'A{row}'].font = self.header_font
            
        if invoice_data.get('sale', {}).get('gate_number'):
            row += 1
            ws[f'A{row}'] = "Gate Number:"
            ws[f'B{row}'] = invoice_data.get('sale', {}).get('gate_number')
            ws[f'A{row}'].font = self.header_font
        
        # Items table
        row += 3
        headers = ['Product', 'Notes', 'Quantity', 'Unit Price', 'Total Price']
        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=row, column=col, value=header)
            cell.font = self.header_font
            cell.fill = self.header_fill
            cell.border = self.border
            cell.alignment = Alignment(horizontal='center')
        
        # Items data
        items = invoice_data.get('items', [])
        for item in items:
            row += 1
            product_name = item.get('product_name') or item.get('productName', 'N/A')
            notes = item.get('notes', '')
            quantity = item.get('quantity', 0)
            unit_price = item.get('unit_price') or item.get('unitPrice', 0)
            total_price = item.get('total_price') or item.get('totalPrice', 0)
            
            ws.cell(row=row, column=1, value=product_name).border = self.border
            ws.cell(row=row, column=2, value=notes).border = self.border
            ws.cell(row=row, column=3, value=quantity).border = self.border
            ws.cell(row=row, column=4, value=f"£{float(unit_price):.2f}").border = self.border
            ws.cell(row=row, column=5, value=f"£{float(total_price):.2f}").border = self.border
        
        # Totals
        row += 2
        sale_data = invoice_data.get('sale', {})
        subtotal = sale_data.get('subtotal', 0)
        vat_amount = sale_data.get('vat_amount', 0)
        porterage = sale_data.get('porterage', 0)
        total_amount = sale_data.get('total_amount', 0)
        
        ws[f'D{row}'] = "Sub Total:"
        ws[f'D{row}'].font = self.header_font
        ws[f'E{row}'] = f"£{float(subtotal):.2f}"
        
        if porterage > 0:
            row += 1
            ws[f'D{row}'] = "Porterage:"
            ws[f'D{row}'].font = self.header_font
            ws[f'E{row}'] = f"£{float(porterage):.2f}"
        
        if vat_amount > 0:
            row += 1
            ws[f'D{row}'] = "VAT:"
            ws[f'D{row}'].font = self.header_font
            ws[f'E{row}'] = f"£{float(vat_amount):.2f}"
        
        row += 1
        ws[f'D{row}'] = "Total Amount:"
        ws[f'D{row}'].font = self.title_font
        ws[f'E{row}'] = f"£{float(total_amount):.2f}"
        ws[f'E{row}'].font = self.title_font
        
        # Auto-adjust column widths
        for column in ws.columns:
            max_length = 0
            column_letter = column[0].column_letter
            for cell in column:
                try:
                    if len(str(cell.value)) > max_length:
                        max_length = len(str(cell.value))
                except:
                    pass
            adjusted_width = min(max_length + 2, 50)
            ws.column_dimensions[column_letter].width = adjusted_width
        
        # Save to buffer
        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        return buffer
    
    def generate_empty_template(self):
        """Generate empty invoice template"""
        wb = Workbook()
        ws = wb.active
        ws.title = "Invoice Template"
        
        # Company header
        ws['A1'] = "TROPIFRUIT UK LTD"
        ws['A1'].font = self.title_font
        ws['A2'] = "3 Dolphin Way, Purfleet, RM19 1NZ"
        
        # Invoice details template
        row = 4
        ws[f'A{row}'] = "INVOICE TEMPLATE"
        ws[f'A{row}'].font = self.title_font
        
        row += 2
        ws[f'A{row}'] = "Invoice Number:"
        ws[f'B{row}'] = "[To be generated]"
        ws[f'A{row}'].font = self.header_font
        
        row += 1
        ws[f'A{row}'] = "Date:"
        ws[f'B{row}'] = datetime.now().strftime('%Y-%m-%d')
        ws[f'A{row}'].font = self.header_font
        
        row += 1
        ws[f'A{row}'] = "Customer:"
        ws[f'B{row}'] = "[Select customer]"
        ws[f'A{row}'].font = self.header_font
        
        # Items table header
        row += 3
        headers = ['Product', 'Notes', 'Quantity', 'Unit Price', 'Total Price']
        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=row, column=col, value=header)
            cell.font = self.header_font
            cell.fill = self.header_fill
            cell.border = self.border
            cell.alignment = Alignment(horizontal='center')
        
        # Add a few empty rows for data entry
        for i in range(5):
            row += 1
            for col in range(1, 6):
                ws.cell(row=row, column=col).border = self.border
        
        # Totals template
        row += 2
        ws[f'D{row}'] = "Sub Total:"
        ws[f'D{row}'].font = self.header_font
        ws[f'E{row}'] = "£0.00"
        
        row += 1
        ws[f'D{row}'] = "VAT:"
        ws[f'D{row}'].font = self.header_font
        ws[f'E{row}'] = "£0.00"
        
        row += 1
        ws[f'D{row}'] = "Total Amount:"
        ws[f'D{row}'].font = self.title_font
        ws[f'E{row}'] = "£0.00"
        ws[f'E{row}'].font = self.title_font
        
        # Auto-adjust column widths
        for column in ws.columns:
            max_length = 0
            column_letter = column[0].column_letter
            for cell in column:
                try:
                    if len(str(cell.value)) > max_length:
                        max_length = len(str(cell.value))
                except:
                    pass
            adjusted_width = min(max_length + 2, 50)
            ws.column_dimensions[column_letter].width = adjusted_width
        
        # Save to buffer
        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        return buffer