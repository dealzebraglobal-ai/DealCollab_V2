'use client';

import { useEffect, useState, useCallback } from 'react';

interface Match {
    rank: string;            // P1, P2, P3
    matchId: string;
    proposalId: string;
    finalScore: number;
    label: string;           // High | Good | Possible
    reason: string;
    summary: string;
    intent: string | null;
    sectors: string[];
    geographies: string[];
    dealStructure: string | null;
    sizeRange: string | null;
    teaser: string;
    qualityTier: string | null;
    isConnected: boolean;
    revealedContact: { phone: string | null; advisor: string | null } | null;
}

interface MatchesResponse {
    proposalId: string;
    matchCount: number;
    matches: Match[];
    tokensRequired: number;
    userTokens: number;
    canConnect: boolean;
    message: string;
}

type View = 'list' | 'detail' | 'connected';

export function MatchPanel({ proposalId, onStartOver }: { proposalId: string; onStartOver: () => void }) {
    const [data, setData] = useState<MatchesResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<View>('list');
    const [selected, setSelected] = useState<Match | null>(null);
    const [connecting, setConnecting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchMatches = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/matches/${proposalId}`);
            const json = await res.json();
            if (!res.ok) {
                setError(json.error || 'Failed to load matches');
                setData(null);
                return;
            }
            setData(json);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [proposalId]);

    useEffect(() => { 
        Promise.resolve().then(() => fetchMatches());
        
        // If we have no matches yet, poll every 3 seconds
        const interval = setInterval(() => {
            setData(current => {
                if (!current || current.matchCount === 0) {
                    fetchMatches();
                } else {
                    clearInterval(interval);
                }
                return current;
            });
        }, 3000);

        return () => clearInterval(interval);
    }, [fetchMatches]);

    const handleConnect = async () => {
        if (!selected) return;
        setConnecting(true);
        setError(null);
        try {
            const res = await fetch('/api/matches/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ proposalId, matchedProposalId: selected.proposalId }),
            });
            const json = await res.json();
            if (!json.success) {
                if (json.errorCode === 'INSUFFICIENT_TOKENS') {
                    setError(`Not enough tokens. You need ${json.tokensRequired}, you have ${json.newBalance}.`);
                } else {
                    setError(json.message || 'Connection failed');
                }
                return;
            }
            // Update local state with revealed contact
            setSelected({
                ...selected,
                isConnected: true,
                revealedContact: json.counterparty,
            });
            setView('connected');
            // Refresh matches so other cards reflect new token balance
            await fetchMatches();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setConnecting(false);
        }
    };

    if (loading) return <div className="p-4 text-sm text-gray-500">Loading matches…</div>;
    if (error && !data) return <div className="p-4 text-sm text-red-600">{error}</div>;
    if (!data || !data.matches) return null;

    if (data.matchCount === 0) {
        return (
            <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 animate-pulse">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-amber-500 rounded-full animate-ping" />
                    <p className="text-sm font-medium text-amber-900">Searching for aligned counterparties...</p>
                </div>
                <p className="text-xs text-amber-700 mt-1">Our AI is analyzing the network to find the best fit for your mandate.</p>
            </div>
        );
    }

    // LIST view — P1/P2/P3 cards
    if (view === 'list') {
        return (
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Aligned counterparties</h3>
                    <span className="text-xs text-gray-500">
                        {data.userTokens} tokens · {data.tokensRequired} per connect
                    </span>
                </div>
                {data.matches.map((m) => (
                    <div key={m.matchId} className="border rounded-lg p-3 hover:border-amber-400 transition">
                        <div className="flex items-start justify-between mb-2">
                            <div>
                                <span className="text-xs font-bold text-amber-600">{m.rank}</span>
                                <span className="ml-2 text-xs px-2 py-0.5 rounded bg-gray-100">{m.label}</span>
                                {m.isConnected && (
                                    <span className="ml-2 text-xs px-2 py-0.5 rounded bg-green-100 text-green-700">Connected</span>
                                )}
                            </div>
                            <span className="text-xs text-gray-400">Score {(m.finalScore * 100).toFixed(0)}%</span>
                        </div>
                        <p className="text-sm font-medium mb-1">{m.summary}</p>
                        <p className="text-xs text-gray-600 mb-2">{m.reason}</p>
                        {m.teaser && <p className="text-xs text-gray-500 italic line-clamp-2">{m.teaser}</p>}
                        <button
                            onClick={() => { setSelected(m); setView(m.isConnected ? 'connected' : 'detail'); }}
                            className="mt-2 text-xs font-medium text-amber-700 hover:underline"
                        >
                            View {m.rank} →
                        </button>
                    </div>
                ))}
                <button onClick={onStartOver} className="text-xs text-gray-500 underline">
                    Start over with a new mandate
                </button>
            </div>
        );
    }

    // DETAIL view — selected match with Connect button
    if (view === 'detail' && selected) {
        const canAfford = data.userTokens >= data.tokensRequired;
        return (
            <div className="space-y-3 border rounded-lg p-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{selected.rank} · {selected.label}</h3>
                    <span className="text-xs text-gray-400">Score {(selected.finalScore * 100).toFixed(0)}%</span>
                </div>
                <p className="text-sm font-medium">{selected.summary}</p>
                <p className="text-xs text-gray-600">{selected.reason}</p>
                {selected.teaser && (
                    <div className="bg-gray-50 rounded p-3 text-xs italic text-gray-700">
                        &quot;{selected.teaser}&quot;
                    </div>
                )}
                <div className="border-t pt-3">
                    <p className="text-xs text-gray-500 mb-2">
                        Spend <strong>{data.tokensRequired} tokens</strong> to reveal counterparty contact.
                        Current balance: <strong>{data.userTokens} tokens</strong>.
                    </p>
                    {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
                    <div className="flex gap-2">
                        <button
                            onClick={handleConnect}
                            disabled={connecting || !canAfford}
                            className="flex-1 py-2 rounded bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                            {connecting ? 'Connecting…'
                                : !canAfford ? `Need ${data.tokensRequired - data.userTokens} more tokens`
                                    : `Connect — ${data.tokensRequired} tokens`}
                        </button>
                        <button
                            onClick={() => { setSelected(null); setView('list'); setError(null); }}
                            className="px-4 py-2 rounded border text-sm hover:bg-gray-50"
                        >
                            Back to list
                        </button>
                    </div>
                    <button onClick={onStartOver} className="mt-3 text-xs text-gray-500 underline w-full">
                        Start over
                    </button>
                </div>
            </div>
        );
    }

    // CONNECTED view — counterparty revealed
    if (view === 'connected' && selected?.revealedContact) {
        return (
            <div className="space-y-3 border rounded-lg p-4 bg-green-50 border-green-200">
                <div className="flex items-center gap-2">
                    <span className="text-green-700 font-semibold">✓ Connected to {selected.rank}</span>
                </div>
                <p className="text-sm font-medium">{selected.summary}</p>
                <div className="bg-white border rounded p-3 space-y-1">
                    {selected.revealedContact.advisor && (
                        <p className="text-sm"><strong>Advisor:</strong> {selected.revealedContact.advisor}</p>
                    )}
                    {selected.revealedContact.phone && (
                        <p className="text-sm"><strong>Phone:</strong> {selected.revealedContact.phone}</p>
                    )}
                </div>
                <p className="text-xs text-gray-600">
                    The counterparty has been notified of your interest. Initiate contact at your discretion.
                </p>
                <div className="flex gap-2 pt-2">
                    <button
                        onClick={() => { setSelected(null); setView('list'); }}
                        className="px-4 py-2 rounded border text-sm hover:bg-gray-50"
                    >
                        Back to list
                    </button>
                    <button
                        onClick={onStartOver}
                        className="px-4 py-2 rounded text-sm text-amber-700 hover:underline"
                    >
                        Start over
                    </button>
                </div>
            </div>
        );
    }

    return null;
}