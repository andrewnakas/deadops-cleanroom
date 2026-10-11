"""Download CC0 Poly Haven assets and log them in LICENSES.csv (everything on Poly Haven is CC0).
usage: python -I tools/fetch_polyhaven.py <dl_dir> <web_dir> <licenses_csv> spec ...
  hdri:<id>[:alias]        -> env/<alias>.hdr (1k, lighting) + env/<alias>_sky.jpg (4096x2048, backdrop)
  model:<id>[:alias][@res] -> <dl_dir>/models/<alias>/ (glTF + textures at res, default 1k; pack with tools/pack_model.mjs)
  tex:<id>[:alias][@px]    -> textures/<alias>_{color,normal,rough,ao}.jpg at px (default 1024)"""
import sys, os, csv, json, subprocess, time, io
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
dl, web, lic = sys.argv[1:4]
UA = 'graveshift-fetch/1.0'
rows = list(csv.DictReader(open(lic, encoding='utf8'))) if os.path.exists(lic) else []


def save():
    with open(lic, 'w', newline='', encoding='utf8') as f:
        w = csv.DictWriter(f, fieldnames=['file', 'title', 'author', 'license', 'source', 'notes']); w.writeheader(); w.writerows(rows)


def get(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 200: return True
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for i in range(5):
        r = subprocess.run(['curl', '-sfL', '-m', '600', '-A', UA, '-o', path, url])
        if r.returncode == 0 and os.path.getsize(path) > 200: return True
        time.sleep(3 + 3 * i)
    return False


def api(kind, aid):
    p = os.path.join(dl, 'ph', f'{kind}_{aid}.json')
    if not get(f'https://api.polyhaven.com/{kind}/{aid}', p): raise SystemExit(f'FAIL api {kind} {aid}')
    return json.load(open(p, encoding='utf8'))


def log(rel, info, aid, notes):
    global rows
    rows = [r for r in rows if r['file'] != rel]
    rows.append({'file': rel, 'title': info.get('name', aid), 'author': 'Poly Haven (' + ', '.join(info.get('authors', {}).keys()) + ')', 'license': 'CC0-1.0', 'source': f'https://polyhaven.com/a/{aid}', 'notes': notes})


for spec in sys.argv[4:]:
    spec, _, res = spec.partition('@')
    kind, aid, alias = (spec.split(':') + [None])[:3]; alias = alias or aid
    info, files = api('info', aid), api('files', aid)
    if kind == 'hdri':
        out = os.path.join(web, 'env'); os.makedirs(out, exist_ok=True)
        src = os.path.join(dl, 'ph', f'{aid}_1k.hdr'); jpg = os.path.join(dl, 'ph', f'{aid}_tm.jpg')
        ok = get(files['hdri']['1k']['hdr']['url'], src) and get(files['tonemapped']['url'], jpg)
        if not ok: print('FAIL', aid); continue
        open(os.path.join(out, alias + '.hdr'), 'wb').write(open(src, 'rb').read())
        Image.open(jpg).convert('RGB').resize((4096, 2048), Image.LANCZOS).save(os.path.join(out, alias + '_sky.jpg'), quality=88)
        log(f'env/{alias}.hdr', info, aid, '1k HDR'); log(f'env/{alias}_sky.jpg', info, aid, 'tonemapped, resized to 4096x2048')
    elif kind == 'model':
        res = res or '1k'; g = files['gltf'][res]['gltf']; out = os.path.join(dl, 'models', alias)
        ok = get(g['url'], os.path.join(out, alias + '.gltf')) and all(get(v['url'], os.path.join(out, k)) for k, v in g.get('include', {}).items())
        if not ok: print('FAIL', aid); continue
        json.dump({'file': f'models/{alias}.glb', 'title': info.get('name', aid), 'author': 'Poly Haven (' + ', '.join(info.get('authors', {}).keys()) + ')', 'license': 'CC0-1.0', 'source': f'https://polyhaven.com/a/{aid}'}, open(os.path.join(out, 'licence.json'), 'w'))
    elif kind == 'tex':
        px = int(res or 1024); out = os.path.join(web, 'textures'); made = 0
        for key, name in (('Diffuse', 'color'), ('nor_gl', 'normal'), ('Rough', 'rough'), ('AO', 'ao')):
            if key not in files: continue
            f = files[key].get('2k' if px > 1024 else '1k', {}).get('jpg')
            src = os.path.join(dl, 'ph', f'{aid}_{key}_{px}.jpg')
            if not f or not get(f['url'], src): continue
            Image.open(src).convert('L' if name in ('rough', 'ao') else 'RGB').resize((px, px), Image.LANCZOS).save(os.path.join(out, f'{alias}_{name}.jpg'), quality=86)
            log(f'textures/{alias}_{name}.jpg', info, aid, f'resized to {px}px'); made += 1
        if not made: print('FAIL', aid); continue
    else: print('unknown kind', kind); continue
    save(); print('ok', kind, aid, '->', alias)
