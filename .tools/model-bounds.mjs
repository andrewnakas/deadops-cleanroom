// Print each GLB's size and bounds in inches (models are authored in metres): node .tools/model-bounds.mjs <dir|file>...
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
import fs from 'node:fs';
import path from 'node:path';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const files = process.argv.slice(2).flatMap(p => fs.statSync(p).isDirectory() ? fs.readdirSync(p).filter(f => f.endsWith('.glb')).map(f => path.join(p, f)) : [p]);
for (const f of files) {
  const doc = await io.read(f), b = getBounds(doc.getRoot().listScenes()[0]), k = 39.37, r = v => v.map(x => Math.round(x * k));
  const tris = doc.getRoot().listMeshes().flatMap(m => m.listPrimitives()).reduce((n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);
  console.log(path.basename(f, '.glb').padEnd(18), 'size', r(b.max.map((v, i) => v - b.min[i])).join('x').padEnd(12), 'min', r(b.min).join(','), 'max', r(b.max).join(','), 'tris', Math.round(tris));
}
