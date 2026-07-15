import { NextRequest, NextResponse } from 'next/server';
import { getAdminAccess } from '@/lib/admin';
import { createServerSupabaseClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AdminUser = {
    id: string;
    name: string | null;
    email: string;
    phone: string | null;
    firm_name: string | null;
    role: string | null;
    profile_completion: number | null;
    profile_completed_once: boolean | null;
    is_phone_verified: boolean | null;
    source: string | null;
    tokens: number | null;
    created_at: string;
};

type AdminProposal = {
    id: string;
    user_id: string;
    normalised_text: string | null;
    intent: string | null;
    sectors: string[] | null;
    geographies: string[] | null;
    deal_size_min_cr: string | number | null;
    deal_size_max_cr: string | number | null;
    quality_score: string | number | null;
    quality_tier: string | null;
    status: string | null;
    fraud_flags: string[] | null;
    embedding_status: string | null;
    created_at: string;
    user?: { name: string | null; email: string | null; firm_name: string | null } | null;
};

type AdminMatch = {
    id: string;
    proposal_id: string;
    matched_proposal_id?: string;
    final_score: string | number | null;
    confidence_score: string | number | null;
    status: string | null;
    created_at: string;
};

type AdminEoi = {
    id: string;
    deal_id: string;
    match_id: string | null;
    sender_id: string;
    receiver_id: string | null;
    status: string;
    created_at: string;
    sender?: { name: string | null; email: string | null; phone: string | null; firm_name: string | null; role: string | null } | null;
    receiver?: { name: string | null; email: string | null; phone: string | null; firm_name: string | null; role: string | null } | null;
    deal?: { normalised_text: string | null; intent: string | null; sectors: string[] | null; geographies: string[] | null } | null;
};

type SavedSearch = {
    search_id: string;
    user_id: string | null;
    proposal_id: string | null;
    query_object: Record<string, unknown> | null;
    status: string;
    expires_at: string | null;
    created_at: string;
    notified_at: string | null;
    user?: { name: string | null; email: string | null; firm_name: string | null } | null;
    proposal?: AdminProposal | null;
};

type DetailType =
    | 'users'
    | 'profiles-completed'
    | 'active-proposals'
    | 'matches'
    | 'pending-eois'
    | 'stale-eois'
    | 'saved-searches'
    | 'embedding-pending'
    | 'tokens-present'
    | 'tokens-deducted';

function startOfTodayIso() {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return today.toISOString();
}

function daysOld(createdAt: string) {
    const ageMs = Date.now() - new Date(createdAt).getTime();
    return Math.max(0, Math.floor(ageMs / (1000 * 60 * 60 * 24)));
}

function summarizeProposal(proposal?: AdminProposal | AdminEoi['deal'] | null) {
    if (!proposal) return 'Untitled proposal';
    const text = 'normalised_text' in proposal ? proposal.normalised_text : null;
    if (!text) return 'Untitled proposal';
    return text.length > 90 ? `${text.slice(0, 90).trim()}...` : text;
}

function summarizeSavedSearch(savedSearch: SavedSearch) {
    return summarizeProposal(savedSearch.proposal) || `Saved search ${savedSearch.search_id}`;
}

function getAgeSeverity(createdAt: string) {
    const age = daysOld(createdAt);
    if (age >= 3) return 'high';
    if (age >= 1) return 'medium';
    return 'low';
}

async function requireAdmin() {
    const access = await getAdminAccess();
    if (!access.allowed) {
        return {
            access,
            response: NextResponse.json(
                {
                    error: 'Forbidden',
                    message: access.configured
                        ? 'Your email is not on the ADMIN_EMAILS allowlist.'
                        : 'ADMIN_EMAILS is not configured.',
                    email: access.email,
                },
                { status: access.email ? 403 : 401 }
            ),
        };
    }

    return { access, response: null };
}

function getSavedSearchSelect() {
    return 'search_id,user_id,proposal_id,query_object,status,expires_at,created_at,notified_at,user:users!user_id(name,email,firm_name),proposal:proposals!proposal_id(id,user_id,normalised_text,intent,sectors,geographies,deal_size_min_cr,deal_size_max_cr,quality_score,quality_tier,status,fraud_flags,embedding_status,created_at)';
}

async function getDetailRows(supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>, detail: DetailType, threeDaysAgo: string) {
    switch (detail) {
        case 'users':
            return supabase
                .from('users')
                .select('id,name,email,phone,firm_name,role,profile_completion,profile_completed_once,is_phone_verified,source,tokens,created_at')
                .order('created_at', { ascending: false })
                .limit(1000);
        case 'profiles-completed':
            return supabase
                .from('users')
                .select('id,name,email,phone,firm_name,role,profile_completion,profile_completed_once,is_phone_verified,source,tokens,created_at')
                .or('profile_completed_once.eq.true,profile_completion.gte.80')
                .order('created_at', { ascending: false })
                .limit(1000);
        case 'active-proposals':
            return supabase
                .from('proposals')
                .select('id,user_id,normalised_text,intent,sectors,geographies,deal_size_min_cr,deal_size_max_cr,quality_score,quality_tier,status,fraud_flags,embedding_status,created_at')
                .eq('status', 'ACTIVE')
                .order('created_at', { ascending: false })
                .limit(1000);
        case 'matches':
            return supabase
                .from('proposal_matches')
                .select('id,proposal_id,matched_proposal_id,similarity_score,intent_score,industry_score,financial_score,niche_score,geography_boost,final_score,confidence_score,match_reason,match_archetype,status,created_at')
                .order('created_at', { ascending: false })
                .limit(1000);
        case 'pending-eois':
            return supabase
                .from('eois')
                .select('id,deal_id,match_id,sender_id,receiver_id,status,created_at,sender:users!sender_id(name,email,phone,firm_name,role),receiver:users!receiver_id(name,email,phone,firm_name,role),deal:proposals!deal_id(normalised_text,intent,sectors,geographies)')
                .eq('status', 'sent')
                .order('created_at', { ascending: false })
                .limit(1000);
        case 'stale-eois':
            return supabase
                .from('eois')
                .select('id,deal_id,match_id,sender_id,receiver_id,status,created_at,sender:users!sender_id(name,email,phone,firm_name,role),receiver:users!receiver_id(name,email,phone,firm_name,role),deal:proposals!deal_id(normalised_text,intent,sectors,geographies)')
                .eq('status', 'sent')
                .lt('created_at', threeDaysAgo)
                .order('created_at', { ascending: false })
                .limit(1000);
        case 'saved-searches':
            return supabase
                .from('saved_searches')
                .select(getSavedSearchSelect())
                .order('created_at', { ascending: false })
                .limit(1000);
        case 'embedding-pending':
            return supabase
                .from('proposals')
                .select('id,user_id,normalised_text,intent,sectors,geographies,deal_size_min_cr,deal_size_max_cr,quality_score,quality_tier,status,fraud_flags,embedding_status,created_at')
                .eq('embedding_status', 'PENDING')
                .order('created_at', { ascending: false })
                .limit(1000);
        case 'tokens-present':
            return supabase
                .from('users')
                .select('id,name,email,phone,firm_name,role,tokens,created_at')
                .order('tokens', { ascending: false })
                .limit(1000);
        case 'tokens-deducted':
            return supabase
                .from('token_transactions')
                .select('id,user_id,type,action,amount,balance_after,created_at,user:users!user_id(name,email,firm_name)')
                .or('type.eq.debit,amount.lt.0')
                .order('created_at', { ascending: false })
                .limit(1000);
    }
}


function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object') {
        const record = error as Record<string, unknown>;
        const parts = [record.message, record.details, record.hint, record.code]
            .filter(Boolean)
            .map(String);
        if (parts.length) return parts.join(' | ');
    }
    return 'Unknown error';
}

function sanitizeMasterSearch(value: string) {
    return value.trim().replace(/[,%]/g, ' ').replace(/\s+/g, ' ');
}

function sumTokenAmount(rows: Array<{ type?: string | null; amount?: number | null }>, type: string) {
    return rows
        .filter((row) => row.type === type)
        .reduce((total, row) => total + Number(row.amount || 0), 0);
}

function sumCurrentTokens(rows: Array<{ tokens?: number | null }>) {
    return rows.reduce((total, row) => total + Number(row.tokens || 0), 0);
}

function sumDeductedTokens(rows: Array<{ type?: string | null; amount?: number | null }>) {
    return rows.reduce((total, row) => {
        const amount = Number(row.amount || 0);
        if (row.type === 'debit') return total + Math.abs(amount);
        if (amount < 0) return total + Math.abs(amount);
        return total;
    }, 0);
}

async function getMasterSearchResults(supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>, rawQuery: string) {
    const query = sanitizeMasterSearch(rawQuery);
    if (query.length < 2) {
        return { query, results: [] };
    }

    const warnings: string[] = [];
    const userSelect = 'id,name,email,phone,firm_name,role,profile_completion,profile_completed_once,is_phone_verified,source,tokens,created_at,sectors,geographies,intent';
    const userRes = await supabase
        .from('users')
        .select(userSelect)
        .or(`name.ilike.%${query}%,email.ilike.%${query}%,firm_name.ilike.%${query}%,phone.ilike.%${query}%`)
        .order('created_at', { ascending: false })
        .limit(10);

    let users = userRes.data || [];
    if (userRes.error) {
        warnings.push(`combined user search: ${getErrorMessage(userRes.error)}`);
        const fallbackResponses = await Promise.all([
            supabase.from('users').select(userSelect).ilike('name', `%${query}%`).limit(10),
            supabase.from('users').select(userSelect).ilike('email', `%${query}%`).limit(10),
            supabase.from('users').select(userSelect).ilike('firm_name', `%${query}%`).limit(10),
            supabase.from('users').select(userSelect).ilike('phone', `%${query}%`).limit(10),
        ]);
        const fallbackErrors = fallbackResponses.map((response) => response.error).filter(Boolean);
        const userMap = new Map<string, typeof users[number]>();

        fallbackResponses.forEach((response) => {
            (response.data || []).forEach((user) => userMap.set(user.id, user));
        });
        users = Array.from(userMap.values()).slice(0, 10);

        if (!users.length && fallbackErrors.length === fallbackResponses.length) {
            throw new Error(`User search failed: ${fallbackErrors.map(getErrorMessage).join(' | ')}`);
        }
    }
    if (!users.length) {
        return { query, results: [] };
    }

    const userIds = users.map((user) => user.id);

    const [proposalsRes, sentEoisRes, receivedEoisRes, savedSearchesRes, tokenTransactionsRes, notificationsRes, documentsRes, chatSessionsRes] = await Promise.all([
        supabase
            .from('proposals')
            .select('id,user_id,normalised_text,intent,sectors,geographies,deal_size_min_cr,deal_size_max_cr,quality_score,quality_tier,status,fraud_flags,embedding_status,created_at')
            .in('user_id', userIds)
            .order('created_at', { ascending: false })
            .limit(500),
        supabase
            .from('eois')
            .select('id,deal_id,match_id,sender_id,receiver_id,status,created_at,receiver:users!receiver_id(name,email,phone,firm_name,role),deal:proposals!deal_id(normalised_text,intent,sectors,geographies)')
            .in('sender_id', userIds)
            .order('created_at', { ascending: false })
            .limit(500),
        supabase
            .from('eois')
            .select('id,deal_id,match_id,sender_id,receiver_id,status,created_at,sender:users!sender_id(name,email,phone,firm_name,role),deal:proposals!deal_id(normalised_text,intent,sectors,geographies)')
            .in('receiver_id', userIds)
            .order('created_at', { ascending: false })
            .limit(500),
        supabase
            .from('saved_searches')
            .select('search_id,user_id,proposal_id,query_object,status,expires_at,created_at,notified_at')
            .in('user_id', userIds)
            .order('created_at', { ascending: false })
            .limit(500),
        supabase
            .from('token_transactions')
            .select('id,user_id,type,action,amount,balance_after,created_at')
            .in('user_id', userIds)
            .order('created_at', { ascending: false })
            .limit(500),
        supabase
            .from('notifications')
            .select('id,user_id,type,message,is_read,created_at')
            .in('user_id', userIds)
            .order('created_at', { ascending: false })
            .limit(500),
        supabase
            .from('documents')
            .select('id,user_id,name,url,created_at')
            .in('user_id', userIds)
            .order('created_at', { ascending: false })
            .limit(500),
        supabase
            .from('chat_sessions')
            .select('id,user_id,document_id,title,state_version,created_at')
            .in('user_id', userIds)
            .order('created_at', { ascending: false })
            .limit(500),
    ]);

    const readRows = <T,>(label: string, response: { data: T[] | null; error: unknown }) => {
        if (response.error) {
            warnings.push(`${label}: ${getErrorMessage(response.error)}`);
            return [] as T[];
        }

        return response.data || [];
    };

    const proposals = readRows('proposals', proposalsRes);
    const proposalIds = proposals.map((proposal) => proposal.id);
    const matchesRes = proposalIds.length
        ? await supabase
            .from('proposal_matches')
            .select('id,proposal_id,matched_proposal_id,similarity_score,intent_score,industry_score,financial_score,niche_score,geography_boost,final_score,confidence_score,match_reason,match_archetype,status,created_at')
            .or(`proposal_id.in.(${proposalIds.join(',')}),matched_proposal_id.in.(${proposalIds.join(',')})`)
            .order('created_at', { ascending: false })
            .limit(500)
        : { data: [], error: null };

    if (matchesRes.error) warnings.push(`matches: ${getErrorMessage(matchesRes.error)}`);

    const sentEois = readRows('sent EOIs', sentEoisRes);
    const receivedEois = readRows('received EOIs', receivedEoisRes);
    const savedSearches = readRows('saved searches', savedSearchesRes);
    const tokenTransactions = readRows('token transactions', tokenTransactionsRes);
    const notifications = readRows('notifications', notificationsRes);
    const documents = readRows('documents', documentsRes);
    const chatSessions = readRows('chat sessions', chatSessionsRes);
    const matches = matchesRes.error ? [] : matchesRes.data || [];

    const results = users.map((user) => {
        const userProposals = proposals.filter((proposal) => proposal.user_id === user.id);
        const userProposalIds = new Set(userProposals.map((proposal) => proposal.id));
        const userMatches = matches.filter((match) => userProposalIds.has(match.proposal_id) || (!!match.matched_proposal_id && userProposalIds.has(match.matched_proposal_id)));
        const userSentEois = sentEois.filter((eoi) => eoi.sender_id === user.id);
        const userReceivedEois = receivedEois.filter((eoi) => eoi.receiver_id === user.id);
        const userSavedSearches = savedSearches.filter((savedSearch) => savedSearch.user_id === user.id);
        const userTokenTransactions = tokenTransactions.filter((transaction) => transaction.user_id === user.id);
        const userNotifications = notifications.filter((notification) => notification.user_id === user.id);
        const userDocuments = documents.filter((document) => document.user_id === user.id);
        const userChatSessions = chatSessions.filter((chatSession) => chatSession.user_id === user.id);

        return {
            user,
            summary: {
                proposalCount: userProposals.length,
                matchCount: userMatches.length,
                sentEoiCount: userSentEois.length,
                receivedEoiCount: userReceivedEois.length,
                pendingSentEoiCount: userSentEois.filter((eoi) => eoi.status === 'sent').length,
                approvedSentEoiCount: userSentEois.filter((eoi) => eoi.status === 'approved').length,
                savedSearchCount: userSavedSearches.length,
                documentCount: userDocuments.length,
                chatSessionCount: userChatSessions.length,
                notificationCount: userNotifications.length,
                unreadNotificationCount: userNotifications.filter((notification) => notification.is_read === 'false').length,
                tokenCredits: sumTokenAmount(userTokenTransactions, 'credit'),
                tokenDebits: sumTokenAmount(userTokenTransactions, 'debit'),
                tokenPurchaseAmount: sumTokenAmount(userTokenTransactions, 'purchase'),
            },
            proposals: userProposals,
            matches: userMatches,
            sentEois: userSentEois,
            receivedEois: userReceivedEois,
            savedSearches: userSavedSearches,
            tokenTransactions: userTokenTransactions,
            notifications: userNotifications,
            documents: userDocuments,
            chatSessions: userChatSessions,
        };
    });

    return { query, results, warnings };
}

export async function GET(req: NextRequest) {
    try {
        const { access, response } = await requireAdmin();
        if (response) return response;

        const supabase = createServerSupabaseClient();
        if (!supabase) throw new Error('Supabase client failed to initialize');

        const detail = req.nextUrl.searchParams.get('detail') as DetailType | null;
        const masterSearch = req.nextUrl.searchParams.get('masterSearch');
        const todayIso = startOfTodayIso();
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

        if (masterSearch) {
            const masterSearchResult = await getMasterSearchResults(supabase, masterSearch);

            return NextResponse.json({
                admin: { email: access.email },
                generatedAt: new Date().toISOString(),
                ...masterSearchResult,
            });
        }

        if (detail) {
            const allowedDetails: DetailType[] = ['users', 'profiles-completed', 'active-proposals', 'matches', 'pending-eois', 'stale-eois', 'saved-searches', 'embedding-pending', 'tokens-present', 'tokens-deducted'];
            if (!allowedDetails.includes(detail)) {
                return NextResponse.json({ error: 'Unknown admin detail type' }, { status: 400 });
            }

            const detailRes = await getDetailRows(supabase, detail, threeDaysAgo);
            if (detailRes.error) throw detailRes.error;

            return NextResponse.json({
                admin: { email: access.email },
                generatedAt: new Date().toISOString(),
                detail,
                rows: detailRes.data || [],
            });
        }

        const [
            totalUsersRes,
            newUsersRes,
            completedUsersRes,
            activeProposalsRes,
            newProposalsRes,
            totalMatchesRes,
            pendingEoisRes,
            approvedEoisRes,
            staleEoisRes,
            savedSearchesRes,
            embeddingPendingRes,
            tokenBalancesRes,
            tokenDeductionsRes,
            usersRes,
            proposalsRes,
            matchesRes,
            eoisRes,
            savedSearchRowsRes,
        ] = await Promise.all([
            supabase.from('users').select('id', { count: 'exact', head: true }),
            supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', todayIso),
            supabase.from('users').select('id', { count: 'exact', head: true }).or('profile_completed_once.eq.true,profile_completion.gte.80'),
            supabase.from('proposals').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
            supabase.from('proposals').select('id', { count: 'exact', head: true }).gte('created_at', todayIso),
            supabase.from('proposal_matches').select('id', { count: 'exact', head: true }),
            supabase.from('eois').select('id', { count: 'exact', head: true }).eq('status', 'sent'),
            supabase.from('eois').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
            supabase.from('eois').select('id', { count: 'exact', head: true }).eq('status', 'sent').lt('created_at', threeDaysAgo),
            supabase.from('saved_searches').select('search_id', { count: 'exact', head: true }),
            supabase.from('proposals').select('id', { count: 'exact', head: true }).eq('embedding_status', 'PENDING'),
            supabase
                .from('users')
                .select('id,tokens')
                .limit(10000),
            supabase
                .from('token_transactions')
                .select('id,type,amount')
                .or('type.eq.debit,amount.lt.0')
                .limit(10000),
            supabase
                .from('users')
                .select('id,name,email,phone,firm_name,role,profile_completion,profile_completed_once,is_phone_verified,source,tokens,created_at')
                .or('profile_completed_once.eq.false,profile_completed_once.is.null,profile_completion.lt.80')
                .order('created_at', { ascending: false })
                .limit(25),
            supabase
                .from('proposals')
                .select('id,user_id,normalised_text,intent,sectors,geographies,deal_size_min_cr,deal_size_max_cr,quality_score,quality_tier,status,fraud_flags,embedding_status,created_at,user:users(name,email,firm_name)')
                .eq('status', 'ACTIVE')
                .order('created_at', { ascending: false })
                .limit(100),
            supabase
                .from('proposal_matches')
                .select('id,proposal_id,final_score,confidence_score,status,created_at')
                .order('created_at', { ascending: false })
                .limit(500),
            supabase
                .from('eois')
                .select('id,deal_id,match_id,sender_id,receiver_id,status,created_at,sender:users!sender_id(name,email,phone,firm_name,role),receiver:users!receiver_id(name,email,phone,firm_name,role),deal:proposals!deal_id(normalised_text,intent,sectors,geographies)')
                .order('created_at', { ascending: false })
                .limit(100),
            supabase
                .from('saved_searches')
                .select(getSavedSearchSelect())
                .order('created_at', { ascending: false })
                .limit(25),
        ]);

        const errors = [
            totalUsersRes.error,
            newUsersRes.error,
            completedUsersRes.error,
            activeProposalsRes.error,
            newProposalsRes.error,
            totalMatchesRes.error,
            pendingEoisRes.error,
            approvedEoisRes.error,
            staleEoisRes.error,
            savedSearchesRes.error,
            embeddingPendingRes.error,
            tokenBalancesRes.error,
            tokenDeductionsRes.error,
            usersRes.error,
            proposalsRes.error,
            matchesRes.error,
            eoisRes.error,
            savedSearchRowsRes.error,
        ].filter(Boolean);

        if (errors.length) throw errors[0];

        const proposals = (proposalsRes.data || []) as unknown as AdminProposal[];
        const matches = (matchesRes.data || []) as AdminMatch[];
        const eois = (eoisRes.data || []) as unknown as AdminEoi[];
        const tokenBalances = tokenBalancesRes.data || [];
        const tokenDeductions = tokenDeductionsRes.data || [];
        const savedSearches = (savedSearchRowsRes.data || []) as unknown as SavedSearch[];
        const matchCounts = matches.reduce<Record<string, number>>((acc, match) => {
            acc[match.proposal_id] = (acc[match.proposal_id] || 0) + 1;
            return acc;
        }, {});

        const eoiCountsByDeal = eois.reduce<Record<string, number>>((acc, eoi) => {
            acc[eoi.deal_id] = (acc[eoi.deal_id] || 0) + 1;
            return acc;
        }, {});

        const savedSearchQueue = savedSearches.map((savedSearch) => ({
            ...savedSearch,
            title: summarizeSavedSearch(savedSearch),
            ageDays: daysOld(savedSearch.created_at),
            severity: 'high',
            actionHint: 'Saved search means the system found no current match; review demand and source matching supply.',
        }));

        const proposalHealth = proposals
            .filter((proposal) => proposal.embedding_status === 'PENDING' || (proposal.fraud_flags?.length || 0) > 0)
            .slice(0, 25)
            .map((proposal) => ({
                ...proposal,
                title: summarizeProposal(proposal),
                matchCount: matchCounts[proposal.id] || 0,
                eoiCount: eoiCountsByDeal[proposal.id] || 0,
                actionHint:
                    proposal.embedding_status === 'PENDING'
                        ? 'Check embedding or rematch process.'
                        : 'Manual review required before promoting this proposal.',
            }));

        const pendingEois = eois
            .filter((eoi) => eoi.status === 'sent')
            .map((eoi) => ({
                ...eoi,
                title: summarizeProposal(eoi.deal),
                ageDays: daysOld(eoi.created_at),
                severity: getAgeSeverity(eoi.created_at),
                actionHint: daysOld(eoi.created_at) >= 3 ? 'Nudge receiver or manually approve/decline after review.' : 'Monitor receiver response.',
            }));

        const staleEois = pendingEois.filter((eoi) => eoi.ageDays >= 3);

        const incompleteUsers = ((usersRes.data || []) as AdminUser[]).map((user) => ({
            ...user,
            actionHint: 'Prompt user to complete profile before expecting useful matches.',
        }));

        const actionQueue = [
            ...staleEois.map((eoi) => ({
                id: `eoi-${eoi.id}`,
                type: 'EOI pending > 3 days',
                severity: 'high',
                title: eoi.title,
                subtitle: `${eoi.sender?.name || 'Unknown sender'} → ${eoi.receiver?.name || 'Unknown receiver'}`,
                ageDays: eoi.ageDays,
                actionHint: eoi.actionHint,
                href: `/eoi-review/${eoi.id}`,
            })),
            ...savedSearchQueue.slice(0, 10).map((savedSearch) => ({
                id: `saved-search-${savedSearch.search_id}`,
                type: 'Saved search / no match',
                severity: 'high',
                title: savedSearch.title,
                subtitle: `${savedSearch.user?.name || savedSearch.user?.email || 'Unknown user'} • ${savedSearch.status}`,
                ageDays: savedSearch.ageDays,
                actionHint: savedSearch.actionHint,
                href: `/admin/details/saved-searches`,
            })),
            ...proposalHealth.slice(0, 10).map((proposal) => ({
                id: `proposal-${proposal.id}`,
                type: proposal.embedding_status === 'PENDING' ? 'Embedding pending' : 'Proposal needs review',
                severity: proposal.embedding_status === 'PENDING' ? 'medium' : 'high',
                title: proposal.title,
                subtitle: `${proposal.intent || 'Unknown intent'} • ${(proposal.sectors || []).join(', ') || 'No sector'}`,
                ageDays: daysOld(proposal.created_at),
                actionHint: proposal.actionHint,
                href: `/deal/${proposal.id}`,
            })),
            ...incompleteUsers.slice(0, 10).map((user) => ({
                id: `user-${user.id}`,
                type: 'Incomplete profile',
                severity: 'medium',
                title: user.name || user.email,
                subtitle: `${user.firm_name || 'No firm'} • ${user.profile_completion || 0}% complete`,
                ageDays: daysOld(user.created_at),
                actionHint: user.actionHint,
                href: `/profile`,
            })),
        ].sort((a, b) => {
            const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
            return severityOrder[a.severity] - severityOrder[b.severity] || b.ageDays - a.ageDays;
        }).slice(0, 30);

        return NextResponse.json({
            admin: { email: access.email },
            generatedAt: new Date().toISOString(),
            kpis: {
                totalUsers: totalUsersRes.count || 0,
                newUsersToday: newUsersRes.count || 0,
                completedProfiles: completedUsersRes.count || 0,
                activeProposals: activeProposalsRes.count || 0,
                newProposalsToday: newProposalsRes.count || 0,
                totalMatches: totalMatchesRes.count || 0,
                pendingEois: pendingEoisRes.count || 0,
                approvedEois: approvedEoisRes.count || 0,
                staleEois: staleEoisRes.count || 0,
                noMatchProposals: savedSearchesRes.count || 0,
                embeddingPending: embeddingPendingRes.count || 0,
                totalTokensPresent: sumCurrentTokens(tokenBalances),
                totalTokensDeducted: sumDeductedTokens(tokenDeductions),
            },
            actionQueue,
            pendingEois,
            savedSearches: savedSearchQueue,
            proposalHealth,
            incompleteUsers,
        });
    } catch (error: unknown) {
        const errorMsg = getErrorMessage(error);
        console.error('🔥 GET /api/admin/dashboard ERROR:', error);
        return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const { access, response } = await requireAdmin();
        if (response) return response;

        const body = await req.json();
        const { action, eoiId } = body as { action?: string; eoiId?: string };

        if (!eoiId || !['approve_eoi', 'decline_eoi', 'nudge_receiver'].includes(action || '')) {
            return NextResponse.json({ error: 'Invalid admin action' }, { status: 400 });
        }

        const supabase = createServerSupabaseClient();
        if (!supabase) throw new Error('Supabase client failed to initialize');

        const { data: existingEoi, error: fetchErr } = await supabase
            .from('eois')
            .select('id,sender_id,receiver_id,status')
            .eq('id', eoiId)
            .single();

        if (fetchErr || !existingEoi) {
            return NextResponse.json({ error: 'EOI not found' }, { status: 404 });
        }

        if (action === 'nudge_receiver') {
            if (!existingEoi.receiver_id) {
                return NextResponse.json({ error: 'EOI has no receiver to nudge' }, { status: 400 });
            }

            await supabase.from('notifications').insert([{
                user_id: existingEoi.receiver_id,
                type: 'ADMIN_EOI_REMINDER',
                message: 'Reminder: You have an Expression of Interest awaiting review.',
                is_read: 'false',
            }]);

            return NextResponse.json({ success: true, action, eoiId, actedBy: access.email });
        }

        const status = action === 'approve_eoi' ? 'approved' : 'declined';
        const { error: updateErr } = await supabase
            .from('eois')
            .update({ status })
            .eq('id', eoiId);

        if (updateErr) throw updateErr;

        await supabase.from('notifications').insert([{
            user_id: existingEoi.sender_id,
            type: `ADMIN_EOI_${status.toUpperCase()}`,
            message: `Your Expression of Interest was ${status} after admin review.`,
            is_read: 'false',
        }]);

        return NextResponse.json({ success: true, action, eoiId, status, actedBy: access.email });
    } catch (error: unknown) {
        const errorMsg = getErrorMessage(error);
        console.error('🔥 PATCH /api/admin/dashboard ERROR:', error);
        return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
    }
}




