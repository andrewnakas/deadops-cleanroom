"""Download CC0 GLBs from poly.pizza into the download dir, verify the page says CC0, append LICENSES.csv rows.
usage: python -I tools/fetch_polypizza.py <dl_dir> <licenses_csv> id:name [id:name ...]"""
import sys, re, csv, os, urllib.request, json, struct
dl, lic = sys.argv[1], sys.argv[2]
os.makedirs(dl, exist_ok=True)
rows = list(csv.DictReader(open(lic, encoding='utf8'))) if os.path.exists(lic) else []
have = {r['file'] for r in rows}
import subprocess, time
def get(url):
    for i in range(5):
        r = subprocess.run(['curl', '-sfL', '-m', '120', url], capture_output=True)
        if r.returncode == 0 and r.stdout: return r.stdout
        time.sleep(3 + i * 3)
    raise RuntimeError('fetch failed ' + url)
def save():
    with open(lic, 'w', newline='', encoding='utf8') as f:
        w = csv.DictWriter(f, fieldnames=['file', 'title', 'author', 'license', 'source', 'notes']); w.writeheader(); w.writerows(rows)
for spec in sys.argv[3:]:
    pid, name = spec.split(':')
    out = f'models/{name}.glb'
    if out in have: print('have', out); continue
    try: page = get(f'https://poly.pizza/m/{pid}').decode('utf8', 'replace')
    except Exception as e: print('FAIL', pid, name, e); continue
    licence = re.search(r'"Licence":"([^"]+)"', page).group(1)
    title = re.search(r'og:title" content="([^"]*)', page).group(1).replace(' - Free Model', '')
    glb = re.search(r'https://static.poly.pizza/[^"]+\.glb', page).group(0)
    if not licence.startswith('CC0'): print('SKIP not CC0', pid, title, licence); continue
    data = get(glb); open(os.path.join(dl, name + '.glb'), 'wb').write(data)
    n = struct.unpack('<I', data[12:16])[0]; j = json.loads(data[20:20 + n])
    author = title.split(' By ')[-1]
    rows.append({'file': out, 'title': title.split(' By ')[0], 'author': author, 'license': 'CC0-1.0',
                 'source': f'https://poly.pizza/m/{pid}', 'notes': 'anims=' + '/'.join(a.get('name','').split('|')[-1] for a in j.get('animations', []))})
    save(); print('ok', name, len(data), title, rows[-1]['notes'][:120])
with open(lic, 'w', newline='', encoding='utf8') as f:
    w = csv.DictWriter(f, fieldnames=['file', 'title', 'author', 'license', 'source', 'notes']); w.writeheader(); w.writerows(rows)
