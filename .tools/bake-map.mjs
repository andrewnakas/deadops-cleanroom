// Bake collision BVH + navmesh for an original map layout.
//   node .tools/bake-map.mjs cinema
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { MeshBVH, SAH } from 'three-mesh-bvh';
import { init, exportNavMesh, NavMeshQuery } from '@recast-navigation/core';
import { generateSoloNavMesh } from '@recast-navigation/generators';
import { collisionSoup } from '../export/web/map-kit.js';

const name = process.argv[2] ?? 'cinema';
const out = path.resolve(import.meta.dirname, '../export/web/maps');
const { [`build${name[0].toUpperCase()}${name.slice(1)}`]: build } = await import(`../export/web/maps/${name}.js`);
const map = build();
const solids = map.kit.solids;
const { positions, indices } = collisionSoup(solids, s => !s.nocollide);
const geom = new THREE.BufferGeometry();
geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geom.setIndex(new THREE.BufferAttribute(indices, 1));
const bvh = new MeshBVH(geom, { strategy: SAH, targetLeafSize: 12, maxDepth: 40 });
const serialized = MeshBVH.serialize(bvh, { cloneBuffers: false });
const chunks = [], layout = {}; let offset = 0;
function append(key, a) { const b = Buffer.from(a.buffer, a.byteOffset, a.byteLength); layout[key] = { byteOffset: offset, byteLength: b.length, type: a.constructor.name, count: a.length }; chunks.push(b); offset += b.length; }
append('position', positions); append('index', serialized.index);
layout.roots = [];
for (const r of serialized.roots) { const b = Buffer.from(r); layout.roots.push({ byteOffset: offset, byteLength: b.length }); chunks.push(b); offset += b.length; }
fs.writeFileSync(path.join(out, `${name}-collision.bin`), Buffer.concat(chunks));
fs.writeFileSync(path.join(out, `${name}-collision.json`), JSON.stringify({ format: 'hijacked-collision-bvh-v1', binary: `${name}-collision.bin`, coordinateSystem: 'three-y-up', source: `maps/${name}.js solids`, byteLength: offset, layout, vertices: positions.length / 3, triangles: indices.length / 3 }));

// Navmesh: walkable surfaces only (no ceilings, no nonav decor). Units are inches.
await init();
const nav = collisionSoup(solids, s => !s.nocollide && !s.nonav && !s.ceiling);
const config = { cs: 4, ch: 2, walkableSlopeAngle: 48, walkableHeight: 35, walkableClimb: 9, walkableRadius: 4, maxEdgeLen: 48, maxSimplificationError: 1.3, minRegionArea: 8, mergeRegionArea: 20, maxVertsPerPoly: 6, detailSampleDist: 6, detailSampleMaxError: 1 };
const result = generateSoloNavMesh(nav.positions, nav.indices, config);
if (!result.success) throw new Error('Navigation bake failed: ' + result.error);
fs.writeFileSync(path.join(out, `${name}-nav.bin`), exportNavMesh(result.navMesh));
const query = new NavMeshQuery(result.navMesh, { maxNodes: 8192 });
query.defaultQueryHalfExtents = { x: 70, y: 100, z: 70 };
// Report reachability from the spawn to every zone, machine and barrier.
const spawn = map.kit.entities.find(e => e.type === 'spawn').position;
const checks = map.kit.entities.filter(e => ['perk', 'refinery', 'power', 'crate', 'wallbuy', 'axe'].includes(e.type) || e.type === 'barrier');
let fail = 0;
for (const e of checks) {
  let p = e.position ?? e.center;
  if (e.type === 'barrier') p = [p[0] - e.normal[0] * 50, p[1], p[2] - e.normal[2] * 50];
  else { const yaw = e.yaw ?? 0; p = [p[0] + Math.sin(yaw) * 40, p[1], p[2] + Math.cos(yaw) * 40]; }
  const r = query.computePath({ x: spawn[0], y: spawn[1], z: spawn[2] }, { x: p[0], y: p[1], z: p[2] });
  const end = r.path?.at(-1), d = end ? Math.hypot(end.x - p[0], end.z - p[2]) : 1e9;
  if (!r.success || d > 40) { fail++; console.log('UNREACHABLE', e.type, e.id ?? e.perk ?? e.weapon ?? '', p.map(Math.round), 'end', end && [end.x, end.y, end.z].map(Math.round)); }
}
console.log(`${name}: collision ${positions.length / 3} verts ${indices.length / 3} tris; nav ok; ${checks.length - fail}/${checks.length} targets reachable`);
