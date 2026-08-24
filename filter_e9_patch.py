import re
from pathlib import Path

source = Path('/home/ubuntu/SalesMasterDashboard/e9-all-diff.patch')
target = Path('/home/ubuntu/SalesMasterDashboard/e9-only.patch')
lines = source.read_text().splitlines(keepends=True)
skip_old_starts = {49, 62}
output = []
skipping = False
for line in lines:
    if line.startswith('@@ '):
        match = re.match(r'@@ -(\d+)', line)
        skipping = bool(match and int(match.group(1)) in skip_old_starts)
    if not skipping:
        output.append(line)
target.write_text(''.join(output))
