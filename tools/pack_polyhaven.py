"""Pack Poly Haven models fetched by fetch_polyhaven.py into small GLBs and log them in LICENSES.csv.
Textures are resized and stored as WebP, meshes simplified a little and quantized (no decoder needed).
usage: python -I tools/pack_polyhaven.py <dl_dir> <web_dir> <licenses_csv> [--size 1024] [--sub props] alias ..."""
import sys, os, csv, json, subprocess
args = sys.argv[1:]
size, sub = 1024, 'props'
for flag in ('--size', '--sub'):
    if flag in args:
        i = args.index(flag); v = args[i + 1]; del args[i:i + 2]
        if flag == '--size': size = int(v)
        else: sub = v
dl, web, lic = args[:3]
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cli = os.path.join(root, 'node_modules', '@gltf-transform', 'cli', 'bin', 'cli.js')
rows = list(csv.DictReader(open(lic, encoding='utf8')))
outdir = os.path.join(web, 'models', sub) if sub else os.path.join(web, 'models'); os.makedirs(outdir, exist_ok=True)
for alias in args[3:]:
    src = os.path.join(dl, 'models', alias, alias + '.gltf'); out = os.path.join(outdir, alias + '.glb')
    if not os.path.exists(src): print('MISSING', alias); continue
    r = subprocess.run(['node', cli, 'optimize', src, out, '--compress', 'quantize', '--texture-compress', 'webp', '--texture-size', str(size),
                        '--simplify-error', '0.0015', '--simplify-ratio', '0.5', '--palette', 'false', '--join', 'true'], capture_output=True, text=True)
    if r.returncode or not os.path.exists(out): print('FAIL', alias, (r.stderr or r.stdout)[-300:]); continue
    info = json.load(open(os.path.join(dl, 'models', alias, 'licence.json')))
    rel = 'models/' + (sub + '/' if sub else '') + alias + '.glb'
    rows = [x for x in rows if x['file'] != rel]
    rows.append({'file': rel, 'title': info['title'], 'author': info['author'], 'license': info['license'], 'source': info['source'], 'notes': f'simplified, textures {size}px WebP'})
    print('ok', alias, os.path.getsize(out) // 1024, 'KB')
with open(lic, 'w', newline='', encoding='utf8') as f:
    w = csv.DictWriter(f, fieldnames=['file', 'title', 'author', 'license', 'source', 'notes']); w.writeheader(); w.writerows(rows)
