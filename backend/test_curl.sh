#!/bin/bash
# Test script for PDF API endpoints

echo "🧪 Testing PDF API endpoints..."
echo ""

# Test 1: Test PDF endpoint (should work)
echo "1️⃣ Testing /api/test-pdf (GET)..."
curl -s -o test_api.pdf http://localhost:5000/api/test-pdf
if [ $? -eq 0 ]; then
    echo "✅ Test PDF endpoint works - saved as test_api.pdf"
else
    echo "❌ Test PDF endpoint failed"
fi
echo ""

# Test 2: Generate invoice PDF with JSON
echo "2️⃣ Testing /api/generate-invoice-pdf (POST with JSON)..."
curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"invoiceNumber": "test-123"}' \
  -o invoice_test.pdf \
  http://localhost:5000/api/generate-invoice-pdf

if [ $? -eq 0 ]; then
    echo "✅ Invoice PDF endpoint works - saved as invoice_test.pdf"
else
    echo "❌ Invoice PDF endpoint failed"
fi
echo ""

# Test 3: Check if files were created
echo "3️⃣ Checking generated files..."
if [ -f "test_api.pdf" ]; then
    size=$(stat -f%z test_api.pdf 2>/dev/null || stat -c%s test_api.pdf 2>/dev/null)
    echo "📄 test_api.pdf: ${size} bytes"
else
    echo "❌ test_api.pdf not found"
fi

if [ -f "invoice_test.pdf" ]; then
    size=$(stat -f%z invoice_test.pdf 2>/dev/null || stat -c%s invoice_test.pdf 2>/dev/null)
    echo "📄 invoice_test.pdf: ${size} bytes"
else
    echo "❌ invoice_test.pdf not found"
fi

echo ""
echo "🎯 If both files exist and have size > 1000 bytes, the API is working!"
echo "📖 Open the PDF files to verify the layout looks correct."