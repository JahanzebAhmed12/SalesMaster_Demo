#!/usr/bin/env python3
"""
Test script for PDF generation
Run this to test if PDF generation works independently
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from pdf_generator import DotMatrixInvoicePDF

def test_pdf_generation():
    """Test PDF generation with sample data"""
    
    # Sample invoice data
    sample_data = {
        'customer': {
            'id': '123',
            'customer_name': 'Test Customer Ltd',
            'address': '123 Test Street\nTest City, TC1 2AB\nUnited Kingdom'
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
                'product_name': 'Test Product 2 with a very long name that should be truncated',
                'unit_price': 5.00,
                'total_price': 5.00
            },
            {
                'quantity': 3,
                'product_name': 'Test Product 3',
                'unit_price': 7.50,
                'total_price': 22.50
            }
        ]
    }
    
    try:
        print("Testing PDF generation...")
        
        # Generate PDF
        pdf_generator = DotMatrixInvoicePDF()
        pdf_buffer = pdf_generator.generate_pdf(sample_data)
        
        # Save to file for testing
        with open('test_invoice.pdf', 'wb') as f:
            f.write(pdf_buffer.getvalue())
        
        print("✅ PDF generated successfully!")
        print("📄 Saved as 'test_invoice.pdf'")
        print("🔍 Open the file to verify the layout matches your HTML")
        
        return True
        
    except Exception as e:
        print(f"❌ Error generating PDF: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == '__main__':
    success = test_pdf_generation()
    sys.exit(0 if success else 1)