"""Download CC0 ambientCG materials (1K JPG) and write game textures, logging LICENSES.csv.
Each material becomes three files per size: <alias>_color.jpg, <alias>_normal.jpg and <alias>_orm.jpg
(red = ambient occlusion, green = roughness, blue = metalness, the layout three.js reads from one image).
Full size goes to <web_dir>/textures, the 512 px phone set to <web_dir>/textures-mobile.
usage: python -I tools/fetch_ambientcg.py <dl_dir> <web_dir> <licenses_csv> [--size 1024] AssetId[:alias] ..."""
import sys, os, csv, zipfile, subprocess, time, io
from PIL import Image
args = sys.argv[1:]
size = 1024
if '--size' in args: i = args.index('--size'); size = int(args[i + 1]); del args[i:i + 2]
dl, web, lic = args[:3]
os.makedirs(dl, exist_ok=True)
rows = list(csv.DictReader(open(lic, encoding='utf8'))) if os.path.exists(lic) else []
def save():
    with open(lic, 'w', newline='', encoding='utf8') as f:
        w = csv.DictWriter(f, fieldnames=['file', 'title', 'author', 'license', 'source', 'notes']); w.writeheader(); w.writerows(rows)
for spec in args[3:]:
    aid, alias = (spec.split(':') + [None])[:2]; alias = alias or aid.lower()
    z = os.path.join(dl, f'{aid}_1K-JPG.zip')
    if not os.path.exists(z) or os.path.getsize(z) < 1000:
        for i in range(5):
            r = subprocess.run(['curl', '-sfL', '-m', '300', '-o', z, f'https://ambientcg.com/get?file={aid}_1K-JPG.zip'])
            if r.returncode == 0 and zipfile.is_zipfile(z): break
            time.sleep(4 + 4 * i)
        else: print('FAIL', aid); continue
    zf = zipfile.ZipFile(z)
    def grab(suffix, mode):
        names = [n for n in zf.namelist() if n.endswith(suffix)]
        return Image.open(io.BytesIO(zf.read(names[0]))).convert(mode) if names else None
    color, normal, rough, ao, metal = grab('_Color.jpg', 'RGB'), grab('_NormalGL.jpg', 'RGB'), grab('_Roughness.jpg', 'L'), grab('_AmbientOcclusion.jpg', 'L'), grab('_Metalness.jpg', 'L')
    if not color: print('FAIL no colour', aid); continue
    full = color.size
    orm = Image.merge('RGB', [ao or Image.new('L', full, 255), rough or Image.new('L', full, 200), metal or Image.new('L', full, 0)])
    rows = [r for r in rows if not (r['file'].startswith(f'textures/{alias}_') or r['file'].startswith(f'textures-mobile/{alias}_'))]
    for folder, px, q in (('textures', size, 84), ('textures-mobile', 512, 80)):
        os.makedirs(os.path.join(web, folder), exist_ok=True)
        for key, im in (('color', color), ('normal', normal), ('orm', orm)):
            if im is None: continue
            rel = f'{folder}/{alias}_{key}.jpg'; im.resize((px, px), Image.LANCZOS).save(os.path.join(web, rel), quality=q)
            rows.append({'file': rel, 'title': aid, 'author': 'ambientCG (Lennart Demes)', 'license': 'CC0-1.0', 'source': f'https://ambientcg.com/view?id={aid}', 'notes': f'resized to {px}px' + ('; occlusion, roughness and metalness packed into one image' if key == 'orm' else '')})
    old = os.path.join(web, 'textures', f'{alias}_rough.jpg')
    if os.path.exists(old): os.remove(old)
    save(); print('ok', aid, '->', alias, 'ao' if ao else '-', 'metal' if metal else '-')
