"""Render export/web/credits.html from assets/LICENSES.csv. usage: python -I tools/make_credits.py"""
import csv, html, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rows = list(csv.DictReader(open(os.path.join(root, 'assets', 'LICENSES.csv'), encoding='utf8')))
groups = {}
for r in rows: groups.setdefault((r['author'], r['license'], r['source'] if 'ambientcg' not in r['source'] else 'https://ambientcg.com'), []).append(r)
items = ''.join(f"<li><b>{html.escape(a)}</b> — {html.escape(l)} — {', '.join(sorted({html.escape(x['title']) for x in rs}))} <small>(<a href='{html.escape(s)}'>source</a>; {len(rs)} files)</small></li>" for (a, l, s), rs in sorted(groups.items()))
page = f"""<!doctype html><html lang="en"><meta charset="utf-8"><title>Graveshift credits</title>
<style>body{{background:#0b0b0d;color:#e8e0cc;font:15px/1.6 Georgia,serif;max-width:860px;margin:40px auto;padding:0 20px}}a{{color:#e0b060}}h1{{font-family:Impact,sans-serif;letter-spacing:1px}}small{{color:#9a917e}}</style>
<h1>GRAVESHIFT — CREDITS</h1>
<p>Every model and texture is CC0 (public domain); sounds and music are synthesised in code; maps, props, posters and the film reel are original procedural work. Announcer lines are Piper TTS placeholders.</p>
<h2>Code</h2><ul>
<li>Engine code adapted from a browser zombies engine by <a href="https://github.com/luckeyfaraday">@luckeyfaraday</a> (MIT; code only, no art; licence kept in the repository).</li>
<li><a href="https://threejs.org">three.js</a> (MIT), <a href="https://github.com/gkjohnson/three-mesh-bvh">three-mesh-bvh</a> (MIT), <a href="https://github.com/isaac-mason/recast-navigation-js">recast-navigation-js</a> (MIT), <a href="https://peerjs.com">PeerJS</a> (MIT).</li></ul>
<h2>Art (CC0)</h2><ul>{items}</ul>
<p><a href="index.html">← back to the game</a></p></html>"""
open(os.path.join(root, 'export', 'web', 'credits.html'), 'w', encoding='utf8').write(page); print('credits.html', len(rows), 'rows')
