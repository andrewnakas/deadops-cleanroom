"""Licence gate: every reference asset in assets/manifest.csv must map to a clean replacement that
exists in export/web and is listed in assets/LICENSES.csv (or is own code under export/web).
Also checks the reverse: every shipped media file under export/web has a LICENSES.csv row.
usage: python -I tools/check_manifest.py   (exit 1 on any failure)"""
import csv, os, re, glob, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); web = os.path.join(root, 'export', 'web')
lic = {r['file']: r for r in csv.DictReader(open(os.path.join(root, 'assets', 'LICENSES.csv'), encoding='utf8'))}
def licensed(path):
    if path in lic: return True
    return any('*' in k and re.fullmatch(k.replace('.', r'\.').replace('*', '.*'), path) for k in lic)
bad = []
man = os.path.join(root, 'assets', 'manifest.csv')
rows = list(csv.DictReader(open(man, encoding='utf8'))) if os.path.exists(man) else []
for r in rows:
    rep = r['replacement']
    if rep.startswith('removed'): continue
    targets = re.findall(r'((?:models|textures|maps|audio|social|data)/[\w./*-]+)', rep)
    codes = re.findall(r'code:([\w.-]+)', rep)
    if not targets and not codes and not rep.startswith('system font') and not rep.startswith('export/web/'): bad.append(('no replacement', r['reference_asset'], rep)); continue
    for c in codes:
        f = os.path.join(web, c)
        if not os.path.exists(f): bad.append(('missing code', r['reference_asset'], c))
    for t in targets:
        files = glob.glob(os.path.join(web, t)) if '*' in t else [os.path.join(web, t)]
        if t.startswith('social/'): continue  # share card is produced at publish time
        if not files or not all(os.path.exists(f) for f in files): bad.append(('missing file', r['reference_asset'], t)); continue
        for f in files:
            rel = os.path.relpath(f, web).replace(os.sep, '/')
            if rel.endswith(('.js', '.json', '.bin')) and rel.startswith(('maps/', 'data/')): continue  # own work
            if not licensed(rel): bad.append(('unlicensed', r['reference_asset'], rel))
shipped = [os.path.relpath(f, web).replace(os.sep, '/') for f in glob.glob(os.path.join(web, '**', '*'), recursive=True)
           if f.lower().endswith(('.glb', '.gltf', '.png', '.jpg', '.jpeg', '.webp', '.ogg', '.wav', '.mp3'))]
for rel in shipped:
    if not licensed(rel): bad.append(('shipped without licence row', '-', rel))
for r in lic.values():
    if not r['license'].startswith(('CC0', 'own')): bad.append(('non-CC0 licence', r['file'], r['license']))
print(f'manifest rows {len(rows)} | shipped media {len(shipped)} | licence rows {len(lic)} | failing {len(bad)}')
for b in bad[:25]: print('  ', *b)
sys.exit(1 if bad or not rows else 0)
