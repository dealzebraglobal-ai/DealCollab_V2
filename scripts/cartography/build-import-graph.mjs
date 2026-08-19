import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot, resolveImport, writeJson } from './shared.mjs';
const files = JSON.parse(readFileSync(path.join(repoRoot, 'cartography/inventory/files.json'), 'utf8'));
const allSet = new Set(files.map(f => f.path));
const edges = files.flatMap(f => f.imports_from.map(spec => ({ from: f.path, to: resolveImport(f.path, spec, allSet), imports: [spec] })).filter(e => e.to));
const hub_score = Object.fromEntries(files.map(f => [f.path, edges.filter(e => e.to === f.path).length]).filter(([, c]) => c > 0).sort((a, b) => (b[1]) - (a[1])));
writeJson('cartography/topology/import-graph.json', { nodes: files.map(f => f.path), edges, hub_score, generated_at: new Date().toISOString() });
