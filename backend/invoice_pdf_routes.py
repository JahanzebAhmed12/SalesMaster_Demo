"""
Flask routes for PDF generation
Add these routes to your main Flask app
"""

from flask import request, jsonify, send_file
import logging
import io
import requests
from mail_utils import generate_invoice_pdf as mail_generate_pdf

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
            
            # Generate PDF by fetching and converting the existing invoice page
            try:
                frontend_url = f"http://localhost:5173/print/invoice/{invoice_number}"
                
                # Fetch the HTML content from the frontend
                response = requests.get(frontend_url, timeout=10)
                response.raise_for_status()
                
                # Convert HTML to PDF using existing mail_utils function
                html_content = response.text
                pdf_bytes = mail_generate_pdf(html_content)
                
                if not pdf_bytes:
                    raise Exception("PDF generation returned empty result")
                
                pdf_buffer = io.BytesIO(pdf_bytes)
                
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