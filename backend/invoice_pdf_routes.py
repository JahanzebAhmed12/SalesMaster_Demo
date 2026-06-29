"""
Flask routes for PDF generation
Add these routes to your main Flask app
"""

from flask import request, jsonify, send_file, make_response
import logging
import io
import requests
from mail_utils import generate_invoice_pdf as mail_generate_pdf
from pypdf import PdfWriter
from flask_jwt_extended import jwt_required

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def add_pdf_routes(app, get_invoice_data_func):
    """
    Add PDF generation routes to Flask app
    
    Args:
        app: Flask application instance
        get_invoice_data_func: Function that takes invoice_number and returns invoice data
    """
    
    @app.route('/api/generate-invoice-pdf', methods=['POST'])
    def generate_invoice_pdf():
        try:
            # Get request data - handle both JSON and form data
            if request.is_json:
                data = request.get_json()
            else:
                data = request.form.to_dict()
            
            if not data:
                return jsonify({'error': 'No data provided'}), 400
            
            invoice_number = data.get('invoiceNumber')
            if not invoice_number:
                return jsonify({'error': 'Invoice number is required'}), 400
            
            logger.info(f"Generating PDF for invoice: {invoice_number}")
            
            # Fetch invoice data using the provided function
            invoice_data = get_invoice_data_func(invoice_number)
            if not invoice_data:
                return jsonify({'error': 'Invoice not found'}), 404
            
            # Generate PDF using the dedicated dot-matrix PDF generator
            try:
                from pdf_generator import DotMatrixInvoicePDF
                
                pdf_generator = DotMatrixInvoicePDF()
                pdf_buffer = pdf_generator.generate_pdf(invoice_data)
                
                if not pdf_buffer:
                    raise Exception("PDF generation returned empty result")
                
            except requests.RequestException as e:
                logger.error(f"Failed to fetch invoice page: {str(e)}")
                return jsonify({'error': 'Failed to fetch invoice page for PDF generation'}), 500
            except Exception as e:
                logger.error(f"PDF generation failed: {str(e)}")
                return jsonify({'error': 'PDF generation failed'}), 500
            
            # Reset buffer position
            pdf_buffer.seek(0)
            
            logger.info(f"PDF generated successfully for invoice: {invoice_number}")
            
            # Return PDF file
            return send_file(
                pdf_buffer,
                mimetype='application/pdf',
                as_attachment=False,
                download_name=f'invoice-{invoice_number}.pdf'
            )
            
        except Exception as e:
            logger.error(f"Error generating PDF: {str(e)}")
            return jsonify({'error': f'PDF generation failed: {str(e)}'}), 500

    @app.route('/api/sales/bulk-print', methods=['POST'])
    @jwt_required()
    def bulk_print_invoices():
        try:
            data = request.get_json()
            if not data or 'invoiceNumbers' not in data:
                return jsonify({'error': 'invoiceNumbers array is required'}), 400

            invoice_numbers = data['invoiceNumbers']
            if not invoice_numbers or not isinstance(invoice_numbers, list):
                return jsonify({'error': 'invoiceNumbers must be a non-empty array'}), 400

            if len(invoice_numbers) > 50:
                return jsonify({'error': 'Maximum 50 invoices per batch'}), 400

            logger.info(f"Bulk printing {len(invoice_numbers)} invoices")

            from pdf_generator import DotMatrixInvoicePDF

            writer = PdfWriter()
            success_count = 0
            failed_numbers = []

            for inv_no in invoice_numbers:
                try:
                    invoice_data = get_invoice_data_func(inv_no)
                    if not invoice_data:
                        failed_numbers.append(inv_no)
                        logger.warning(f"Invoice not found: {inv_no}")
                        continue

                    pdf_generator = DotMatrixInvoicePDF()
                    pdf_buffer = pdf_generator.generate_pdf(invoice_data)
                    writer.append(pdf_buffer)
                    success_count += 1

                except Exception as e:
                    failed_numbers.append(inv_no)
                    logger.error(f"Failed to generate PDF for {inv_no}: {str(e)}")

            if success_count == 0:
                return jsonify({'error': 'No invoices could be generated'}), 500

            output = io.BytesIO()
            writer.write(output)
            writer.close()
            output.seek(0)

            logger.info(f"Bulk PDF generated: {success_count} succeeded, {len(failed_numbers)} failed")

            response = make_response(output.read())
            response.headers['Content-Type'] = 'application/pdf'
            response.headers['Content-Disposition'] = 'inline'
            return response

        except Exception as e:
            logger.error(f"Error in bulk print: {str(e)}")
            return jsonify({'error': f'Bulk print failed: {str(e)}'}), 500
    
    @app.route('/api/test-pdf', methods=['GET'])
    def test_pdf():
        """Test endpoint with sample data"""
        try:
            # Sample invoice data for testing
            sample_data = {
                'customer': {
                    'id': '123',
                    'customer_name': 'Test Customer Ltd',
                    'address': '123 Test Street\nTest City\nTE5T 1NG'
                },
                'sale': {
                    'invoice_number': 'INV-001',
                    'date': '2024-01-15',
                    'vat_amount': 2.50
                },
                'items': [
                    {
                        'quantity': 2,
                        'product_name': 'Test Product 1',
                        'unit_price': 10.00,
                        'total_price': 20.00
                    },
                    {
                        'quantity': 1,
                        'product_name': 'Test Product 2',
                        'unit_price': 5.00,
                        'total_price': 5.00
                    }
                ]
            }
            
            # For test endpoint, just return a simple message
            return jsonify({'message': 'Test endpoint - use the main generate-invoice-pdf endpoint instead'})
            
            return send_file(
                pdf_buffer,
                mimetype='application/pdf',
                as_attachment=False,
                download_name='test-invoice.pdf'
            )
            
        except Exception as e:
            logger.error(f"Error generating test PDF: {str(e)}")
            return jsonify({'error': f'Test PDF generation failed: {str(e)}'}), 500

# Example of how to integrate with your existing Flask app
"""
# In your main Flask app file (e.g., app.py):

from flask import Flask
from invoice_pdf_routes import add_pdf_routes

app = Flask(__name__)

# Your existing function to get invoice data
def get_invoice_data(invoice_number):
    # Your existing logic to fetch invoice data from database
    # This should return the same data structure as your current API
    # Example:
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
                'vat_amount': invoice.vat_amount
            },
            'items': [
                {
                    'quantity': item.quantity,
                    'product_name': item.product.name,
                    'unit_price': item.unit_price,
                    'total_price': item.total_price
                }
                for item in invoice.items
            ]
        }
    except Exception as e:
        print(f"Error fetching invoice data: {e}")
        return None

# Add PDF routes to your app
add_pdf_routes(app, get_invoice_data)

if __name__ == '__main__':
    app.run(debug=True)
"""