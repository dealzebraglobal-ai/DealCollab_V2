import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { git, listFiles, repoRoot, writeJson } from './shared.mjs';
const scanPath = path.join(repoRoot, 'cartography/meta/scan-timestamp.json');
const since = existsSync(scanPath) ? JSON.parse(readFileSync(scanPath, 'utf8')).scanned_at : new Date(0).toISOString();
const changed = [...new Set(git(['log', `--since=${since}`, '--name-only', '--format=', '--']).split('\n').filter(Boolean))].sort();
const inventory = existsSync(path.join(repoRoot, 'cartography/inventory/files.json')) ? JSON.parse(readFileSync(path.join(repoRoot, 'cartography/inventory/files.json'), 'utf8')).map((f) => f.path) : [];
const inv = new Set(inventory);
writeJson('cartography/meta/staleness-report.json', { checked_at: new Date().toISOString(), last_scan_at: since, stale_files: changed.filter(f => inv.has(f)), uncovered_files: listFiles().filter(f => !inv.has(f)) });
