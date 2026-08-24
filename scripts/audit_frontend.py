from __future__ import annotations

import collections
import json
import re
from pathlib import Path

ROOT = Path('/home/ubuntu/SalesMasterDashboard/client/src')
EXTENSIONS = {'.ts', '.tsx'}


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT))


def normalize_line(line: str) -> str:
    line = re.sub(r'//.*$', '', line)
    line = re.sub(r'\s+', ' ', line).strip()
    line = re.sub(r'\b\d+(?:\.\d+)?\b', '#', line)
    return line


def normalized_lines(text: str) -> list[str]:
    return [normalize_line(line) for line in text.splitlines() if normalize_line(line)]


def find_duplicate_blocks(files: dict[str, list[str]], window: int = 8, min_files: int = 2):
    occurrences: dict[tuple[str, ...], list[tuple[str, int]]] = collections.defaultdict(list)
    for name, lines in files.items():
        seen = set()
        for i in range(0, max(0, len(lines) - window + 1)):
            block = tuple(lines[i:i + window])
            if sum(len(x) for x in block) < 100:
                continue
            if block in seen:
                continue
            seen.add(block)
            occurrences[block].append((name, i + 1))
    results = []
    for block, places in occurrences.items():
        distinct = sorted({p[0] for p in places})
        if len(distinct) >= min_files:
            results.append({
                'files': distinct,
                'occurrences': places,
                'lines': list(block),
                'line_count': len(block),
            })
    results.sort(key=lambda x: (-len(x['files']), x['files'], x['occurrences'][0][1]))
    # Keep only the longest/non-contained representative per file set.
    final = []
    for result in results:
        signature = tuple(result['files'])
        if any(signature == tuple(x['files']) and result['lines'] == x['lines'] for x in final):
            continue
        final.append(result)
    return final[:200]


def main():
    paths = sorted(p for p in ROOT.rglob('*') if p.is_file() and p.suffix in EXTENSIONS)
    raw = {rel(p): p.read_text(errors='ignore') for p in paths}
    lines = {name: normalized_lines(text) for name, text in raw.items()}
    pages = {name: text for name, text in raw.items() if name.startswith('pages/')}
    components = {name: text for name, text in raw.items() if name.startswith('components/')}
    hooks = {name: text for name, text in raw.items() if name.startswith('hooks/')}
    libs = {name: text for name, text in raw.items() if name.startswith('lib/')}

    directory_counts = collections.Counter((name.split('/')[0] if '/' in name else '[root]') for name in raw)
    file_metrics = []
    for name, text in raw.items():
        file_metrics.append({
            'file': name,
            'lines': len(text.splitlines()),
            'bytes': len(text.encode()),
            'imports': len(re.findall(r'^\s*import\s+', text, re.M)),
            'fetch_calls': len(re.findall(r'\bfetch\s*\(', text)),
            'api_request_calls': len(re.findall(r'\bapiRequest\s*\(', text)),
            'use_query_calls': len(re.findall(r'\buseQuery\s*\(', text)),
            'use_mutation_calls': len(re.findall(r'\buseMutation\s*\(', text)),
            'route_declarations': len(re.findall(r'<Route\b', text)),
            'get_api_url_defs': len(re.findall(r'const\s+getApiUrl\s*=|function\s+getApiUrl', text)),
        })

    route_paths = collections.Counter()
    for text in raw.values():
        route_paths.update(re.findall(r'<Route\s+path=["\']([^"\']+)', text))

    endpoint_counts = collections.Counter()
    for name, text in raw.items():
        for match in re.findall(r'["\'`](/api/[^"\'`$} ]+)', text):
            endpoint_counts[match] += 1

    import_counts = collections.Counter()
    imports_by_file = {}
    for name, text in raw.items():
        imports = re.findall(r'^\s*import\s+(?:[^;]*?\s+from\s+)?["\']([^"\']+)["\']', text, re.M)
        imports_by_file[name] = imports
        for imp in imports:
            import_counts[imp] += 1

    local_import_counts = collections.Counter()
    for name, imports in imports_by_file.items():
        for imp in imports:
            if imp.startswith('@/') or imp.startswith('./') or imp.startswith('../'):
                local_import_counts[imp] += 1

    repeated_ui_patterns = {}
    patterns = {
        'getApiUrl_definitions': r'const\s+getApiUrl\s*=|function\s+getApiUrl',
        'backend_url_derivations': r'window\.location\.origin\.replace\([^)]+\)',
        'direct_fetch_calls': r'\bfetch\s*\(',
        'apiRequest_calls': r'\bapiRequest\s*\(',
        'query_hooks': r'\buseQuery\s*\(',
        'mutation_hooks': r'\buseMutation\s*\(',
        'table_elements': r'<Table\b|<table\b',
        'dialog_elements': r'<Dialog\b|<AlertDialog\b',
        'date_formatting': r'format\([^\n]+(?:yyyy|dd|MM)',
        'toast_calls': r'\btoast\s*\(',
        'loading_text': r'Loading\.\.\.|Loading |isLoading',
        'error_text': r'Error|error',
        'pagination_terms': r'pageSize|currentPage|totalPages|pagination',
        'currency_formatters': r'toLocaleString|Intl\.NumberFormat|formatCurrency|currency',
    }
    for label, pattern in patterns.items():
        matches = []
        rx = re.compile(pattern, re.I if label in {'loading_text', 'error_text'} else 0)
        for name, text in raw.items():
            count = len(rx.findall(text))
            if count:
                matches.append({'file': name, 'count': count})
        repeated_ui_patterns[label] = sorted(matches, key=lambda x: (-x['count'], x['file']))

    result = {
        'root': str(ROOT),
        'file_count': len(paths),
        'total_lines': sum(len(text.splitlines()) for text in raw.values()),
        'directory_counts': directory_counts,
        'file_metrics': sorted(file_metrics, key=lambda x: (-x['lines'], x['file'])),
        'route_paths': route_paths,
        'endpoint_counts': endpoint_counts,
        'import_counts': import_counts,
        'local_import_counts': local_import_counts,
        'repeated_ui_patterns': repeated_ui_patterns,
        'duplicate_blocks': find_duplicate_blocks(lines),
        'pages': sorted(pages),
        'components': sorted(components),
        'hooks': sorted(hooks),
        'libs': sorted(libs),
    }

    def convert(value):
        if isinstance(value, collections.Counter):
            return dict(value)
        if isinstance(value, dict):
            return {k: convert(v) for k, v in value.items()}
        if isinstance(value, list):
            return [convert(v) for v in value]
        return value

    out = Path('/home/ubuntu/SalesMasterDashboard/frontend-audit-data.json')
    out.write_text(json.dumps(convert(result), indent=2))
    print(out)
    print(json.dumps({
        'file_count': result['file_count'],
        'total_lines': result['total_lines'],
        'directory_counts': convert(directory_counts),
        'top_files': result['file_metrics'][:15],
        'top_local_imports': convert(local_import_counts.most_common(25)),
        'route_count': len(route_paths),
        'getApiUrl_files': len(repeated_ui_patterns['getApiUrl_definitions']),
        'direct_fetch_files': len(repeated_ui_patterns['direct_fetch_calls']),
        'duplicate_block_count': len(result['duplicate_blocks']),
    }, indent=2))


if __name__ == '__main__':
    main()
