'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowLeft, ArrowUpDown, Loader2, Lock, RefreshCw, Search } from 'lucide-react';

type SortDirection = 'asc' | 'desc';
type RowValue = string | number | boolean | null | undefined | RowValue[] | { [key: string]: RowValue };
type AdminRow = Record<string, RowValue>;

type DetailPayload = {
    admin: { email: string };
    generatedAt: string;
    detail: string;
    rows: AdminRow[];
};

const detailLabels: Record<string, string> = {
    users: 'All users',
    'profiles-completed': 'Completed profiles',
    'active-proposals': 'Active proposals',
    matches: 'Proposal matches',
    'pending-eois': 'Pending EOIs',
    'stale-eois': 'EOIs older than 3 days',
    'saved-searches': 'Saved searches / no-match proposals',
    'embedding-pending': 'Embedding pending proposals',
    'tokens-present': 'Current user token balances',
    'tokens-deducted': 'Deducted token ledger rows',
};

const fetcher = async (url: string) => {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || data?.error || 'Failed to load admin details');
    return data as DetailPayload;
};

function stringifyValue(value: RowValue): string {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.map(stringifyValue).join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

function getRowSearchText(row: AdminRow): string {
    return JSON.stringify(row).toLowerCase();
}

function getSortableDate(row: AdminRow): number {
    const value = row.created_at || row.createdAt || row.expires_at || row.notified_at || row.id || '';
    const dateValue = Date.parse(String(value));
    if (!Number.isNaN(dateValue)) return dateValue;
    return String(value).toLowerCase().charCodeAt(0) || 0;
}

function getColumns(rows: AdminRow[]) {
    const columns = new Set<string>();
    rows.slice(0, 50).forEach((row) => {
        Object.keys(row).forEach((key) => columns.add(key));
    });
    return Array.from(columns);
}

function formatDate(value: string) {
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export default function AdminDetailsPage({ params }: { params: Promise<{ type: string }> }) {
    const { type } = React.use(params);
    const { data, error, isLoading, mutate, isValidating } = useSWR(`/api/admin/dashboard?detail=${type}`, fetcher, { refreshInterval: 30000 });
    const [draftSearch, setDraftSearch] = useState('');
    const [search, setSearch] = useState('');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    const rows = data?.rows || [];
    const filteredRows = useMemo(() => {
        const trimmedSearch = search.trim().toLowerCase();
        const searchedRows = trimmedSearch
            ? rows.filter((row) => getRowSearchText(row).includes(trimmedSearch))
            : rows;

        return [...searchedRows].sort((a, b) => {
            const aValue = getSortableDate(a);
            const bValue = getSortableDate(b);
            return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
        });
    }, [rows, search, sortDirection]);

    const columns = useMemo(() => getColumns(filteredRows.length ? filteredRows : rows), [filteredRows, rows]);

    if (isLoading) {
        return (
            <main className="min-h-screen bg-[#F7F7F5] p-6 sm:p-10">
                <div className="mx-auto flex min-h-[70vh] max-w-7xl items-center justify-center">
                    <div className="rounded-3xl border border-gray-100 bg-white p-8 text-center shadow-sm">
                        <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-[#F97316]" />
                        <p className="text-sm font-bold text-gray-500">Loading admin detail rows...</p>
                    </div>
                </div>
            </main>
        );
    }

    if (error) {
        return (
            <main className="min-h-screen bg-[#F7F7F5] p-6 sm:p-10">
                <div className="mx-auto flex min-h-[70vh] max-w-2xl items-center justify-center">
                    <div className="rounded-[32px] border border-red-100 bg-white p-8 text-center shadow-sm">
                        <Lock className="mx-auto mb-4 h-10 w-10 text-red-500" />
                        <h1 className="text-2xl font-black text-gray-950">Admin details blocked</h1>
                        <p className="mt-3 text-sm font-semibold leading-relaxed text-gray-500">{error.message}</p>
                        <Link href="/admin" className="mt-6 inline-flex rounded-2xl bg-[#1F2937] px-5 py-3 text-sm font-black text-white transition-colors hover:bg-[#F97316]">Back to admin</Link>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-[#F7F7F5] p-4 sm:p-8 lg:p-10">
            <div className="mx-auto max-w-7xl space-y-6">
                <header className="rounded-[32px] border border-gray-100 bg-white p-6 shadow-sm">
                    <Link href="/admin" className="mb-5 inline-flex items-center gap-2 text-sm font-black text-gray-500 transition-colors hover:text-[#F97316]">
                        <ArrowLeft size={16} /> Back to Admin Control Room
                    </Link>
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#F97316]">Admin details</p>
                            <h1 className="mt-2 text-3xl font-black tracking-tight text-gray-950 sm:text-4xl">{detailLabels[type] || 'Admin detail rows'}</h1>
                            <p className="mt-2 text-sm font-semibold text-gray-500">
                                Showing {filteredRows.length} of {rows.length} rows. Search checks every value in each row.
                            </p>
                            {data?.generatedAt && <p className="mt-2 text-xs font-bold text-gray-400">Updated {formatDate(data.generatedAt)}</p>}
                        </div>
                        <button
                            onClick={() => mutate()}
                            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#1F2937] px-4 py-3 text-sm font-black text-white transition-colors hover:bg-[#F97316]"
                        >
                            <RefreshCw size={16} className={isValidating ? 'animate-spin' : ''} /> Refresh
                        </button>
                    </div>
                </header>

                <section className="rounded-[32px] border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input
                                value={draftSearch}
                                onChange={(event) => setDraftSearch(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') setSearch(draftSearch);
                                }}
                                placeholder="Search any word across all rows..."
                                className="h-12 w-full rounded-2xl border border-gray-100 bg-gray-50 pl-11 pr-4 text-sm font-bold text-gray-700 outline-none transition-colors focus:border-orange-200 focus:bg-white"
                            />
                        </div>
                        <button
                            onClick={() => setSearch(draftSearch)}
                            className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#F97316] px-5 text-sm font-black text-white transition-colors hover:bg-[#EA580C]"
                        >
                            Search
                        </button>
                        <button
                            onClick={() => setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')}
                            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-gray-100 bg-gray-50 px-5 text-sm font-black text-gray-600 transition-colors hover:bg-gray-100"
                        >
                            <ArrowUpDown size={16} /> Sort {sortDirection === 'asc' ? 'ascending' : 'descending'}
                        </button>
                    </div>
                </section>

                <section className="rounded-[32px] border border-gray-100 bg-white p-2 shadow-sm sm:p-4">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[900px] text-left text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 text-[11px] font-black uppercase tracking-widest text-gray-400">
                                    {columns.map((column) => (
                                        <th key={column} className="px-3 py-4">{column.replaceAll('_', ' ')}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={Math.max(columns.length, 1)} className="px-3 py-10 text-center text-sm font-bold text-gray-400">
                                            No rows match this search.
                                        </td>
                                    </tr>
                                ) : filteredRows.map((row, index) => (
                                    <tr key={String(row.id || row.search_id || `${type}-${index}`)} className="border-b border-gray-50 align-top">
                                        {columns.map((column) => (
                                            <td key={column} className="max-w-[320px] px-3 py-4 text-xs font-semibold leading-relaxed text-gray-600">
                                                <span className="line-clamp-4 break-words">{stringifyValue(row[column]) || '—'}</span>
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
        </main>
    );
}


