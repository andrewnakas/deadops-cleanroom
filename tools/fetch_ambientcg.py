"""Download CC0 ambientCG materials (1K JPG), keep colour/normal/roughness at 512px, log LICENSES.csv.
usage: python -I tools/fetch_ambientcg.py <dl_dir> <out_textures_dir> <licenses_csv> AssetId[:alias] ..."""
import sys, os, csv, zipfile, subprocess, time, io
from PIL import Image
dl, outdir, lic = sys.argv[1:4]
os.makedirs(dl, exist_ok=True); os.makedirs(outdir, exist_ok=True)
rows = list(csv.DictReader(open(lic, encoding='utf8'))) if os.path.exists(lic) else []
def save():
    with open(lic, 'w', newline='', encoding='utf8') as f:
        w = csv.DictWriter(f, fieldnames=['file', 'title', 'author', 'license', 'source', 'notes']); w.writeheader(); w.writerows(rows)
for spec in sys.argv[4:]:
    aid, alias = (spec.split(':') + [None])[:2]; alias = alias or aid.lower()
    z = os.path.join(dl, f'{aid}_1K-JPG.zip')
    if not os.path.exists(z) or os.path.getsize(z) < 1000:
        for i in range(5):
            r = subprocess.run(['curl', '-sfL', '-m', '300', '-o', z, f'https://ambientcg.com/get?file={aid}_1K-JPG.zip'])
            if r.returncode == 0 and zipfile.is_zipfile(z): break
            time.sleep(4 + 4 * i)
        else: print('FAIL', aid); continue
    zf = zipfile.ZipFile(z); made = []
    for suffix, key in (('_Color.jpg', 'color'), ('_NormalGL.jpg', 'normal'), ('_Roughness.jpg', 'rough')):
        names = [n for n in zf.namelist() if n.endswith(suffix)]
        if not names: continue
        im = Image.open(io.BytesIO(zf.read(names[0]))).convert('RGB').resize((512, 512), Image.LANCZOS)
        rel = f'textures/{alias}_{key}.jpg'; im.save(os.path.join(outdir, os.path.basename(rel)), quality=82); made.append(rel)
        rows = [r for r in rows if r['file'] != rel]
        rows.append({'file': rel, 'title': aid, 'author': 'ambientCG (Lennart Demes)', 'license': 'CC0-1.0', 'source': f'https://ambientcg.com/view?id={aid}', 'notes': 'resized to 512px'})
    save(); print('ok', aid, '->', alias, len(made))
