from pathlib import Path

root = Path(__file__).resolve().parent
extensions = {'.js', '.jsx', '.ts', '.tsx', '.json', '.md', '.ps1', '.yml', '.yaml', '.txt', '.html', '.css'}
skip_prefixes = [
    Path('frontend/build'),
    Path('frontend/node_modules'),
    Path('node_modules'),
    Path('.git'),
    Path('backend/uploads'),
]
allowed_prefixes = [
    Path('frontend/src'),
    Path('frontend/public'),
    Path('backend/routes'),
    Path('backend/test'),
]
replacements = [
    ('Copy IDs', 'Reference IDs'),
    ('copy IDs', 'Reference IDs'),
    ('copy ids', 'Reference IDs'),
    ('Copy Ids', 'Reference IDs'),
    ('copy Ids', 'Reference IDs'),
    ('Copy ID', 'Reference ID'),
    ('copy ID', 'Reference ID'),
    ('Copy id', 'Reference ID'),
    ('copy id', 'Reference ID'),
]

modified = []

for file_path in root.rglob('*'):
    if not file_path.is_file():
        continue
    rel = file_path.relative_to(root)
    skip = False
    for prefix in skip_prefixes:
        try:
            rel.relative_to(prefix)
            skip = True
            break
        except ValueError:
            continue
    if skip:
        continue

    if allowed_prefixes:
        permitted = False
        for prefix in allowed_prefixes:
            try:
                rel.relative_to(prefix)
                permitted = True
                break
            except ValueError:
                continue
        if not permitted:
            continue
    if file_path.suffix.lower() not in extensions:
        continue
    try:
        text = file_path.read_text(encoding='utf-8')
    except UnicodeDecodeError:
        continue
    new_text = text
    for old, new in replacements:
        new_text = new_text.replace(old, new)
    if new_text != text:
        file_path.write_text(new_text, encoding='utf-8')
        modified.append(str(rel).replace('\\', '/'))

print('Modified files:')
for path in modified:
    print(path)
print(f'Total: {len(modified)} files updated')
