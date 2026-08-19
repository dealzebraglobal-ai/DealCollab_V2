import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const repoRoot = process.cwd();
export const excludedDirs = new Set(['.git', 'node_modules', '.next', 'dist', 'coverage', '.vercel']);
export const codeExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

export function ensureDir(filePath) { mkdirSync(path.dirname(filePath), { recursive: true }); }
export function writeJson(relativePath, value) { const full = path.join(repoRoot, relativePath); ensureDir(full); writeFileSync(full, `${JSON.stringify(value, null, 2)}\n`); }
export function readText(relativePath) { return readFileSync(path.join(repoRoot, relativePath), 'utf8'); }
export function listFiles(dir = repoRoot) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        if (excludedDirs.has(entry)) continue;
        const full = path.join(dir, entry);
        const stats = statSync(full);
        if (stats.isDirectory()) out.push(...listFiles(full));
        else if (stats.isFile()) out.push(path.relative(repoRoot, full).replaceAll(path.sep, '/'));
    }
    return out.sort();
}
export function git(args) { try { return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim(); } catch { return ''; } }
export function lineCount(text) { return text.length === 0 ? 0 : text.split(/\r?\n/).length; }
export function languageFor(file) { const ext = path.extname(file).toLowerCase(); return ({ '.ts': 'typescript', '.tsx': 'typescriptreact', '.js': 'javascript', '.jsx': 'javascriptreact', '.mjs': 'javascript', '.cjs': 'javascript', '.sql': 'sql', '.json': 'json', '.md': 'markdown', '.css': 'css' })[ext] ?? (ext.replace('.', '') || 'unknown'); }
export function classifyFile(file) {
    if (/\/route\.(ts|js)$/.test(file) && file.includes('/api/')) return 'route';
    if (/migration|supabase\/migrations/.test(file) || file.endsWith('.sql')) return 'migration';
    if (/(__tests__|\.test\.|\.spec\.)/.test(file)) return 'test';
    if (/(^|\/)scripts\//.test(file) || /^check_/.test(file) || /^fix_/.test(file)) return 'script';
    if (/\.(png|jpg|jpeg|gif|svg|ico|webp|docx|pdf)$/.test(file)) return 'asset';
    if (/^(next|postcss|tailwind|drizzle|eslint)\.config|package\.json|tsconfig\.json/.test(file)) return 'config';
    if (/\.(tsx|jsx)$/.test(file) && (file.includes('/components/') || /\/page\.(tsx|jsx)$/.test(file) || /\/layout\.(tsx|jsx)$/.test(file))) return 'component';
    if (codeExtensions.has(path.extname(file))) return 'module';
    return 'asset';
}
export function extractImports(text) {
    const imports = new Set();
    for (const m of text.matchAll(/import\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g)) imports.add(m[1]);
    for (const m of text.matchAll(/require\(['"]([^'"]+)['"]\)/g)) imports.add(m[1]);
    return [...imports].sort();
}
export function extractExports(text) {
    const exports = new Set();
    for (const m of text.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z0-9_$]+)/g)) exports.add(m[1]);
    for (const m of text.matchAll(/export\s*\{([^}]+)\}/g)) m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[1] ?? s.trim().split(/\s+as\s+/)[0]).filter(Boolean).forEach(x => exports.add(x));
    if (/export\s+default\s+/.test(text)) exports.add('default');
    return [...exports].sort();
}
export function changeFrequency(file) { const commits = git(['log', '--follow', '--format=%ai', '--', file]).split('\n').filter(Boolean); if (commits.length === 0) return 'frozen'; const latest = new Date(commits[0]).getTime(); const ageDays = (Date.now() - latest) / 86400000; if (commits.length >= 4 || ageDays <= 7) return 'high'; if (commits.length >= 2 || ageDays <= 31) return 'medium'; if (ageDays <= 120) return 'low'; return 'frozen'; }
export function ownerTool(file) { const subjects = git(['log', '--format=%s', '--', file]).toLowerCase(); if (subjects.includes('codex')) return 'codex'; if (subjects.includes('claude')) return 'claude'; if (subjects.includes('antigravity')) return 'antigravity'; return 'manual'; }
export function resolveImport(fromFile, spec, allFiles) {
    if (!spec.startsWith('.') && !spec.startsWith('@/')) return null;
    const base = spec.startsWith('@/') ? path.join(repoRoot, 'src', spec.slice(2)) : path.join(repoRoot, path.dirname(fromFile), spec);
    const candidates = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'].map(s => path.relative(repoRoot, base + s).replaceAll(path.sep, '/'));
    return candidates.find(c => allFiles.has(c)) ?? null;
}
