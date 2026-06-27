"""
Flask routes for PDF and Excel export functionality
Add these routes to your main Flask app
"""

from flask import request, jsonify, send_file
from excel_generator import InvoiceExcelGenerator
from pdf_generator import DotMatrixInvoicePDF
from a4_invoice_pdf_generator import A4InvoicePDF
import logging
import io
from datetime import datetime

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def add_export_routes(app, get_invoice_data_func):
    """
    Add export routes to Flask app
    
    Args:
        app: Flask application instance
        get_invoice_data_func: Function that takes invoice_number and returns invoice data
    """
    
    @app.route('/api/generate-preview-pdf', methods=['POST'])
    def generate_preview_pdf():
        """Generate PDF preview for unsaved invoice"""
        try:
            data = request.get_json()
            if not data:
                return jsonify({'error': 'No data provided'}), 400
            
            logger.info("Generating preview PDF")
            
            # Generate A4 PDF for preview
            pdf_generator = A4InvoicePDF()
            pdf_buffer = pdf_generator.generate_pdf(data)
            
            # Reset buffer position
            pdf_buffer.seek(0)
            
            logger.info("Preview PDF generated successfully")
            
            # Return PDF file
            return send_file(
                pdf_buffer,
                mimetype='application/pdf',
                as_attachment=True,
                download_name=f'invoice-preview-{datetime.now().strftime("%Y%m%d")}.pdf'
            )
            
        except Exception as e:
            logger.error(f"Error generating preview PDF: {str(e)}")
            return jsonify({'error': f'Preview PDF generation failed: {str(e)}'}), 500
    
    @app.route('/api/generate-empty-invoice-pdf', methods=['POST'])
    def generate_empty_invoice_pdf():
        """Generate empty invoice PDF template"""
        try:
            logger.info("Generating empty invoice PDF template")
            
            # Create empty template data
            empty_data = {
                'customer': {
                    'id': '',
                    'customer_name': '[Select Customer]',
                    'address': '[Customer Address]'
                },
                'sale': {
                    'invoice_number': '[To be generated]',
                    'date': datetime.now().isoformat(),
                    'vat_amount': 0
                },
                'items': []
            }
            
            # Generate A4 PDF for empty template
            pdf_generator = A4InvoicePDF()
            pdf_buffer = pdf_generator.generate_pdf(empty_data)
            
            # Reset buffer position
            pdf_buffer.seek(0)
            
            logger.info("Empty invoice PDF template generated successfully")
            
            # Return PDF file
            return send_file(
                pdf_buffer,
                mimetype='application/pdf',
                as_attachment=True,
                download_name='empty-invoice-template.pdf'
            )
            
        except Exception as e:
            logger.error(f"Error generating empty PDF: {str(e)}")
            return jsonify({'error': f'Empty PDF generation failed: {str(e)}'}), 500
    
    @app.route('/api/sales/<invoice_number>/excel', methods=['GET'])
    def download_invoice_excel(invoice_number):
        """Download existing invoice as Excel file"""
        try:
            logger.info(f"Generating Excel for invoice: {invoice_number}")
            
            # Fetch invoice data using the provided function
            invoice_data = get_invoice_data_func(invoice_number)
            if not invoice_data:
                return jsonify({'error': 'Invoice not found'}), 404
            
            # Generate Excel
            excel_generator = InvoiceExcelGenerator()
            excel_buffer = excel_generator.generate_invoice_excel(invoice_data)
            
            # Reset buffer position
            excel_buffer.seek(0)
            
            logger.info(f"Excel generated successfully for invoice: {invoice_number}")
            
            # Return Excel file
            return send_file(
                excel_buffer,
                mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                as_attachment=True,
                download_name=f'invoice-{invoice_number}.xlsx'
            )
            
        except Exception as e:
            logger.error(f"Error generating Excel: {str(e)}")
            return jsonify({'error': f'Excel generation failed: {str(e)}'}), 500
    
    @app.route('/api/generate-preview-excel', methods=['POST'])
    def generate_preview_excel():
        """Generate Excel preview for unsaved invoice"""
        try:
            data = request.get_json()
            if not data:
                return jsonify({'error': 'No data provided'}), 400
            
            logger.info("Generating preview Excel")
            
            # Generate Excel
            excel_generator = InvoiceExcelGenerator()
            excel_buffer = excel_generator.generate_invoice_excel(data)
            
            # Reset buffer position
            excel_buffer.seek(0)
            
            logger.info("Preview Excel generated successfully")
            
            # Return Excel file
            return send_file(
                excel_buffer,
                mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                as_attachment=True,
                download_name=f'invoice-preview-{datetime.now().strftime("%Y%m%d")}.xlsx'
            )
            
        except Exception as e:
            logger.error(f"Error generating preview Excel: {str(e)}")
            return jsonify({'error': f'Preview Excel generation failed: {str(e)}'}), 500
    
    @app.route('/api/generate-empty-invoice-excel', methods=['POST'])
    def generate_empty_invoice_excel():
        """Generate empty invoice Excel template"""
        try:
            logger.info("Generating empty invoice Excel template")
            
            # Generate empty Excel template
            excel_generator = InvoiceExcelGenerator()
            excel_buffer = excel_generator.generate_empty_template()
            
            # Reset buffer position
            excel_buffer.seek(0)
            
            logger.info("Empty invoice Excel template generated successfully")
            
            # Return Excel file
            return send_file(
                excel_buffer,
                mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                as_attachment=True,
                download_name='empty-invoice-template.xlsx'
            )
            
        except Exception as e:
            logger.error(f"Error generating empty Excel: {str(e)}")
            return jsonify({'error': f'Empty Excel generation failed: {str(e)}'}), 500

# Example of how to integrate with your existing Flask app
"""
# In your main Flask app file (e.g., app.py):

from flask import Flask
from export_routes import add_export_routes

app = Flask(__name__)

# Your existing function to get invoice data
def get_invoice_data(invoice_number):
    # Your existing logic to fetch invoice data from database
    # This should return the same data structure as your current API
    try:
        # Fetch from database
        invoice = db.session.query(Sale).filter_by(invoice_number=invoice_number).first()
        if not invoice:
            return None
            
        return {
            'customer': {
                'id': invoice.customer_id,
                'customer_name': invoice.customer.name,
                'address': invoice.customer.address
            },
            'sale': {
                'invoice_number': invoice.invoice_number,
                'date': invoice.date.isoformat(),
                'subtotal': invoice.subtotal,
                'vat_amount': invoice.vat_amount,
                'porterage': invoice.porterage,
                'total_amount': invoice.total_amount,
                'vehicle_details': invoice.vehicle_details,
                'gate_number': invoice.gate_number,
                'notes': invoice.notes
            },
            'items': [
                {
                    'product_name': item.product.name if item.product else item.non_product.name,
                    'notes': item.notes,
                    'quantity': item.quantity,
                    'unit_price': item.unit_price,
                    'total_price': item.total_price
                }
                for item in invoice.items
            ]
        }
    except Exception as e:
        print(f"Error fetching invoice data: {e}")
        return None

# Add export routes to your app
add_export_routes(app, get_invoice_data)

if __name__ == '__main__':
    app.run(debug=True)
"""