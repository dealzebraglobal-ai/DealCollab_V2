'use client';
import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import DealCard from '@/components/DealCard';
import MatchCard from '@/components/MatchCard';
import { useNotifications } from '@/components/NotificationProvider';
import { DashboardSkeleton, ErrorState } from '@/components/Skeleton';
import ConnectionDetails from '@/components/ConnectionDetails';
import ExpiredLinkView from '@/components/ExpiredLinkView';
import {
  ArrowLeft,
  ShieldAlert,
  ShieldCheck,
  Clock,
  XCircle,
  Trash2,
  Lock,
  MessageCircle,
  Share2
} from 'lucide-react';

interface DashboardDeal {
  id: number;
  deal: string;
  dealDesc: string;
  match: string;
  matchDesc: string;
  status: "Send EOI" | "EOI Sent — Awaiting Approval" | "Approved" | "Declined" | "EOI Received";
  isIncoming?: boolean;
}

// Reuse mock data logic
const getMockDeal = async (id: number): Promise<DashboardDeal | null | 'expired'> => {
  await new Promise(resolve => setTimeout(resolve, 600));
  if (id === 404) return 'expired';

  const data: DashboardDeal[] = [
    {
      id: 101,
      deal: "Acquisition Strategy: Cloud Infra",
      dealDesc: "Enterprise client looking for private cloud infrastructure partners.",
      match: "Sarah Jenkins (Potential Partner)",
      matchDesc: "Managing Director at Ventura Capital with focus on Tech infrastructure.",
      status: "EOI Received",
      isIncoming: true
    },
    {
      id: 1,
      deal: "Startup Funding Round",
      dealDesc: "Series A funding looking for strategic investors in the fintech space.",
      match: "Ventura Capital A",
      matchDesc: "Leading early-stage fintech investor with a focus on disruptive payment solutions.",
      status: "Send EOI"
    },
    {
      id: 2,
      deal: "Infrastructure Merger",
      dealDesc: "Seeking expansion partner for major regional railway project.",
      match: "BuildCorp Infrastructure",
      matchDesc: "Established civil engineering firm specializing in large-scale transit networks.",
      status: "EOI Sent — Awaiting Approval"
    },
    {
      id: 3,
      deal: "SaaS Enterprise Expansion",
      dealDesc: "Enterprise software provider looking for European distribution channel.",
      match: "EuroCloud Distribution",
      matchDesc: "Top-tier IT distributor with extensive network across DACH and BENELUX regions.",
      status: "Approved"
    }
  ];
  return data.find(d => d.id === id) || null;
};

export default function EOIDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { addNotification } = useNotifications();

  const [deal, setDeal] = useState<DashboardDeal | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'link_expired'>('loading');
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  useEffect(() => {
    const fetchDeal = async () => {
      try {
        const data = await getMockDeal(parseInt(id));
        if (data === 'expired') {
          setStatus('link_expired');
        } else if (data) {
          setDeal(data);
          setStatus('ready');
        } else {
          setStatus('error');
        }
      } catch {
        setStatus('error');
      }
    };
    fetchDeal();
  }, [id]);

  const handleWithdraw = () => {
    setIsWithdrawing(true);
    setTimeout(() => {
      addNotification({
        type: 'success',
        message: 'EOI withdrawn successfully.',
        time: 'Just now'
      });
      setIsWithdrawing(false);
      // Simulate state update
      if (deal) setDeal({ ...deal, status: 'Send EOI' });
    }, 1500);
  };

  if (status === 'loading') return (
    <div className="flex-1 bg-white p-10">
      <DashboardSkeleton />
    </div>
  );

  if (status === 'link_expired') return (
    <div className="flex-1 bg-white p-10">
      <ExpiredLinkView />
    </div>
  );

  if (status === 'error' || !deal) return (
    <div className="flex-1 bg-white p-10 flex flex-col items-center justify-center">
      <ErrorState message="Could not find this deal interaction." />
      <Link href="/deal-dashboard" className="mt-4 text-sm font-bold text-[#F97316] flex items-center gap-2">
        <ArrowLeft size={16} /> Back to Dashboard
      </Link>
    </div>
  );

  const statusType = deal.status;

  return (
    <div className="flex-1 flex flex-col w-full h-full relative overflow-y-auto bg-white p-6 sm:p-10">
      {/* Header */}
      <div className="mb-10">
        <Link
          href="/deal-dashboard"
          className="group flex items-center gap-2 text-gray-400 hover:text-[#F97316] transition-all mb-6"
        >
          <div className="p-1.5 rounded-full bg-gray-50 group-hover:bg-[#F97316]/10 transition-colors">
            <ArrowLeft size={16} />
          </div>
          <span className="text-xs font-bold uppercase tracking-widest">Back to Dashboard</span>
        </Link>
        <h1 className="text-3xl font-black text-[#1F2937] tracking-tight">EOI Engagement Detail</h1>
        <p className="text-gray-500 text-sm font-medium mt-1">Tracking ID: DC-{deal.id}-EOI</p>
      </div>

      <div className="max-w-6xl w-full mx-auto space-y-10 pb-20">

        {/* SUMMARY SECTION: Your Deal vs Partner */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
          <div className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <div className="w-1.5 h-1.5 bg-gray-300 rounded-full" />
              <h2 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Your Proposal</h2>
            </div>
            <div className="h-full">
              <DealCard title={deal.deal} description={deal.dealDesc} />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <div className="w-1.5 h-1.5 bg-[#F97316] rounded-full" />
              <h2 className="text-[10px] font-black uppercase tracking-widest text-[#F97316]">Selected AI Match</h2>
            </div>
            <div className="h-full">
              <MatchCard entity={deal.match} description={deal.matchDesc} />
            </div>
          </div>
        </div>

        {/* STATUS SECTION */}
        <div className="bg-gray-50/50 border border-gray-100 rounded-[32px] p-8 flex flex-col md:flex-row items-center gap-8 shadow-sm">
          <div className="flex-1 space-y-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <StatusIcon status={statusType} />
                <h3 className="text-xl font-bold text-[#1F2937] capitalize">
                  {statusType === 'EOI Sent — Awaiting Approval' ? 'Awaiting Counter-party Review' : statusType}
                </h3>
              </div>
              <p className="text-sm text-gray-500 font-medium leading-relaxed max-w-lg">
                {getStatusMessage(statusType)}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="px-3 py-1 bg-white border border-gray-100 rounded-full text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Interaction Started: 12h ago
              </div>
              <div className="px-3 py-1 bg-white border border-gray-100 rounded-full text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Last Update: 2m ago
              </div>
            </div>
          </div>

          <div className="flex shrink-0 gap-3">
            {statusType === 'EOI Sent — Awaiting Approval' && (
              <button
                onClick={handleWithdraw}
                disabled={isWithdrawing}
                className="flex items-center gap-2 bg-white text-red-500 px-6 py-3 rounded-2xl font-bold text-sm border border-red-100 hover:bg-red-50 transition-all shadow-sm disabled:opacity-50"
              >
                {isWithdrawing ? (
                  <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Trash2 size={18} />
                )}
                Withdraw EOI
              </button>
            )}

            {statusType === 'Approved' && (
              <div className="flex gap-3">
                <button className="flex items-center gap-2 bg-[#F97316] text-white px-8 py-3 rounded-2xl font-bold text-sm hover:bg-[#EA580C] transition-all shadow-lg shadow-[#F97316]/20">
                  <MessageCircle size={18} />
                  Open Chat
                </button>
                <button className="flex items-center gap-2 bg-white text-[#1F2937] px-6 py-3 rounded-2xl font-bold text-sm border border-gray-100 hover:bg-gray-50 transition-all shadow-sm">
                  <Share2 size={18} />
                </button>
              </div>
            )}

            {statusType === 'Declined' && (
              <div className="text-xs font-bold text-gray-400 bg-gray-100 px-6 py-3 rounded-2xl border border-gray-200 uppercase tracking-widest">
                Engagement Closed
              </div>
            )}
          </div>
        </div>

        {/* IDENTITY SECTION: Privacy Guard */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 px-1">
            <ShieldAlert size={16} className={statusType === 'Approved' ? 'text-green-500' : 'text-[#F97316]'} />
            <h2 className="text-xs font-black uppercase tracking-widest text-[#1F2937]">Identity Disclosure</h2>
          </div>

          {statusType === 'Approved' ? (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
              <ConnectionDetails item={deal} />
            </div>
          ) : (
            <div className="bg-gray-50 rounded-[40px] p-12 flex flex-col items-center text-center space-y-6 border-2 border-dashed border-gray-200">
              <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-sm border border-gray-100 relative">
                <Lock size={32} className="text-gray-300" />
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-[#F97316] rounded-full flex items-center justify-center ring-4 ring-gray-50">
                  <ShieldCheck size={12} className="text-white" />
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-[#1F2937]">Identity Protected by Intelligence Layer</h3>
                <p className="text-sm text-gray-500 max-w-sm mx-auto leading-relaxed">
                  Full name, firm location, and direct contact details will be revealed once the counter-party approves your Expression of Interest.
                </p>
              </div>
              <div className="flex items-center gap-4 pt-2">
                <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  <ShieldCheck size={14} className="text-green-500" /> AI Verified
                </div>
                <div className="w-1 h-1 bg-gray-300 rounded-full" />
                <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  <Lock size={14} className="text-gray-400" /> Privacy First
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'Approved':
      return <ShieldCheck className="text-green-500" size={24} />;
    case 'Declined':
      return <XCircle className="text-red-500" size={24} />;
    case 'EOI Sent — Awaiting Approval':
      return <Clock className="text-[#F97316] animate-pulse" size={24} />;
    default:
      return <Clock className="text-gray-400" size={24} />;
  }
}

function getStatusMessage(status: string) {
  switch (status) {
    case 'Approved':
      return "The counter-party has reviewed your proposal and approved the engagement. You now have full access to their contact details and deal intel.";
    case 'Declined':
      return "This engagement has been declined by the counter-party. No further tokens will be spent on this interaction.";
    case 'EOI Sent — Awaiting Approval':
      return "Your Expression of Interest has been delivered to the counter-party's dashboard. We are currently awaiting their response.";
    case 'EOI Received':
      return "A counter-party has sent you an EOI for this deal. You can review their anonymized profile before approving.";
    default:
      return "Tracking the progress of this deal engagement through our Intelligence Layer.";
  }
}
