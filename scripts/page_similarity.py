from __future__ import annotations

import difflib
import json
import re
from pathlib import Path

ROOT = Path('/home/ubuntu/SalesMasterDashboard/client/src/pages')


def normalize(text: str) -> list[str]:
    result = []
    for line in text.splitlines():
        line = re.sub(r'//.*$', '', line)
        line = re.sub(r'\s+', ' ', line).strip()
        if not line:
            continue
        # Remove identifiers and literals only for structural comparison.
        line = re.sub(r'\b[A-Za-z_$][\w$]*\b', 'ID', line)
        line = re.sub(r'\b\d+(?:\.\d+)?\b', '#', line)
        line = re.sub(r'(["\']).*?\1', 'STR', line)
        result.append(line)
    return result

files = {str(p.relative_to(ROOT)): normalize(p.read_text(errors='ignore')) for p in ROOT.rglob('*.tsx')}
rows = []
items = sorted(files)
for i, left in enumerate(items):
    for right in items[i + 1:]:
        a, b = files[left], files[right]
        if min(len(a), len(b)) < 80:
            continue
        ratio = difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()
        # Compare only the smaller normalized file to avoid giant-file bias.
        if ratio >= 0.27:
            rows.append({'left': left, 'right': right, 'similarity': round(ratio, 4), 'left_lines': len(a), 'right_lines': len(b)})
rows.sort(key=lambda x: (-x['similarity'], x['left'], x['right']))
Path('/home/ubuntu/SalesMasterDashboard/page-similarity.json').write_text(json.dumps(rows, indent=2))
print(json.dumps(rows[:80], indent=2))
