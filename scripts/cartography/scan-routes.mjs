import { extractImports, listFiles, readText, writeJson } from './shared.mjs';
const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];
const routes = listFiles().filter(f => /src\/app\/api\/.*\/route\.(ts|js)$/.test(f)).flatMap(path => {
    const text = readText(path); const found = methods.filter(m => new RegExp(`export\\s+(?:async\\s+)?function\\s+${m}|export\\s+const\\s+${m}`).test(text));
    const tables = [...text.matchAll(/\.from\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);
    const writes = [...text.matchAll(/\.(insert|update|upsert|delete)\s*\(/g)].map(m => m[1]);
    return (found.length ? found : ['UNKNOWN']).map(method => ({ path, method, url_pattern: '/' + path.replace(/^src\/app\//, '').replace(/\/route\.(ts|js)$/, '').replace(/\([^/]+\)\//g, ''), auth_required: /getServerSession|auth\(|session|authorization|CRON_SECRET/.test(text), consumes: [], produces: [], calls_modules: extractImports(text), calls_external: [/fetch\(/.test(text) && 'fetch', /OpenAI|openai/.test(text) && 'OpenAI', /Groq|groq/.test(text) && 'Groq', /supabase/i.test(text) && 'Supabase'].filter(Boolean), db_reads: [...new Set(tables)], db_writes: writes.length ? [...new Set(tables)] : [], side_effects: [], error_handling: /try\s*\{/.test(text) ? 'try-catch present' : 'no top-level try-catch detected' }));
});
writeJson('cartography/inventory/routes.json', routes);
