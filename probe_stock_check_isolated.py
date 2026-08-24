import os
import sys
import json
from datetime import date

sys.path.insert(0, '/home/ubuntu/SalesMasterDashboard/backend')
os.environ['DATABASE_URL'] = 'sqlite:////home/ubuntu/SalesMasterDashboard/stock-audit-isolated.db'
from app import app
from flask_jwt_extended import create_access_token

with app.app_context():
    token = create_access_token(identity='1')
    client = app.test_client()
    response = client.get(
        '/api/reports/stock-check?fromDate=2026-06-02&toDate=2026-06-02',
        headers={'Authorization': f'Bearer {token}'}
    )
    print('status', response.status_code)
    payload = response.get_json()
    if isinstance(payload, list):
        for row in payload:
            if row.get('productDescription') in {'Test Product A', 'Test Product B', 'Test Product C'}:
                print(json.dumps(row, sort_keys=True))
    else:
        print(json.dumps(payload, sort_keys=True))
