# PDF Generation Setup Guide

## 1. Install Dependencies

```bash
pip install reportlab Pillow
```

## 2. Add Files to Your Server

1. Copy `pdf_generator.py` to your server directory
2. Copy `invoice_pdf_routes.py` to your server directory

## 3. Integrate with Your Flask App

### Option A: Add to existing app.py

```python
from flask import Flask
from invoice_pdf_routes import add_pdf_routes

app = Flask(__name__)

# Your existing function to get invoice data
def get_invoice_data(invoice_number):
    """
    Modify this function to match your database structure
    Should return data in the same format as your existing /api/sales/{invoice_number}/invoice endpoint
    """
    try:
        # Example using your existing database logic
        # Replace this with your actual database query
        
        # If you have an existing endpoint, you can reuse that logic:
        from your_existing_routes import get_invoice_by_number  # Replace with your actual import
        
        invoice_data = get_invoice_by_number(invoice_number)
        return invoice_data
        
    except Exception as e:
        print(f"Error fetching invoice data: {e}")
        return None

# Add PDF routes
add_pdf_routes(app, get_invoice_data)
```

### Option B: Create separate PDF blueprint

```python
# In your main app.py
from flask import Flask
from invoice_pdf_blueprint import pdf_bp

app = Flask(__name__)
app.register_blueprint(pdf_bp)
```

## 4. Test the Setup

### Test with sample data:
```bash
curl http://localhost:5000/api/test-pdf
```

### Test with real invoice:
```bash
curl -X POST http://localhost:5000/api/generate-invoice-pdf \
  -H "Content-Type: application/json" \
  -d '{"invoiceNumber": "your-invoice-number"}'
```

## 5. Frontend Integration

The frontend code is already updated in your React component. It will:

- **Desktop**: Use browser printing (fast, works well)
- **Mobile**: Use server PDF generation (no extra pages)
- **Fallback**: If server PDF fails, fall back to browser printing

## 6. Troubleshooting

### Common Issues:

1. **"No module named 'reportlab'"**
   ```bash
   pip install reportlab
   ```

2. **PDF positioning is off**
   - Check the `positions` dictionary in `pdf_generator.py`
   - Adjust values to match your HTML layout exactly

3. **Fonts look different**
   - The PDF uses Courier (monospace) to match your HTML
   - You can install custom fonts if needed

4. **Server PDF not working**
   - Check browser console for errors
   - Check server logs for Python errors
   - Test the `/api/test-pdf` endpoint first

### Debug Mode:

Add logging to see what's happening:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

## 7. Customization

### Adjust positioning:
Edit the `positions` dictionary in `pdf_generator.py` to match your exact layout.

### Add more fields:
Modify the `_add_header_info()` method to include additional fields.

### Change fonts:
```python
# In pdf_generator.py
canvas.setFont("Helvetica", 12)  # Change font
```

### Custom page size:
```python
# In pdf_generator.py __init__
self.page_width = 200 * mm  # Change width
self.page_height = 250 * mm  # Change height
```