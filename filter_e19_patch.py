import re
from pathlib import Path

source = Path('/home/ubuntu/SalesMasterDashboard/e19-all-diff.patch')
target = Path('/home/ubuntu/SalesMasterDashboard/e19-only.patch')
excluded_old_starts = {49, 62}
output = []
skipping = False
for line in source.read_text().splitlines(keepends=True):
    if line.startswith('@@ '):
        match = re.match(r'@@ -(\d+)', line)
        skipping = bool(match and int(match.group(1)) in excluded_old_starts)
    if not skipping:
        output.append(line)
target.write_text(''.join(output))
