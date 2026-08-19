'use client';

import { useMemo, useState, type ReactNode } from 'react';

type FileEntry = {
    path: string;
    type: string;
    language: string;
    size_lines: number;
    exports: string[];
    imports_from: string[];
    imported_by: string[];
    last_modified: string | null;
    change_frequency: string;
    owner_tool: string;
    narrative: string;
};

type RouteEntry = {
    path: string;
    method: string;
    url_pattern: string;
    auth_required: boolean;
    calls_modules: string[];
    calls_external: string[];
    db_reads: string[];
    db_writes: string[];
    error_handling: string;
};

type TableEntry = {
    table: string;
    source: string;
    columns: Array<{ name: string; type: string; primary?: boolean; maps_to_code?: string }>;
    read_by?: string[];
    written_by?: string[];
    migration_path?: string;
};

type EnvVarEntry = {
    var: string;
    used_in: string[];
    required: boolean;
    failure_if_missing: string;
};

type ExternalServiceEntry = {
    service: string;
    purpose: string;
    called_from: string[];
    failure_mode: string;
    fallback: string;
};

type ImportGraph = {
    nodes: string[];
    edges: Array<{ from: string; to: string; imports: string[] }>;
    hub_score: Record<string, number>;
};

type StalenessReport = {
    checked_at?: string;
    last_scan_at?: string;
    stale_files?: string[];
    uncovered_files?: string[];
};

type LooseRecord = Record<string, unknown>;

type CartographyData = {
    files: FileEntry[];
    routes: RouteEntry[];
    tables: TableEntry[];
    stateObjects: LooseRecord[];
    envVars: EnvVarEntry[];
    externalServices: ExternalServiceEntry[];
    importGraph: ImportGraph;
    dataFlows: LooseRecord[];
    stateMutations: LooseRecord[];
    moduleDecisionTree: LooseRecord;
    promptAssembly: LooseRecord;
    whyCards: LooseRecord[];
    scarRegistry: LooseRecord[];
    staleness: StalenessReport;
};

type ViewMode = 'map' | 'routes' | 'flows' | 'state' | 'narrative' | 'staleness';

const typeStyles: Record<string, string> = {
    route: 'bg-orange-100 text-orange-800 border-orange-200',
    component: 'bg-blue-100 text-blue-800 border-blue-200',
    module: 'bg-stone-100 text-stone-800 border-stone-200',
    config: 'bg-purple-100 text-purple-800 border-purple-200',
    migration: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    script: 'bg-amber-100 text-amber-800 border-amber-200',
    test: 'bg-pink-100 text-pink-800 border-pink-200',
    asset: 'bg-slate-100 text-slate-700 border-slate-200',
};

function formatNumber(num: number): string {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatStableDate(dateStr: string | null) {
    if (!dateStr) return 'unknown';
    const match = dateStr.match(/^\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
    return dateStr.split(' ')[0] || 'unknown';
}

function formatStableDateTime(dateStr: string | null) {
    if (!dateStr) return 'unknown';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return 'unknown';
        const year = d.getUTCFullYear();
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        const hours = String(d.getUTCHours()).padStart(2, '0');
        const minutes = String(d.getUTCMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes} UTC`;
    } catch {
        return 'unknown';
    }
}

function plural(count: number, label: string) {
    return `${formatNumber(count)} ${label}${count === 1 ? '' : 's'}`;
}

function stringifyValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.map(stringifyValue).filter(Boolean).join(', ');
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
}

function recordString(record: LooseRecord, keys: string[], fallback = '') {
    for (const key of keys) {
        const value = record[key];
        const text = stringifyValue(value);
        if (text) return text;
    }
    return fallback;
}

function recordList(record: LooseRecord, keys: string[]) {
    for (const key of keys) {
        const value = record[key];
        if (Array.isArray(value)) return value.map(stringifyValue).filter(Boolean);
        const text = stringifyValue(value);
        if (text) return [text];
    }
    return [];
}

function Pill({ children, className = '' }: { children: ReactNode; className?: string }) {
    return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${className}`}>{children}</span>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
    return (
        <div className="rounded-3xl border border-dashed border-stone-300 bg-white/70 p-8 text-center">
            <h3 className="text-lg font-black text-stone-950">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">{body}</p>
        </div>
    );
}

export default function CartographyDashboard({ data }: { data: CartographyData }) {
    const [query, setQuery] = useState('');
    const [selectedPath, setSelectedPath] = useState(data.files[0]?.path ?? '');
    const [view, setView] = useState<ViewMode>('map');

    const selectedFile = useMemo(
        () => data.files.find((file) => file.path === selectedPath) ?? data.files[0],
        [data.files, selectedPath],
    );

    const typeCounts = useMemo(() => {
        return data.files.reduce<Record<string, number>>((acc, file) => {
            acc[file.type] = (acc[file.type] ?? 0) + 1;
            return acc;
        }, {});
    }, [data.files]);

    const filteredFiles = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        const scored = data.files.map((file) => ({
            file,
            hubScore: data.importGraph.hub_score[file.path] ?? file.imported_by.length,
        }));

        if (!normalizedQuery) return scored.sort((a, b) => b.hubScore - a.hubScore).slice(0, 140);

        return scored
            .filter(({ file }) => {
                const haystack = [file.path, file.type, file.language, file.change_frequency, file.owner_tool, ...file.exports, ...file.imports_from]
                    .join(' ')
                    .toLowerCase();
                return haystack.includes(normalizedQuery);
            })
            .slice(0, 140);
    }, [data.files, data.importGraph.hub_score, query]);

    const selectedRoutes = useMemo(() => data.routes.filter((route) => route.path === selectedFile?.path), [data.routes, selectedFile]);
    const selectedEnvVars = useMemo(() => data.envVars.filter((envVar) => selectedFile && envVar.used_in.includes(selectedFile.path)), [data.envVars, selectedFile]);
    const selectedServices = useMemo(() => data.externalServices.filter((service) => selectedFile && service.called_from.includes(selectedFile.path)), [data.externalServices, selectedFile]);
    const selectedWhyCards = useMemo(() => findNarrativeForPath(data.whyCards, selectedFile?.path), [data.whyCards, selectedFile]);
    const selectedScars = useMemo(() => findNarrativeForPath(data.scarRegistry, selectedFile?.path), [data.scarRegistry, selectedFile]);

    const topHubs = useMemo(() => {
        return Object.entries(data.importGraph.hub_score ?? {})
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10);
    }, [data.importGraph.hub_score]);

    return (
        <main className="min-h-screen bg-[#f6f3ee] px-4 py-6 text-stone-950 sm:px-6 lg:px-10">
            <section className="mx-auto max-w-7xl space-y-6">
                <Hero data={data} />

                <section className="grid gap-4 lg:grid-cols-4">
                    <QuestionCard question="What exists?" answer={`${plural(data.files.length, 'file')}, ${plural(data.routes.length, 'route')}, ${plural(data.tables.length, 'table')}`} />
                    <QuestionCard question="How is it connected?" answer={`${plural(data.importGraph.edges.length, 'import edge')} and ${plural(topHubs.length, 'top hub')} surfaced`} />
                    <QuestionCard question="Why does it exist?" answer={`${plural(data.whyCards.length, 'why card')} and ${plural(data.scarRegistry.length, 'scar')} loaded`} />
                    <QuestionCard question="What can break?" answer={`${plural(data.staleness.stale_files?.length ?? 0, 'stale file')} plus dependency blast-radius lists`} />
                </section>

                <nav className="flex flex-wrap gap-2 rounded-3xl border border-stone-200 bg-white/80 p-2 shadow-sm backdrop-blur">
                    {[
                        ['map', 'System Map'],
                        ['routes', 'Routes'],
                        ['flows', 'Flow Tracer'],
                        ['state', 'State Inspector'],
                        ['narrative', 'Narrative'],
                        ['staleness', 'Staleness'],
                    ].map(([key, label]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setView(key as ViewMode)}
                            className={`rounded-2xl px-4 py-2 text-sm font-black transition ${view === key ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-950'}`}
                        >
                            {label}
                        </button>
                    ))}
                </nav>

                {view === 'map' && (
                    <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                        <SystemMapPanel
                            query={query}
                            setQuery={setQuery}
                            filteredFiles={filteredFiles}
                            selectedPath={selectedFile?.path}
                            selectFile={setSelectedPath}
                        />
                        <FileDetail
                            file={selectedFile}
                            routes={selectedRoutes}
                            envVars={selectedEnvVars}
                            services={selectedServices}
                            whyCards={selectedWhyCards}
                            scars={selectedScars}
                            hubScore={data.importGraph.hub_score[selectedFile?.path ?? ''] ?? 0}
                        />
                    </section>
                )}

                {view === 'routes' && <RouteExplorer routes={data.routes} selectFile={setSelectedPath} goToMap={() => setView('map')} />}
                {view === 'flows' && <FlowTracer flows={data.dataFlows} promptAssembly={data.promptAssembly} moduleDecisionTree={data.moduleDecisionTree} />}
                {view === 'state' && <StateInspector stateObjects={data.stateObjects} mutations={data.stateMutations} tables={data.tables} />}
                {view === 'narrative' && <NarrativeExplorer whyCards={data.whyCards} scars={data.scarRegistry} typeCounts={typeCounts} topHubs={topHubs} />}
                {view === 'staleness' && <StalenessDashboard staleness={data.staleness} totalFiles={data.files.length} />}
            </section>
        </main>
    );
}

function Hero({ data }: { data: CartographyData }) {
    return (
        <header className="overflow-hidden rounded-[2rem] border border-stone-200 bg-stone-950 text-white shadow-2xl shadow-stone-950/10">
            <div className="grid gap-8 p-8 lg:grid-cols-[1.3fr_0.7fr] lg:p-10">
                <div>
                    <p className="text-xs font-black uppercase tracking-[0.35em] text-orange-300">DealCollab architecture explorer</p>
                    <h1 className="mt-4 max-w-3xl text-4xl font-black tracking-tight sm:text-5xl">
                        Navigate the living map behind deal sourcing, proposal extraction, and matching.
                    </h1>
                    <p className="mt-5 max-w-2xl text-sm leading-7 text-stone-300 sm:text-base">
                        This developer-facing page uses the generated JSON in <code className="rounded bg-white/10 px-1.5 py-0.5">cartography/</code> as the source of truth. It is the Explorer UI layer above the scanner layer: no scanner redesign, just navigation and interpretation.
                    </p>
                </div>
                <div className="grid grid-cols-2 gap-3 self-end">
                    <Metric label="Files" value={data.files.length} />
                    <Metric label="Routes" value={data.routes.length} />
                    <Metric label="Tables" value={data.tables.length} />
                    <Metric label="Import edges" value={data.importGraph.edges.length} />
                </div>
            </div>
        </header>
    );
}

function QuestionCard({ question, answer }: { question: string; answer: string }) {
    return (
        <article className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">Explorer question</p>
            <h2 className="mt-2 text-lg font-black">{question}</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">{answer}</p>
        </article>
    );
}

function Metric({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-3xl border border-white/10 bg-white/10 p-5 backdrop-blur">
            <p className="text-3xl font-black text-white">{formatNumber(value)}</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-widest text-stone-300">{label}</p>
        </div>
    );
}

function SystemMapPanel({
    query,
    setQuery,
    filteredFiles,
    selectedPath,
    selectFile,
}: {
    query: string;
    setQuery: (query: string) => void;
    filteredFiles: Array<{ file: FileEntry; hubScore: number }>;
    selectedPath?: string;
    selectFile: (path: string) => void;
}) {
    return (
        <aside className="rounded-[2rem] border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-xl font-black">System Map</h2>
                    <p className="text-sm text-stone-500">Search files and click a node to inspect impact.</p>
                </div>
                <Pill className="border-stone-200 bg-stone-50 text-stone-700">Showing {filteredFiles.length}</Pill>
            </div>
            <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search path, import, export, type..."
                className="mt-5 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-semibold outline-none transition focus:border-orange-400 focus:bg-white"
            />

            <div className="mt-5 grid max-h-[720px] gap-2 overflow-y-auto pr-1">
                {filteredFiles.map(({ file, hubScore }) => (
                    <button
                        key={file.path}
                        type="button"
                        onClick={() => selectFile(file.path)}
                        className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${selectedPath === file.path ? 'border-orange-300 bg-orange-50 shadow-md' : 'border-stone-200 bg-white'}`}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <p className="break-all text-sm font-black leading-5 text-stone-950">{file.path}</p>
                            <Pill className={typeStyles[file.type] ?? typeStyles.asset}>{file.type}</Pill>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-500">
                            <span>{plural(file.size_lines, 'line')}</span>
                            <span>•</span>
                            <span>{plural(file.imports_from.length, 'import')}</span>
                            <span>•</span>
                            <span>{plural(hubScore, 'dependent')}</span>
                        </div>
                    </button>
                ))}
            </div>
        </aside>
    );
}

function FileDetail({
    file,
    routes,
    envVars,
    services,
    whyCards,
    scars,
    hubScore,
}: {
    file?: FileEntry;
    routes: RouteEntry[];
    envVars: EnvVarEntry[];
    services: ExternalServiceEntry[];
    whyCards: LooseRecord[];
    scars: LooseRecord[];
    hubScore: number;
}) {
    if (!file) return <EmptyState title="No file selected" body="Run the cartography scan to populate file inventory data." />;

    const directImpact = [...file.imported_by, ...routes.map((route) => `${route.method} ${route.url_pattern}`), ...envVars.map((envVar) => envVar.var), ...services.map((service) => service.service)];

    return (
        <article className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <Pill className={typeStyles[file.type] ?? typeStyles.asset}>{file.type}</Pill>
                    <h2 className="mt-4 break-all text-2xl font-black tracking-tight">{file.path}</h2>
                    <p className="mt-2 text-sm leading-6 text-stone-500">
                        Purpose of this panel: show what this file is, what feeds it, what it feeds, and what user-facing DealCollab workflows may be affected if it changes.
                    </p>
                </div>
                <div className="rounded-2xl bg-stone-950 px-4 py-3 text-right text-white">
                    <p className="text-2xl font-black">{hubScore}</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-stone-300">hub score</p>
                </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <InfoCard label="Language" value={file.language} />
                <InfoCard label="Change frequency" value={file.change_frequency} />
                <InfoCard label="Owner tool" value={file.owner_tool} />
                <InfoCard label="Last modified" value={formatStableDate(file.last_modified)} />
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-2">
                <ListPanel title="Inputs / imports" items={file.imports_from} empty="No imports detected." />
                <ListPanel title="Outputs / exports" items={file.exports} empty="No exports detected." />
                <ListPanel title="Imported by" items={file.imported_by} empty="No reverse imports detected." />
                <ListPanel title="Direct impact signals" items={directImpact} empty="No route, env, service, or dependent-file impact detected." />
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-2">
                <NarrativeBlock title="Why card" records={whyCards} empty="No why-card narrative has been written for this file yet." />
                <NarrativeBlock title="Scar tissue" records={scars} empty="No scar tissue entry is linked to this file yet." />
            </div>
        </article>
    );
}

function RouteExplorer({ routes, selectFile, goToMap }: { routes: RouteEntry[]; selectFile: (path: string) => void; goToMap: () => void }) {
    const [routeQuery, setRouteQuery] = useState('');
    const filteredRoutes = routes
        .filter((route) => `${route.method} ${route.url_pattern} ${route.path} ${route.db_reads.join(' ')} ${route.db_writes.join(' ')} ${route.calls_external.join(' ')}`.toLowerCase().includes(routeQuery.toLowerCase()))
        .slice(0, 140);

    return (
        <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h2 className="text-2xl font-black">Route Explorer</h2>
                    <p className="mt-1 text-sm text-stone-500">API routes are backend doors for chat, matching, proposal extraction, profile, auth, and admin workflows.</p>
                </div>
                <input value={routeQuery} onChange={(event) => setRouteQuery(event.target.value)} placeholder="Search route, table, service..." className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm font-semibold outline-none focus:border-orange-400" />
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
                {filteredRoutes.map((route) => (
                    <article key={`${route.method}-${route.path}`} className="rounded-3xl border border-stone-200 bg-stone-50 p-5">
                        <div className="flex flex-wrap items-center gap-2">
                            <Pill className="border-orange-200 bg-orange-100 text-orange-800">{route.method}</Pill>
                            <Pill className={route.auth_required ? 'border-emerald-200 bg-emerald-100 text-emerald-800' : 'border-red-200 bg-red-100 text-red-800'}>{route.auth_required ? 'auth signal' : 'no auth signal'}</Pill>
                            <button
                                type="button"
                                onClick={() => {
                                    selectFile(route.path);
                                    goToMap();
                                }}
                                className="rounded-full border border-stone-300 bg-white px-2.5 py-1 text-xs font-black text-stone-700 hover:border-orange-300 hover:text-orange-700"
                            >
                                inspect file
                            </button>
                        </div>
                        <h3 className="mt-3 break-all text-lg font-black">{route.url_pattern}</h3>
                        <p className="mt-1 break-all text-xs font-semibold text-stone-500">{route.path}</p>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <MiniList label="DB reads" items={route.db_reads} />
                            <MiniList label="DB writes" items={route.db_writes} />
                            <MiniList label="External" items={route.calls_external} />
                            <MiniList label="Modules" items={route.calls_modules.slice(0, 8)} />
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
}

function FlowTracer({ flows, promptAssembly, moduleDecisionTree }: { flows: LooseRecord[]; promptAssembly: LooseRecord; moduleDecisionTree: LooseRecord }) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const selectedFlow = flows[selectedIndex];
    const promptOrder = recordList(promptAssembly, ['order', 'steps', 'modules']);
    const decisionNodes = recordList(moduleDecisionTree, ['nodes', 'steps', 'tree']);

    return (
        <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
            <Panel title="Flow Tracer" subtitle="Trace user-visible behavior across frontend, route, state, prompt, database, matching, and notifications.">
                {flows.length ? (
                    <div className="space-y-2">
                        {flows.map((flow, index) => (
                            <button key={recordString(flow, ['id', 'title', 'name'], `flow-${index}`)} type="button" onClick={() => setSelectedIndex(index)} className={`w-full rounded-2xl border p-4 text-left text-sm font-black ${selectedIndex === index ? 'border-orange-300 bg-orange-50 text-orange-950' : 'border-stone-200 bg-stone-50 text-stone-800'}`}>
                                {recordString(flow, ['title', 'name', 'id'], `Flow ${index + 1}`)}
                            </button>
                        ))}
                    </div>
                ) : (
                    <EmptyState title="No flow traces yet" body="Add entries to cartography/topology/data-flows.json to map buyer search, seller proposal intake, document parsing, closure, matching, and notifications." />
                )}
            </Panel>

            <div className="space-y-6">
                <Panel title={selectedFlow ? recordString(selectedFlow, ['title', 'name', 'id'], 'Selected flow') : 'Selected flow'} subtitle="Step-by-step architecture narrative.">
                    {selectedFlow ? <RecordViewer record={selectedFlow} /> : <EmptyState title="No selected flow" body="The scanner layer is ready; manual flow traces are the next narrative input." />}
                </Panel>
                <Panel title="Prompt assembly" subtitle="Prompt module order matters because it changes LLM behavior during intent detection and proposal extraction.">
                    <ListPanel title="Assembly order" items={promptOrder} empty="No prompt assembly order has been documented yet." />
                </Panel>
                <Panel title="Module decision tree" subtitle="Decision tree means the branching rules that choose which prompt/module path runs next.">
                    <ListPanel title="Decision nodes" items={decisionNodes} empty="No module decision tree has been documented yet." />
                </Panel>
            </div>
        </section>
    );
}

function StateInspector({ stateObjects, mutations, tables }: { stateObjects: LooseRecord[]; mutations: LooseRecord[]; tables: TableEntry[] }) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const selectedState = stateObjects[selectedIndex];

    return (
        <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
            <Panel title="State Inspector" subtitle="State means the structured memory that flows between detection, prompting, matching, and persistence.">
                {stateObjects.length ? (
                    <div className="space-y-2">
                        {stateObjects.map((stateObject, index) => (
                            <button key={recordString(stateObject, ['name', 'defined_in'], `state-${index}`)} type="button" onClick={() => setSelectedIndex(index)} className={`w-full rounded-2xl border p-4 text-left text-sm font-black ${selectedIndex === index ? 'border-orange-300 bg-orange-50 text-orange-950' : 'border-stone-200 bg-stone-50 text-stone-800'}`}>
                                {recordString(stateObject, ['name', 'defined_in'], `State object ${index + 1}`)}
                            </button>
                        ))}
                    </div>
                ) : (
                    <EmptyState title="No state objects documented" body="Add RouterState, proposal extraction state, cognitive state, and matching result objects to cartography/inventory/state-objects.json." />
                )}
            </Panel>
            <div className="space-y-6">
                <Panel title="Selected state object" subtitle="Use this to understand what the system currently remembers and where that memory travels.">
                    {selectedState ? <RecordViewer record={selectedState} /> : <EmptyState title="No state selected" body="State documentation is still empty, so this dashboard is showing the required manual gap." />}
                </Panel>
                <Panel title="Mutation map" subtitle="Mutation means a code path that changes a state field, such as detected intent, sector, geography, or matching readiness.">
                    {mutations.length ? <RecordList records={mutations} /> : <EmptyState title="No mutation map yet" body="Add field-by-field mutation records to cartography/topology/state-mutations.json." />}
                </Panel>
                <Panel title="Persistence bridge" subtitle="This is the bridge from code state to database columns, critical for buyer/seller matching quality.">
                    <div className="grid gap-3 md:grid-cols-2">
                        {tables.slice(0, 12).map((table) => (
                            <div key={table.table} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                                <h3 className="font-black">{table.table}</h3>
                                <p className="mt-1 text-xs text-stone-500">{plural(table.columns.length, 'column')}</p>
                            </div>
                        ))}
                    </div>
                </Panel>
            </div>
        </section>
    );
}

function NarrativeExplorer({ whyCards, scars, typeCounts, topHubs }: { whyCards: LooseRecord[]; scars: LooseRecord[]; typeCounts: Record<string, number>; topHubs: Array<[string, number]> }) {
    return (
        <section className="grid gap-6 xl:grid-cols-2">
            <Panel title="Why Cards" subtitle="Stores the business purpose and architectural context of important files. Explains why a file exists, what business rules it protects, its fragile conditions, and the potential blast radius.">
                {whyCards.length ? <RecordList records={whyCards} /> : <EmptyState title="No why cards yet" body="This is the most valuable manual layer. Start with chat, proposal parsing, matching, auth, and notifications." />}
            </Panel>
            <Panel title="Scar Tissue Registry" subtitle="Stores the project's historical engineering knowledge. Documents workarounds, defensive code, bug fixes, and unusual logic added to solve past production issues.">
                {scars.length ? <RecordList records={scars} /> : <EmptyState title="No scar tissue yet" body="Document LLM reliability guards, matching edge cases, migration workarounds, and auth/session fixes here." />}
            </Panel>
            <Panel title="Coverage signals" subtitle="Use this to decide what narrative to write next.">
                <div className="grid gap-5 md:grid-cols-2">
                    <MiniList label="File types" items={Object.entries(typeCounts).map(([type, count]) => `${type}: ${count}`)} />
                    <MiniList label="Top hubs needing why cards" items={topHubs.map(([file, count]) => `${count} dependents — ${file}`)} />
                </div>
            </Panel>
            <Panel title="How to use this layer" subtitle="Narrative turns generic code search into DealCollab institutional memory.">
                <ol className="space-y-3 text-sm leading-6 text-stone-700">
                    <li><strong>1.</strong> Open a high-impact file from System Map.</li>
                    <li><strong>2.</strong> Check who imports it and which route/service/table signals it touches.</li>
                    <li><strong>3.</strong> Add a why card if the file controls deal sourcing, extraction, matching, or trust.</li>
                    <li><strong>4.</strong> Add scar tissue if a guardrail prevents a known failure from returning.</li>
                </ol>
            </Panel>
        </section>
    );
}

function StalenessDashboard({ staleness, totalFiles }: { staleness: StalenessReport; totalFiles: number }) {
    const staleFiles = staleness.stale_files ?? [];
    const uncoveredFiles = staleness.uncovered_files ?? [];

    return (
        <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black">Staleness Dashboard</h2>
            <p className="mt-1 text-sm text-stone-500">This answers: is the map still accurate after code changed?</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <InfoCard label="Last scan" value={formatStableDateTime(staleness.last_scan_at ?? null)} />
                <InfoCard label="Stale files" value={`${staleFiles.length}`} />
                <InfoCard label="Inventory size" value={`${totalFiles}`} />
            </div>
            <div className="mt-6 grid gap-5 lg:grid-cols-2">
                <ListPanel title="Files changed since scan" items={staleFiles} empty="No stale files detected." />
                <ListPanel title="Files missing from inventory" items={uncoveredFiles} empty="No uncovered files detected." />
            </div>
        </section>
    );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
    return (
        <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-stone-500">{subtitle}</p>
            <div className="mt-6">{children}</div>
        </section>
    );
}

function InfoCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">{label}</p>
            <p className="mt-1 break-words text-sm font-black text-stone-900">{value}</p>
        </div>
    );
}

function ListPanel({ title, items, empty }: { title: string; items: string[]; empty: string }) {
    return (
        <section className="rounded-3xl border border-stone-200 bg-stone-50 p-5">
            <div className="flex items-center justify-between gap-3">
                <h3 className="font-black">{title}</h3>
                <Pill className="border-stone-200 bg-white text-stone-600">{items.length}</Pill>
            </div>
            {items.length ? (
                <ul className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1">
                    {items.slice(0, 90).map((item) => (
                        <li key={item} className="break-all rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-stone-700 shadow-sm">
                            {item}
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="mt-4 text-sm text-stone-500">{empty}</p>
            )}
        </section>
    );
}

function MiniList({ label, items }: { label: string; items: string[] }) {
    return (
        <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">{label}</p>
            {items.length ? (
                <ul className="mt-2 space-y-1.5">
                    {items.slice(0, 14).map((item) => (
                        <li key={item} className="break-all rounded-xl bg-white px-3 py-2 text-xs font-semibold text-stone-700 ring-1 ring-stone-200">
                            {item}
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="mt-2 text-sm text-stone-500">None detected.</p>
            )}
        </div>
    );
}

function NarrativeBlock({ title, records, empty }: { title: string; records: LooseRecord[]; empty: string }) {
    return (
        <section className="rounded-3xl border border-orange-100 bg-orange-50 p-5">
            <h3 className="font-black text-orange-950">{title}</h3>
            {records.length ? <RecordList records={records} /> : <p className="mt-2 text-sm leading-6 text-orange-900">{empty}</p>}
        </section>
    );
}

function RecordList({ records }: { records: LooseRecord[] }) {
    return (
        <div className="space-y-3">
            {records.map((record, index) => (
                <div key={`${recordString(record, ['id', 'path', 'file', 'name', 'title'], 'record')}-${index}`} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                    <RecordViewer record={record} />
                </div>
            ))}
        </div>
    );
}

function RecordViewer({ record }: { record: LooseRecord }) {
    const entries = Object.entries(record);
    if (!entries.length) return <p className="text-sm text-stone-500">Empty record.</p>;

    return (
        <dl className="space-y-3">
            {entries.map(([key, value]) => (
                <div key={key}>
                    <dt className="text-[10px] font-black uppercase tracking-widest text-stone-400">{key.replaceAll('_', ' ')}</dt>
                    <dd className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-stone-800">{stringifyValue(value)}</dd>
                </div>
            ))}
        </dl>
    );
}

function findNarrativeForPath(records: LooseRecord[], path?: string) {
    if (!path) return [];
    return records.filter((record) => {
        const text = [recordString(record, ['path', 'file', 'source', 'module']), ...recordList(record, ['files', 'related_files', 'paths'])]
            .join(' ')
            .toLowerCase();
        return text.includes(path.toLowerCase());
    });
}
