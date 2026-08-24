from __future__ import annotations

import collections
import json
from pathlib import Path

REPORT = Path('/tmp/salesmaster-jscpd/jscpd-report.json')
report = json.loads(REPORT.read_text())
clones = report.get('duplicates', [])

pair_stats = collections.defaultdict(lambda: {'clone_count': 0, 'duplicated_lines': 0, 'max_lines': 0, 'examples': []})
file_stats = collections.Counter()
for clone in clones:
    first = clone.get('firstFile', {})
    second = clone.get('secondFile', {})
    a = first.get('name', '')
    b = second.get('name', '')
    pair = tuple(sorted((a, b)))
    lines = int(clone.get('lines', 0) or 0)
    pair_stats[pair]['clone_count'] += 1
    pair_stats[pair]['duplicated_lines'] += lines
    pair_stats[pair]['max_lines'] = max(pair_stats[pair]['max_lines'], lines)
    if len(pair_stats[pair]['examples']) < 3:
        pair_stats[pair]['examples'].append({
            'first': f"{a}:{first.get('start', '?')}-{first.get('end', '?')}",
            'second': f"{b}:{second.get('start', '?')}-{second.get('end', '?')}",
            'lines': lines,
            'tokens': clone.get('tokens', 0),
        })
    file_stats[a] += lines
    file_stats[b] += lines

rows = []
for pair, value in pair_stats.items():
    rows.append({'files': pair, **value})
rows.sort(key=lambda x: (-x['duplicated_lines'], -x['max_lines'], x['files']))

output = {
    'summary': report.get('statistics', {}),
    'clone_count': len(clones),
    'top_pairs': rows[:100],
    'top_files': [{'file': f, 'clone_lines': n} for f, n in file_stats.most_common(50)],
}
Path('/home/ubuntu/SalesMasterDashboard/jscpd-summary.json').write_text(json.dumps(output, indent=2))
print(json.dumps(output, indent=2))
