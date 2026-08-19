import path from 'node:path';
import { changeFrequency, classifyFile, codeExtensions, extractExports, extractImports, git, languageFor, lineCount, listFiles, ownerTool, readText, resolveImport, writeJson } from './shared.mjs';

const all = listFiles();
const allSet = new Set(all);
const entries = all.map((file) => {
    const text = readText(file);
    const imports = codeExtensions.has(path.extname(file)) ? extractImports(text) : [];
    return {
        path: file,
        type: classifyFile(file),
        language: languageFor(file),
        size_lines: lineCount(text),
        exports: codeExtensions.has(path.extname(file)) ? extractExports(text) : [],
        imports_from: imports,
        imported_by: [],
        last_modified: git(['log', '-1', '--follow', '--format=%ai', '--', file]) || null,
        change_frequency: changeFrequency(file),
        owner_tool: ownerTool(file),
        narrative: ''
    };
});
const byPath = new Map(entries.map(e => [e.path, e]));
for (const entry of entries) for (const spec of entry.imports_from) { const target = resolveImport(entry.path, spec, allSet); if (target && byPath.has(target)) byPath.get(target).imported_by.push(entry.path); }
for (const entry of entries) entry.imported_by.sort();
writeJson('cartography/inventory/files.json', entries);
writeJson('cartography/meta/scan-timestamp.json', { scanned_at: new Date().toISOString(), generator: 'scripts/cartography/scan-files.mjs', file_count: entries.length });
