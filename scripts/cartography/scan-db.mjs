import { listFiles, readText, writeJson } from './shared.mjs';
const sqlFiles = listFiles().filter(f => f.startsWith('supabase/') && f.endsWith('.sql'));
const tables = new Map();
for (const file of sqlFiles) {
    const sql = readText(file);
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([A-Za-z0-9_]+)"?\s*\(([\s\S]*?)\);/gi)) {
        const table = m[1];
        const columns = m[2].split(/,\n/).map(line => line.trim()).map(line => { const mm = line.match(/^"?([A-Za-z0-9_]+)"?\s+([A-Za-z0-9_()[\]\s]+)/); return mm ? { name: mm[1], type: mm[2].trim(), primary: /primary key/i.test(line), maps_to_code: '' } : null; }).filter(Boolean);
        tables.set(table, { table, source: 'supabase', columns, row_lifecycle: '', read_by: [], written_by: [], indexes: [], rls_policies: '', has_migrations: true, migration_path: file });
    }
}
writeJson('cartography/inventory/tables.json', [...tables.values()].sort((a, b) => a.table.localeCompare(b.table)));
