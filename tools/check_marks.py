"""Trademark gate: no franchise / studio / publisher names or reference map, weapon, perk or power-up
names anywhere in the given tree. usage: python -I tools/check_marks.py <dir> [...]"""
import os, re, sys
TERMS = [r'call of duty', r'\bcod\b', r'black ?ops', r'treyarch', r'activision', r'infinity ward', r'nuketown', r'kino', r'der toten',
         r'pack.?a.?punch', r'juggernog', r'speed ?cola', r'double ?tap', r'quick ?revive', r'stamin.?up', r'mule ?kick', r'mystery ?box',
         r'ray ?gun', r'thunder ?gun', r'wunderwaffe', r'monkey ?bomb', r'cymbal', r'insta.?kill', r'max ?ammo', r'fire ?sale', r'carpenter',
         r'\bnuke\b', r'hellhound', r'\bbowie\b', r'\bm1911\b', r'\bt5\b', r'\bgsc\b', r'zombiemode', r'perk.?a.?cola', r'element 115', r'\b115\b',
         r'richtofen', r'dempsey', r'nikolai', r'takeo', r'samantha', r'\bmaxis\b', r'dead ops arcade', r'mustang (and|&) sally']
rx = re.compile('|'.join(TERMS), re.I)
hits = []
for base in sys.argv[1:]:
    for dp, dn, fn in os.walk(base):
        dn[:] = [d for d in dn if d not in ('node_modules', '.git', 'vendor')]
        for f in fn:
            p = os.path.join(dp, f)
            if not f.endswith(('.js', '.mjs', '.json', '.html', '.css', '.md', '.csv', '.txt', '.py')): continue
            for i, line in enumerate(open(p, encoding='utf8', errors='replace'), 1):
                for m in rx.finditer(line): hits.append(f'{p}:{i}: {m.group(0)!r}')
print(f'mark hits: {len(hits)}'); [print('  ', h) for h in hits[:30]]
sys.exit(1 if hits else 0)
