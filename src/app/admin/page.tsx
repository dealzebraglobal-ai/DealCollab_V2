'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
    Activity,
    AlertTriangle,
    ArrowUpRight,
    BellRing,
    CheckCircle2,
    Clock3,
    Coins,
    Loader2,
    Lock,
    RefreshCw,
    Search,
    SearchX,
    ShieldCheck,
    Sparkles,
    UserRoundCheck,
    UsersRound,
    XCircle,
} from 'lucide-react';

type Severity = 'high' | 'medium' | 'low';

type Kpis = {
    totalUsers: number;
    newUsersToday: number;
    completedProfiles: number;
    activeProposals: number;
    newProposalsToday: number;
    totalMatches: number;
    pendingEois: number;
    approvedEois: number;
    staleEois: number;
    noMatchProposals: number;
    embeddingPending: number;
    totalTokensPresent: number;
    totalTokensDeducted: number;
};

type QueueItem = {
    id: string;
    type: string;
    severity: Severity;
    title: string;
    subtitle: string;
    ageDays: number;
    actionHint: string;
    href: string;
};

type PendingEoi = {
    id: string;
    status: string;
    created_at: string;
    title: string;
    ageDays: number;
    severity: Severity;
    actionHint: string;
    sender?: { name?: string | null; email?: string | null; phone?: string | null; firm_name?: string | null; role?: string | null } | null;
    receiver?: { name?: string | null; email?: string | null; phone?: string | null; firm_name?: string | null; role?: string | null } | null;
};

type ProposalHealth = {
    id: string;
    title: string;
    intent: string | null;
    sectors: string[] | null;
    geographies: string[] | null;
    quality_score: string | number | null;
    quality_tier: string | null;
    fraud_flags: string[] | null;
    embedding_status: string | null;
    created_at: string;
    matchCount: number;
    eoiCount: number;
    actionHint: string;
    user?: { name?: string | null; email?: string | null; firm_name?: string | null } | null;
};

type IncompleteUser = {
    id: string;
    name: string | null;
    email: string;
    firm_name: string | null;
    role: string | null;
    profile_completion: number | null;
    profile_completed_once: boolean | null;
    is_phone_verified: boolean | null;
    source: string | null;
    tokens: number | null;
    created_at: string;
    actionHint: string;
};


type MasterSearchUser = {
    id: string;
    name: string | null;
    email: string;
    phone?: string | null;
    firm_name?: string | null;
    role?: string | null;
    profile_completion?: number | null;
    is_phone_verified?: boolean | null;
    tokens?: number | null;
    sectors?: string[] | null;
    geographies?: string[] | null;
    intent?: string[] | null;
    created_at: string;
};

type MasterSearchResult = {
    user: MasterSearchUser;
    summary: {
        proposalCount: number;
        matchCount: number;
        sentEoiCount: number;
        receivedEoiCount: number;
        pendingSentEoiCount: number;
        approvedSentEoiCount: number;
        savedSearchCount: number;
        documentCount: number;
        chatSessionCount: number;
        notificationCount: number;
        unreadNotificationCount: number;
        tokenCredits: number;
        tokenDebits: number;
        tokenPurchaseAmount: number;
    };
    proposals: Array<Record<string, unknown>>;
    matches: Array<Record<string, unknown>>;
    sentEois: Array<Record<string, unknown>>;
    receivedEois: Array<Record<string, unknown>>;
    savedSearches: Array<Record<string, unknown>>;
    tokenTransactions: Array<Record<string, unknown>>;
    notifications: Array<Record<string, unknown>>;
    documents: Array<Record<string, unknown>>;
    chatSessions: Array<Record<string, unknown>>;
};

type MasterSearchPayload = {
    query: string;
    results: MasterSearchResult[];
    warnings?: string[];
};

type DashboardPayload = {
    admin: { email: string };
    generatedAt: string;
    kpis: Kpis;
    actionQueue: QueueItem[];
    pendingEois: PendingEoi[];
    proposalHealth: ProposalHealth[];
    incompleteUsers: IncompleteUser[];
};

class AdminAccessError extends Error {
    email?: string | null;
    diagnostics?: { environment: string; allowlistCount: number; looksQuoted: boolean };
    constructor(message: string, email?: string | null, diagnostics?: AdminAccessError['diagnostics']) {
        super(message);
        this.email = email;
        this.diagnostics = diagnostics;
    }
}

const fetcher = async (url: string) => {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
        throw new AdminAccessError(data?.message || data?.error || 'Failed to load admin dashboard', data?.email, data?.diagnostics);
    }
    return data as DashboardPayload;
};

function cx(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(' ');
}

function formatDate(value: string) {
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function formatList(value?: string[] | null) {
    if (!value?.length) return 'Not provided';
    return value.slice(0, 2).join(', ') + (value.length > 2 ? ` +${value.length - 2}` : '');
}

function severityClasses(severity: Severity) {
    if (severity === 'high') return 'bg-red-50 text-red-700 border-red-100';
    if (severity === 'medium') return 'bg-amber-50 text-amber-700 border-amber-100';
    return 'bg-green-50 text-green-700 border-green-100';
}

function KpiCard({ label, value, helper, icon, urgent, detailsHref }: { label: string; value: number; helper: string; icon: React.ReactNode; urgent?: boolean; detailsHref: string }) {
    return (
        <div className={cx('rounded-3xl border bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md', urgent ? 'border-red-100 ring-4 ring-red-50' : 'border-gray-100')}>
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400">{label}</p>
                    <p className="mt-3 text-3xl font-black text-gray-950">{value}</p>
                </div>
                <div className={cx('rounded-2xl p-3', urgent ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-[#F97316]')}>
                    {icon}
                </div>
            </div>
            <p className="mt-3 text-xs font-semibold leading-relaxed text-gray-500">{helper}</p>
            <Link href={detailsHref} className="mt-4 inline-flex w-full items-center justify-center rounded-2xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs font-black uppercase tracking-widest text-gray-500 transition-colors hover:border-orange-100 hover:bg-orange-50 hover:text-[#F97316]">
                See details
            </Link>
        </div>
    );
}


function getClientErrorMessage(value: unknown) {
    if (!value) return null;
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const parts = [record.message, record.details, record.hint, record.code]
            .filter(Boolean)
            .map(String);
        return parts.length ? parts.join(' | ') : JSON.stringify(record);
    }
    return String(value);
}

function shortJson(value: unknown) {
    if (!value) return '—';
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return text.length > 120 ? `${text.slice(0, 120)}...` : text;
}

function ActivityMiniList({ title, rows, emptyText }: { title: string; rows: Array<Record<string, unknown>>; emptyText: string }) {
    return (
        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
                <h4 className="text-xs font-black uppercase tracking-widest text-gray-500">{title}</h4>
                <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-gray-400">{rows.length}</span>
            </div>
            {rows.length === 0 ? (
                <p className="text-xs font-bold text-gray-400">{emptyText}</p>
            ) : (
                <div className="space-y-2">
                    {rows.slice(0, 3).map((row, index) => (
                        <div key={String(row.id || row.search_id || `${title}-${index}`)} className="rounded-xl bg-white p-3 text-xs font-semibold leading-relaxed text-gray-600">
                            <p className="font-black text-gray-900">{String(row.id || row.search_id || row.title || `Row ${index + 1}`)}</p>
                            <p className="mt-1 text-gray-500">{shortJson(row.normalised_text || row.status || row.match_reason || row.message || row.name || row.action || row.query_object)}</p>
                        </div>
                    ))}
                    {rows.length > 3 && <p className="text-[11px] font-bold text-gray-400">+{rows.length - 3} more rows</p>}
                </div>
            )}
        </div>
    );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
    return (
        <div>
            <h2 className="text-lg font-black text-gray-950">{title}</h2>
            <p className="mt-1 text-sm font-medium text-gray-500">{description}</p>
        </div>
    );
}

export default function AdminPage() {
    const { data, error, isLoading, mutate, isValidating } = useSWR('/api/admin/dashboard', fetcher, { refreshInterval: 30000 });
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [actionMessage, setActionMessage] = useState<string | null>(null);
    const [masterSearchInput, setMasterSearchInput] = useState('');
    const [masterSearchData, setMasterSearchData] = useState<MasterSearchPayload | null>(null);
    const [masterSearchLoading, setMasterSearchLoading] = useState(false);
    const [masterSearchError, setMasterSearchError] = useState<string | null>(null);

    const urgentCount = useMemo(() => data?.actionQueue.filter((item) => item.severity === 'high').length || 0, [data]);

    const runMasterSearch = async () => {
        const query = masterSearchInput.trim();
        if (query.length < 2) {
            setMasterSearchError('Type at least 2 characters to search users.');
            return;
        }

        setMasterSearchLoading(true);
        setMasterSearchError(null);

        const res = await fetch(`/api/admin/dashboard?masterSearch=${encodeURIComponent(query)}`);
        const result = await res.json();
        if (!res.ok) {
            setMasterSearchError(getClientErrorMessage(result?.error) || getClientErrorMessage(result?.message) || 'Master search failed');
            setMasterSearchLoading(false);
            return;
        }

        setMasterSearchData(result as MasterSearchPayload);
        setMasterSearchLoading(false);
    };

    const runEoiAction = async (eoiId: string, action: 'approve_eoi' | 'decline_eoi' | 'nudge_receiver') => {
        setActionLoading(`${action}-${eoiId}`);
        setActionMessage(null);

        const res = await fetch('/api/admin/dashboard', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eoiId, action }),
        });
        const result = await res.json();
        if (!res.ok) {
            setActionLoading(null);
            setActionMessage(result?.error || 'Admin action failed');
            return;
        }

        setActionMessage(action === 'nudge_receiver' ? 'Receiver reminder notification created.' : `EOI ${result.status}.`);
        await mutate();
        setActionLoading(null);
    };

    if (isLoading) {
        return (
            <main className="min-h-screen bg-[#F7F7F5] p-6 sm:p-10">
                <div className="mx-auto flex min-h-[70vh] max-w-7xl items-center justify-center">
                    <div className="rounded-3xl border border-gray-100 bg-white p-8 text-center shadow-sm">
                        <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-[#F97316]" />
                        <p className="text-sm font-bold text-gray-500">Loading admin control room...</p>
                    </div>
                </div>
            </main>
        );
    }

    if (error) {
        const accessError = error instanceof AdminAccessError ? error : null;
        return (
            <main className="min-h-screen bg-[#F7F7F5] p-6 sm:p-10">
                <div className="mx-auto flex min-h-[70vh] max-w-2xl items-center justify-center">
                    <div className="rounded-[32px] border border-red-100 bg-white p-8 text-center shadow-sm">
                        <Lock className="mx-auto mb-4 h-10 w-10 text-red-500" />
                        <h1 className="text-2xl font-black text-gray-950">Admin access blocked</h1>
                        <p className="mt-3 text-sm font-semibold leading-relaxed text-gray-500">{error.message}</p>
                        <p className="mt-4 rounded-2xl bg-gray-50 p-4 text-xs font-bold text-gray-500">Set ADMIN_EMAILS to a comma-separated allowlist, then sign in with one of those emails.</p>
                        {accessError && (
                            <div className="mt-4 space-y-1 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-left text-xs font-bold text-gray-500">
                                <p>Signed in as: <span className="font-mono text-gray-700">{accessError.email || 'no email on session'}</span></p>
                                <p>Deployment environment: <span className="font-mono text-gray-700">{accessError.diagnostics?.environment ?? 'unknown'}</span></p>
                                <p>ADMIN_EMAILS entries loaded: <span className="font-mono text-gray-700">{accessError.diagnostics?.allowlistCount ?? 0}</span></p>
                                {accessError.diagnostics?.looksQuoted && (
                                    <p className="text-red-600">⚠ ADMIN_EMAILS looks wrapped in quote characters — remove them in Vercel (no quotes around the value).</p>
                                )}
                            </div>
                        )}
                        <Link href="/" className="mt-6 inline-flex rounded-2xl bg-[#1F2937] px-5 py-3 text-sm font-black text-white transition-colors hover:bg-[#F97316]">Back to login</Link>
                    </div>
                </div>
            </main>
        );
    }

    if (!data) return null;

    return (
        <main className="min-h-screen bg-[#F7F7F5] p-4 sm:p-8 lg:p-10">
            <div className="mx-auto max-w-7xl space-y-8">
                <header className="flex flex-col gap-5 rounded-[32px] border border-gray-100 bg-white p-6 shadow-sm md:flex-row md:items-end md:justify-between">
                    <div>
                        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-[#F97316]">
                            <ShieldCheck size={14} /> Admin allowlist active
                        </div>
                        <h1 className="text-3xl font-black tracking-tight text-gray-950 sm:text-4xl">Admin Control Room</h1>
                        <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-gray-500">
                            Launch health, deal movement, and operational blockages for DealCollab. Primary focus: EOIs pending more than 3 days.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="rounded-2xl bg-gray-50 px-4 py-3 text-xs font-bold text-gray-500">
                            {data.admin.email} • Updated {formatDate(data.generatedAt)}
                        </div>
                        <button
                            onClick={() => mutate()}
                            className="inline-flex items-center gap-2 rounded-2xl bg-[#1F2937] px-4 py-3 text-sm font-black text-white transition-colors hover:bg-[#F97316]"
                        >
                            <RefreshCw size={16} className={cx(isValidating && 'animate-spin')} /> Refresh
                        </button>
                    </div>
                </header>

                {actionMessage && (
                    <div className="rounded-3xl border border-orange-100 bg-orange-50 px-5 py-4 text-sm font-bold text-orange-800">
                        {actionMessage}
                    </div>
                )}

                <section className="rounded-[32px] border border-gray-100 bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-gray-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-gray-500">
                                <Search size={14} /> Master user search
                            </div>
                            <h2 className="text-xl font-black text-gray-950">Search one person and see their complete DealCollab activity</h2>
                            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-gray-500">
                                Enter a name, email, firm, or phone. The result shows user ID, proposals, matches, sent/received EOIs, saved searches, documents, chats, notifications, and token movement.
                            </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-[1fr_auto] lg:min-w-[480px]">
                            <input
                                value={masterSearchInput}
                                onChange={(event) => setMasterSearchInput(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') runMasterSearch();
                                }}
                                placeholder="Search by name, email, firm, or phone..."
                                className="h-12 rounded-2xl border border-gray-100 bg-gray-50 px-4 text-sm font-bold text-gray-700 outline-none transition-colors focus:border-orange-200 focus:bg-white"
                            />
                            <button
                                onClick={runMasterSearch}
                                disabled={masterSearchLoading}
                                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#F97316] px-5 text-sm font-black text-white transition-colors hover:bg-[#EA580C] disabled:opacity-60"
                            >
                                {masterSearchLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Search
                            </button>
                        </div>
                    </div>

                    {masterSearchError && (
                        <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                            {masterSearchError}
                        </div>
                    )}

                    {masterSearchData && (
                        <div className="mt-6 space-y-5">
                            <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm font-bold text-gray-600">
                                Search: “{masterSearchData.query}” • {masterSearchData.results.length} matching user{masterSearchData.results.length === 1 ? '' : 's'}
                            </div>


                            {!!masterSearchData.warnings?.length && (
                                <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-bold leading-relaxed text-amber-800">
                                    Some activity sections could not be loaded: {masterSearchData.warnings.join(' • ')}
                                </div>
                            )}

                            {masterSearchData.results.length === 0 ? (
                                <div className="rounded-3xl border border-gray-100 bg-gray-50 p-6 text-sm font-bold text-gray-400">
                                    No users matched this search.
                                </div>
                            ) : masterSearchData.results.map((result) => (
                                <div key={result.user.id} className="rounded-[28px] border border-gray-100 bg-gray-50 p-5">
                                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                        <div>
                                            <h3 className="text-lg font-black text-gray-950">{result.user.name || result.user.email}</h3>
                                            <p className="mt-1 text-xs font-bold text-gray-500">ID: {result.user.id}</p>
                                            <p className="mt-1 text-sm font-semibold text-gray-600">
                                                {result.user.firm_name || 'No firm'} • {result.user.role || 'No role'} • {result.user.email}
                                            </p>
                                            <p className="mt-1 text-xs font-bold text-gray-400">
                                                Phone: {result.user.phone || 'Not provided'} • Profile: {result.user.profile_completion || 0}% • Tokens: {result.user.tokens || 0}
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[520px]">
                                            <div className="rounded-2xl bg-white p-3 text-center"><p className="text-lg font-black text-gray-950">{result.summary.proposalCount}</p><p className="text-[10px] font-black uppercase text-gray-400">Proposals</p></div>
                                            <div className="rounded-2xl bg-white p-3 text-center"><p className="text-lg font-black text-gray-950">{result.summary.matchCount}</p><p className="text-[10px] font-black uppercase text-gray-400">Matches</p></div>
                                            <div className="rounded-2xl bg-white p-3 text-center"><p className="text-lg font-black text-gray-950">{result.summary.sentEoiCount}</p><p className="text-[10px] font-black uppercase text-gray-400">Sent EOIs</p></div>
                                            <div className="rounded-2xl bg-white p-3 text-center"><p className="text-lg font-black text-gray-950">{result.summary.receivedEoiCount}</p><p className="text-[10px] font-black uppercase text-gray-400">Received EOIs</p></div>
                                            <div className="rounded-2xl bg-white p-3 text-center"><p className="text-lg font-black text-gray-950">{result.summary.pendingSentEoiCount}</p><p className="text-[10px] font-black uppercase text-gray-400">Pending sent</p></div>
                                            <div className="rounded-2xl bg-white p-3 text-center"><p className="text-lg font-black text-gray-950">{result.summary.savedSearchCount}</p><p className="text-[10px] font-black uppercase text-gray-400">Saved searches</p></div>
                                            <div className="rounded-2xl bg-white p-3 text-center"><p className="text-lg font-black text-gray-950">{result.summary.documentCount}</p><p className="text-[10px] font-black uppercase text-gray-400">Documents</p></div>
                                            <div className="rounded-2xl bg-white p-3 text-center"><p className="text-lg font-black text-gray-950">{result.summary.tokenDebits}</p><p className="text-[10px] font-black uppercase text-gray-400">Tokens spent</p></div>
                                        </div>
                                    </div>

                                    <div className="mt-5 grid gap-4 xl:grid-cols-3">
                                        <ActivityMiniList title="Proposals" rows={result.proposals} emptyText="No proposals found for this user." />
                                        <ActivityMiniList title="Matches" rows={result.matches} emptyText="No matches found from this user's proposals." />
                                        <ActivityMiniList title="Sent EOIs" rows={result.sentEois} emptyText="This user has not sent EOIs." />
                                        <ActivityMiniList title="Received EOIs" rows={result.receivedEois} emptyText="This user has not received EOIs." />
                                        <ActivityMiniList title="Saved searches" rows={result.savedSearches} emptyText="No saved searches / no-match records." />
                                        <ActivityMiniList title="Documents & chats" rows={[...result.documents, ...result.chatSessions]} emptyText="No document or chat intake activity." />
                                        <ActivityMiniList title="Token transactions" rows={result.tokenTransactions} emptyText="No token ledger activity." />
                                        <ActivityMiniList title="Notifications" rows={result.notifications} emptyText="No notifications found." />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                    <KpiCard label="Users" value={data.kpis.totalUsers} helper={`${data.kpis.newUsersToday} new today`} icon={<UsersRound size={22} />} detailsHref="/admin/details/users" />
                    <KpiCard label="Profiles completed" value={data.kpis.completedProfiles} helper="Users ready for better matching" icon={<UserRoundCheck size={22} />} detailsHref="/admin/details/profiles-completed" />
                    <KpiCard label="Active proposals" value={data.kpis.activeProposals} helper={`${data.kpis.newProposalsToday} new today`} icon={<Sparkles size={22} />} detailsHref="/admin/details/active-proposals" />
                    <KpiCard label="Total matches" value={data.kpis.totalMatches} helper="Proposal match records generated" icon={<Activity size={22} />} detailsHref="/admin/details/matches" />
                    <KpiCard label="Pending EOIs" value={data.kpis.pendingEois} helper="Awaiting receiver response" icon={<Clock3 size={22} />} detailsHref="/admin/details/pending-eois" />
                    <KpiCard label="EOIs > 3 days" value={data.kpis.staleEois} helper="Highest-priority blockage" icon={<AlertTriangle size={22} />} urgent={data.kpis.staleEois > 0} detailsHref="/admin/details/stale-eois" />
                    <KpiCard label="Saved searches" value={data.kpis.noMatchProposals} helper="No-match demand captured in saved_searches" icon={<SearchX size={22} />} urgent={data.kpis.noMatchProposals > 0} detailsHref="/admin/details/saved-searches" />
                    <KpiCard label="Embedding pending" value={data.kpis.embeddingPending} helper="Matching may not run yet" icon={<Loader2 size={22} />} urgent={data.kpis.embeddingPending > 0} detailsHref="/admin/details/embedding-pending" />
                    <KpiCard label="Tokens present" value={data.kpis.totalTokensPresent} helper="Current token balance across all users" icon={<Coins size={22} />} detailsHref="/admin/details/tokens-present" />
                    <KpiCard label="Tokens deducted" value={data.kpis.totalTokensDeducted} helper="Total debited/spent token ledger amount" icon={<Coins size={22} />} urgent={data.kpis.totalTokensDeducted > 0} detailsHref="/admin/details/tokens-deducted" />
                </section>

                <section className="rounded-[32px] border border-gray-100 bg-white p-6 shadow-sm">
                    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <SectionHeader title="Urgent action queue" description={`${urgentCount} high-priority items need business or technical follow-up.`} />
                        <div className="rounded-full bg-gray-50 px-4 py-2 text-xs font-black uppercase tracking-widest text-gray-400">Sorted by severity + age</div>
                    </div>
                    {data.actionQueue.length === 0 ? (
                        <div className="rounded-3xl border border-green-100 bg-green-50 p-6 text-sm font-bold text-green-700">No urgent admin actions right now.</div>
                    ) : (
                        <div className="grid gap-3">
                            {data.actionQueue.map((item) => (
                                <Link key={item.id} href={item.href} className="group grid gap-4 rounded-3xl border border-gray-100 bg-gray-50 p-4 transition-all hover:border-orange-100 hover:bg-orange-50/40 md:grid-cols-[180px_1fr_120px] md:items-center">
                                    <div className={cx('w-fit rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-widest', severityClasses(item.severity))}>{item.type}</div>
                                    <div>
                                        <p className="font-black text-gray-950">{item.title}</p>
                                        <p className="mt-1 text-sm font-semibold text-gray-500">{item.subtitle}</p>
                                        <p className="mt-2 text-xs font-bold text-gray-400">Action: {item.actionHint}</p>
                                    </div>
                                    <div className="flex items-center justify-between gap-2 text-sm font-black text-gray-500 md:justify-end">
                                        {item.ageDays}d old <ArrowUpRight size={16} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </section>

                <section className="rounded-[32px] border border-gray-100 bg-white p-6 shadow-sm">
                    <SectionHeader title="Pending EOIs" description="Admin actions are available here: nudge receiver, approve, or decline after review." />
                    <div className="mt-5 overflow-x-auto">
                        <table className="w-full min-w-[980px] text-left text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 text-[11px] font-black uppercase tracking-widest text-gray-400">
                                    <th className="py-3 pr-4">Deal / proposal</th>
                                    <th className="py-3 pr-4">Sender</th>
                                    <th className="py-3 pr-4">Receiver</th>
                                    <th className="py-3 pr-4">Age</th>
                                    <th className="py-3 pr-4">Action hint</th>
                                    <th className="py-3 pr-4">Admin actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.pendingEois.length === 0 ? (
                                    <tr><td colSpan={6} className="py-8 text-center text-sm font-bold text-gray-400">No pending EOIs requiring action.</td></tr>
                                ) : data.pendingEois.map((eoi) => (
                                    <tr key={eoi.id} className="border-b border-gray-50 align-top">
                                        <td className="py-4 pr-4 font-bold text-gray-950">{eoi.title}</td>
                                        <td className="py-4 pr-4 text-gray-600">{eoi.sender?.name || 'Unknown'}<div className="text-xs font-semibold text-gray-400">{eoi.sender?.firm_name || eoi.sender?.email || 'No firm'}</div></td>
                                        <td className="py-4 pr-4 text-gray-600">
                                            {eoi.receiver?.name || 'Unknown'}
                                            <div className="text-xs font-semibold text-gray-400">{eoi.receiver?.firm_name || eoi.receiver?.email || 'No firm'}</div>
                                            <div className="mt-1 text-xs font-black text-[#F97316]">Phone: {eoi.receiver?.phone || 'Not provided'}</div>
                                        </td>
                                        <td className="py-4 pr-4"><span className={cx('rounded-full border px-3 py-1 text-xs font-black', severityClasses(eoi.severity))}>{eoi.ageDays} days</span></td>
                                        <td className="py-4 pr-4 text-xs font-bold text-gray-500">{eoi.actionHint}</td>
                                        <td className="py-4 pr-4">
                                            <div className="flex flex-wrap gap-2">
                                                <button onClick={() => runEoiAction(eoi.id, 'nudge_receiver')} disabled={!!actionLoading} className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-700 hover:bg-amber-100 disabled:opacity-60"><BellRing size={13} className="mr-1 inline" />Nudge</button>
                                                <button onClick={() => runEoiAction(eoi.id, 'approve_eoi')} disabled={!!actionLoading} className="rounded-xl bg-green-50 px-3 py-2 text-xs font-black text-green-700 hover:bg-green-100 disabled:opacity-60"><CheckCircle2 size={13} className="mr-1 inline" />Approve</button>
                                                <button onClick={() => runEoiAction(eoi.id, 'decline_eoi')} disabled={!!actionLoading} className="rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-100 disabled:opacity-60"><XCircle size={13} className="mr-1 inline" />Decline</button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
                    <section className="rounded-[32px] border border-gray-100 bg-white p-6 shadow-sm">
                        <SectionHeader title="Proposal health" description="No-match, pending-embedding, and fraud-flagged proposals." />
                        <div className="mt-5 space-y-3">
                            {data.proposalHealth.length === 0 ? (
                                <div className="rounded-3xl border border-green-100 bg-green-50 p-6 text-sm font-bold text-green-700">All active proposals currently look healthy.</div>
                            ) : data.proposalHealth.map((proposal) => (
                                <div key={proposal.id} className="rounded-3xl border border-gray-100 bg-gray-50 p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <p className="font-black text-gray-950">{proposal.title}</p>
                                            <p className="mt-1 text-xs font-bold text-gray-400">{proposal.user?.name || proposal.user?.email || 'Unknown user'} • {proposal.intent || 'Unknown intent'}</p>
                                        </div>
                                        <span className={cx('rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-widest', proposal.embedding_status === 'PENDING' ? severityClasses('medium') : proposal.matchCount === 0 ? severityClasses('high') : severityClasses('low'))}>{proposal.embedding_status || 'UNKNOWN'}</span>
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs font-bold text-gray-500 md:grid-cols-4">
                                        <div>Sector: {formatList(proposal.sectors)}</div>
                                        <div>Geo: {formatList(proposal.geographies)}</div>
                                        <div>Matches: {proposal.matchCount}</div>
                                        <div>EOIs: {proposal.eoiCount}</div>
                                    </div>
                                    <p className="mt-3 text-xs font-bold text-gray-400">Action: {proposal.actionHint}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="rounded-[32px] border border-gray-100 bg-white p-6 shadow-sm">
                        <SectionHeader title="Incomplete users" description="Users likely blocked before useful matching can happen." />
                        <div className="mt-5 space-y-3">
                            {data.incompleteUsers.length === 0 ? (
                                <div className="rounded-3xl border border-green-100 bg-green-50 p-6 text-sm font-bold text-green-700">No incomplete users found in the current window.</div>
                            ) : data.incompleteUsers.map((user) => (
                                <div key={user.id} className="rounded-3xl border border-gray-100 bg-gray-50 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="font-black text-gray-950">{user.name || user.email}</p>
                                            <p className="mt-1 text-xs font-bold text-gray-400">{user.firm_name || 'No firm'} • {user.role || 'No role'} • {user.source || 'unknown source'}</p>
                                        </div>
                                        <span className="rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">{user.profile_completion || 0}%</span>
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-gray-500">
                                        <span>Phone: {user.is_phone_verified ? 'verified' : 'not verified'}</span>
                                        <span>Tokens: {user.tokens || 0}</span>
                                        <span>Joined: {formatDate(user.created_at)}</span>
                                    </div>
                                    <p className="mt-3 text-xs font-bold text-gray-400">Action: {user.actionHint}</p>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            </div>
        </main>
    );
}





