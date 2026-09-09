'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  DollarSign,
  Briefcase,
  TrendingUp,
  Zap,
  Sparkles,
  MessageSquare,
  ShieldCheck,
  CheckCircle2,
  Flame,
  PieChart,
  BarChart3,
  Globe,
  Layers,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import type { SectorLucrativeness, GeographyCorridor, BuyerPersonaSpec } from '@/app/api/intelligence/buyer-intent/route';

export default function BuyerIntentIntelligencePage() {
  const router = useRouter();

  // State
  const [data, setData] = useState<{
    macroTelemetry: {
      bciIndex: number;
      totalDryPowderCr: number;
      activeMandatesCount: number;
      topLucrativeSector: string;
      topLucrativenessScore: number;
      medianBuyoutMultiple: string;
      crossBorderSurgeYoY: string;
      peDominancePct: number;
    };
    sectors: SectorLucrativeness[];
    geographyCorridors: GeographyCorridor[];
    buyerPersonas: BuyerPersonaSpec[];
  } | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [selectedSectorTab, setSelectedSectorTab] = useState<string>('Pharma & Healthcare');
  const [selectedCorridorTab, setSelectedCorridorTab] = useState<string>('corridor-gujarat-telangana');
  const [showMathFormulas, setShowMathFormulas] = useState<boolean>(false);

  // Fetch telemetry
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const res = await fetch('/api/intelligence/buyer-intent');
        const json = await res.json();
        if (json.success && json.data) {
          setData(json.data);
          if (json.data.sectors && json.data.sectors.length > 0) {
            setSelectedSectorTab(json.data.sectors[0].name);
          }
        }
      } catch (err) {
        console.error('Failed to load buyer intent data', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Selected Sector details
  const activeSectorData = useMemo(() => {
    if (!data?.sectors) return null;
    return data.sectors.find((s) => s.name === selectedSectorTab) || data.sectors[0];
  }, [data?.sectors, selectedSectorTab]);

  // Selected Corridor details
  const activeCorridorData = useMemo(() => {
    if (!data?.geographyCorridors) return null;
    return data.geographyCorridors.find((c) => c.id === selectedCorridorTab) || data.geographyCorridors[0];
  }, [data?.geographyCorridors, selectedCorridorTab]);

  const handleSectorChat = (sectorName: string, thesis: string) => {
    const prompt = `Analyze buy-side acquisition appetite and active buyer mandates in the "${sectorName}" sector. Current thesis: ${thesis}`;
    sessionStorage.setItem('dealcollab_initial_chat_prompt', prompt);
    router.push('/home');
  };

  const handleCorridorChat = (corridorName: string, summary: string) => {
    const prompt = `Provide an M&A advisor breakdown for deal flow and buyer intent in the "${corridorName}". Region overview: ${summary}`;
    sessionStorage.setItem('dealcollab_initial_chat_prompt', prompt);
    router.push('/home');
  };

  if (loading && !data) {
    return (
      <div className="flex-1 w-full min-h-screen bg-[#FDFDFD] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#FF6A00] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold text-[#0F2747]">Synthesizing Buyer Intent Intelligence...</p>
        </div>
      </div>
    );
  }

  const macro = data?.macroTelemetry || {
    bciIndex: 92.4,
    totalDryPowderCr: 18450,
    activeMandatesCount: 7,
    topLucrativeSector: 'Pharma & Healthcare',
    topLucrativenessScore: 9.42,
    medianBuyoutMultiple: '12.0x – 14.5x EV/EBITDA',
    crossBorderSurgeYoY: '+34.2%',
    peDominancePct: 42.0
  };

  const sectors = data?.sectors || [];
  const corridors = data?.geographyCorridors || [];
  const personas = data?.buyerPersonas || [];

  return (
    <div className="relative flex-1 w-full min-h-screen bg-[#FDFDFD] text-[#0F2747] overflow-y-auto pb-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8 space-y-8">

        {/* TOP BREADCRUMB & REAL-TIME PULSE */}
        <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-4">
          <Link
            href="/deal-intelligence"
            className="inline-flex items-center gap-2 text-xs font-semibold text-[#0F2747] hover:text-[#FF6A00] transition-colors"
          >
            <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-[#0F2747]">
              <ArrowLeft size={14} />
            </div>
            Back to Deal Intelligence Overview
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-[#F9FAFB] border border-[#E5E7EB] rounded-full text-[11px] font-medium text-[#747775]">
              <ShieldCheck size={13} className="text-[#16A34A]" />
              Institutional M&A Grade Telemetry
            </div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-[#0F2747]">
              <span className="w-2 h-2 rounded-full bg-[#16A34A] animate-pulse" />
              <span>₹{(macro.totalDryPowderCr).toLocaleString()} Cr Dry Powder Tracked</span>
            </div>
          </div>
        </div>

        {/* HERO TITLE & SCOPE */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#FFF7ED] border border-[#FFEDD5] rounded-full text-[10px] font-bold text-[#EA580C] uppercase tracking-wider">
              <Sparkles size={12} className="text-[#FF6A00]" />
              Econometric Buy-Side Analysis
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#0F2747] tracking-tight">
              Buyer Intent Intelligence
            </h1>
            <p className="text-xs sm:text-sm text-[#747775] max-w-2xl leading-relaxed font-normal">
              Quantitative analysis of capital allocators, high-conviction sector lucrativeness, typical buyout proposal ticket spreads, and cross-border capital corridors.
            </p>
          </div>

          <button
            onClick={() => setShowMathFormulas(!showMathFormulas)}
            className="self-start md:self-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[#E5E7EB] bg-white hover:border-[#0F2747] text-xs font-semibold text-[#0F2747] transition-all shadow-xs"
          >
            <Layers size={13} className="text-[#FF6A00]" />
            <span>{showMathFormulas ? 'Hide Mathematical Models' : 'Mathematical Formulation'}</span>
            {showMathFormulas ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {/* COLLAPSIBLE MATHEMATICAL FORMULATION DRAWER */}
        {showMathFormulas && (
          <div className="bg-[#F9FAFB] rounded-2xl border border-[#E5E7EB] p-5 space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-[#0F2747] text-white flex items-center justify-center text-xs font-bold font-mono">
                  Σ
                </div>
                <h3 className="text-sm font-bold text-[#0F2747]">
                  Econometric Formulations & Quantitative Valuation Models
                </h3>
              </div>
              <span className="text-[10px] font-mono text-[#747775] bg-white px-2 py-0.5 rounded border border-[#E5E7EB]">
                v2.4 Statistical Rigour
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              {/* Formula 1 */}
              <div className="bg-white p-4 rounded-xl border border-[#E5E7EB] space-y-2">
                <div className="text-[10px] font-bold text-[#EA580C] uppercase tracking-wider">
                  Buyer Conviction Index (BCI)
                </div>
                <div className="font-mono bg-[#FFF7ED]/50 p-2.5 rounded-lg border border-[#FFEDD5] text-[#0F2747] text-[11px] leading-relaxed">
                  {"BCI_s = [∑(w_i · T_i · Q_i) / (T̄ · N_s)] × (1 + ΔInflow₃₀d / Base)"}
                </div>
                <p className="text-[11px] text-[#747775] leading-relaxed font-normal">
                  Measures verified buyer balance-sheet readiness, mandate quality tier (Q_i), and committed ticket velocity.
                </p>
              </div>

              {/* Formula 2 */}
              <div className="bg-white p-4 rounded-xl border border-[#E5E7EB] space-y-2">
                <div className="text-[10px] font-bold text-[#EA580C] uppercase tracking-wider">
                  Sector Lucrativeness (L_s)
                </div>
                <div className="font-mono bg-[#FFF7ED]/50 p-2.5 rounded-lg border border-[#FFEDD5] text-[#0F2747] text-[11px] leading-relaxed">
                  {"L_s = ln(DryPowder_s / Targets_s) · (EV/EBITDA_s / Baseline) · (1 - γ_reg)"}
                </div>
                <p className="text-[11px] text-[#747775] leading-relaxed font-normal">
                  Combines the capital-to-asset supply gap with valuation tolerance and regulatory clearance scarcity (γ_reg).
                </p>
              </div>

              {/* Formula 3 */}
              <div className="bg-white p-4 rounded-xl border border-[#E5E7EB] space-y-2">
                <div className="text-[10px] font-bold text-[#EA580C] uppercase tracking-wider">
                  Multiple Spread Dispersion (σ_EV)
                </div>
                <div className="font-mono bg-[#FFF7ED]/50 p-2.5 rounded-lg border border-[#FFEDD5] text-[#0F2747] text-[11px] leading-relaxed">
                  {"σ_EV = √[(1/N) · ∑(M_i - M̄)²]   |   IQR = P₇₅ - P₂₅"}
                </div>
                <p className="text-[11px] text-[#747775] leading-relaxed font-normal">
                  Evaluates pricing consensus between strategic synergistic acquirers and financial PE platform sponsors.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 4 MACRO METRIC CARDS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* CARD 1: BCI */}
          <div className="bg-white p-5 rounded-2xl border border-[#E5E7EB] shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#747775] uppercase tracking-wider">
                Buyer Conviction Index
              </span>
              <span className="text-[10px] font-bold text-[#16A34A] bg-[#DCFCE7] px-2 py-0.5 rounded-full flex items-center gap-1">
                <Zap size={10} />
                High
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-[#0F2747]">
                {macro.bciIndex}
              </span>
              <span className="text-xs text-[#747775] font-semibold">/ 100 (BCI)</span>
            </div>
            <p className="text-[11px] text-[#747775] leading-normal font-normal">
              High institutional dry powder certainty & LOI readiness across sectors.
            </p>
          </div>

          {/* CARD 2: DRY POWDER */}
          <div className="bg-white p-5 rounded-2xl border border-[#E5E7EB] shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#747775] uppercase tracking-wider">
                Deployable Dry Powder
              </span>
              <span className="text-[10px] font-bold text-[#FF6A00] bg-[#FFF7ED] border border-[#FFEDD5] px-2 py-0.5 rounded-full">
                Active Pool
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-[#0F2747]">
                ₹{(macro.totalDryPowderCr).toLocaleString()}
              </span>
              <span className="text-xs text-[#747775] font-semibold">Cr</span>
            </div>
            <p className="text-[11px] text-[#747775] leading-normal font-normal">
              Cumulative balance-sheet allocation across active acquisition theses.
            </p>
          </div>

          {/* CARD 3: TOP LUCRATIVE SECTOR */}
          <div className="bg-white p-5 rounded-2xl border border-[#E5E7EB] shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#747775] uppercase tracking-wider">
                Most Lucrative Sector
              </span>
              <span className="text-[10px] font-bold text-[#EA580C] bg-[#FFF7ED] border border-[#FFEDD5] px-2 py-0.5 rounded-full flex items-center gap-1">
                <Flame size={10} />
                Score {macro.topLucrativenessScore}
              </span>
            </div>
            <div className="text-base sm:text-lg font-bold text-[#0F2747] truncate">
              {macro.topLucrativeSector}
            </div>
            <p className="text-[11px] text-[#747775] leading-normal font-normal">
              {macro.medianBuyoutMultiple} typical platform buyout range.
            </p>
          </div>

          {/* CARD 4: CROSS BORDER INFLOW */}
          <div className="bg-white p-5 rounded-2xl border border-[#E5E7EB] shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#747775] uppercase tracking-wider">
                Cross-Border Surge
              </span>
              <span className="text-[10px] font-bold text-[#16A34A] bg-[#DCFCE7] px-2 py-0.5 rounded-full">
                {macro.crossBorderSurgeYoY} YoY
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-[#0F2747]">
                {macro.peDominancePct}%
              </span>
              <span className="text-xs text-[#747775] font-semibold">PE / Sponsor Led</span>
            </div>
            <p className="text-[11px] text-[#747775] leading-normal font-normal">
              Inbound US, European & Japanese strategic acquirers accelerating.
            </p>
          </div>
        </div>

        {/* SECTION 1: HOT SECTORS & LUCRATIVENESS ENGINE */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[#FF6A00] uppercase tracking-wider">
                <Flame size={12} />
                Market Lucrativeness Engine
              </div>
              <h2 className="text-lg font-bold text-[#0F2747]">
                Hot Investment Sectors & Buyout Multiple Matrix
              </h2>
            </div>
            <span className="text-xs text-[#747775]">
              Select a sector to examine typical buyout ticket spreads and M&A thesis
            </span>
          </div>

          {/* SECTOR TABS */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {sectors.map((sec) => {
              const isSelected = selectedSectorTab === sec.name;
              return (
                <button
                  key={sec.id}
                  onClick={() => setSelectedSectorTab(sec.name)}
                  className={`shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs transition-all ${
                    isSelected
                      ? 'bg-[#0F2747] text-white font-semibold shadow-xs'
                      : 'bg-white text-[#0F2747] border border-[#E5E7EB] hover:border-[#0F2747]/60'
                  }`}
                >
                  <span>{sec.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold font-mono ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : 'bg-[#FFF7ED] text-[#EA580C] border border-[#FFEDD5]'
                    }`}
                  >
                    Score {sec.lucrativenessScore}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ACTIVE SECTOR DETAIL CARD */}
          {activeSectorData && (
            <div className="bg-white rounded-2xl border border-[#E5E7EB] p-6 shadow-xs space-y-6">
              {/* HEADER ROW */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E5E7EB] pb-5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-[#0F2747]">
                      {activeSectorData.name}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        activeSectorData.heatStatus === 'EXTREME_SURGE'
                          ? 'bg-[#FEE2E2] text-[#DC2626]'
                          : activeSectorData.heatStatus === 'HIGH_DEMAND'
                          ? 'bg-[#FFF7ED] text-[#EA580C] border border-[#FFEDD5]'
                          : 'bg-[#DCFCE7] text-[#16A34A]'
                      }`}
                    >
                      {activeSectorData.heatStatus.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-[#747775]">
                    Institutional Capital Concentration & Buy-Side Acquisition Conviction
                  </p>
                </div>

                <div className="flex items-center gap-4 bg-[#F9FAFB] p-3 rounded-xl border border-[#E5E7EB]">
                  <div>
                    <span className="text-[10px] text-[#747775] block uppercase font-bold">
                      Lucrativeness Score (L_s)
                    </span>
                    <span className="text-xl font-bold text-[#FF6A00]">
                      {activeSectorData.lucrativenessScore} <span className="text-xs text-[#747775]">/ 10</span>
                    </span>
                  </div>
                  <div className="h-8 w-px bg-[#E5E7EB]" />
                  <div>
                    <span className="text-[10px] text-[#747775] block uppercase font-bold">
                      Capital-to-Asset Imbalance
                    </span>
                    <span className="text-xl font-bold text-[#0F2747]">
                      {activeSectorData.demandSupplyRatio}x <span className="text-xs text-[#16A34A] font-semibold">Oversubscribed</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* 3-COLUMN METRIC TILES */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* COLUMN 1: TYPICAL BUYOUT TICKET SPREAD */}
                <div className="space-y-3 bg-[#F9FAFB] p-4 rounded-xl border border-[#E5E7EB]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[#0F2747] uppercase tracking-wider flex items-center gap-1">
                      <DollarSign size={12} className="text-[#FF6A00]" />
                      Typical Buyout Proposal Ticket
                    </span>
                    <span className="text-[10px] font-mono text-[#747775]">
                      Median ₹{activeSectorData.medianTicketCr}Cr
                    </span>
                  </div>

                  {/* VISUAL TICKET SPREAD BAR */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-[#0F2747]">
                      <span>P₂₅: ₹{activeSectorData.ticketSpread.p25Cr}Cr</span>
                      <span className="text-[#FF6A00] font-bold">Median: ₹{activeSectorData.ticketSpread.medianCr}Cr</span>
                      <span>P₇₅: ₹{activeSectorData.ticketSpread.p75Cr}Cr</span>
                    </div>

                    <div className="relative w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="absolute h-full bg-gradient-to-r from-[#0F2747] via-[#FF6A00] to-[#EA580C] rounded-full"
                        style={{
                          left: `${(activeSectorData.ticketSpread.p25Cr / activeSectorData.ticketSpread.maxCr) * 100}%`,
                          width: `${((activeSectorData.ticketSpread.p75Cr - activeSectorData.ticketSpread.p25Cr) / activeSectorData.ticketSpread.maxCr) * 100}%`
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-[#747775]">
                      <span>Min Cap: ₹{activeSectorData.ticketSpread.p25Cr * 0.75 | 0}Cr</span>
                      <span>Max Institutional Cap: ₹{activeSectorData.ticketSpread.maxCr}Cr+</span>
                    </div>
                  </div>
                </div>

                {/* COLUMN 2: VALUATION BENCHMARK & MULTIPLE TYPE */}
                <div className="space-y-3 bg-[#F9FAFB] p-4 rounded-xl border border-[#E5E7EB]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[#0F2747] uppercase tracking-wider flex items-center gap-1">
                      <BarChart3 size={12} className="text-[#FF6A00]" />
                      Valuation Multiple Benchmark
                    </span>
                    <span className="text-[10px] font-bold text-[#16A34A] bg-[#DCFCE7] px-1.5 py-0.2 rounded">
                      {activeSectorData.valuationMultipleType}
                    </span>
                  </div>

                  <div className="space-y-1 pt-1">
                    <div className="text-xl font-bold text-[#0F2747]">
                      {activeSectorData.valuationBenchmark}
                    </div>
                    <p className="text-[11px] text-[#747775] leading-relaxed">
                      Clean EBITDA margin / revenue multiple tolerance observed across active buy-side interest.
                    </p>
                  </div>
                </div>

                {/* COLUMN 3: BUYER TYPE COMPOSITION */}
                <div className="space-y-3 bg-[#F9FAFB] p-4 rounded-xl border border-[#E5E7EB]">
                  <span className="text-[10px] font-bold text-[#0F2747] uppercase tracking-wider flex items-center gap-1">
                    <PieChart size={12} className="text-[#FF6A00]" />
                    Capital Allocation Persona Split
                  </span>

                  {/* HORIZONTAL COMPOSITION BAR */}
                  <div className="space-y-2 pt-1">
                    <div className="flex h-3 rounded-full overflow-hidden w-full">
                      <div
                        style={{ width: `${activeSectorData.strategicVsPeSplit.peBuyout}%` }}
                        className="bg-[#0F2747]"
                        title={`PE Buyout: ${activeSectorData.strategicVsPeSplit.peBuyout}%`}
                      />
                      <div
                        style={{ width: `${activeSectorData.strategicVsPeSplit.strategic}%` }}
                        className="bg-[#FF6A00]"
                        title={`Strategic: ${activeSectorData.strategicVsPeSplit.strategic}%`}
                      />
                      <div
                        style={{ width: `${activeSectorData.strategicVsPeSplit.globalMnc}%` }}
                        className="bg-[#3B82F6]"
                        title={`Global MNC: ${activeSectorData.strategicVsPeSplit.globalMnc}%`}
                      />
                      <div
                        style={{ width: `${activeSectorData.strategicVsPeSplit.familyOffice}%` }}
                        className="bg-[#10B981]"
                        title={`Family Office: ${activeSectorData.strategicVsPeSplit.familyOffice}%`}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-1 text-[10px] text-[#0F2747]">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#0F2747]" />
                        <span>PE: <strong>{activeSectorData.strategicVsPeSplit.peBuyout}%</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#FF6A00]" />
                        <span>Strategic: <strong>{activeSectorData.strategicVsPeSplit.strategic}%</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#3B82F6]" />
                        <span>Global MNC: <strong>{activeSectorData.strategicVsPeSplit.globalMnc}%</strong></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                        <span>Family Office: <strong>{activeSectorData.strategicVsPeSplit.familyOffice}%</strong></span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ADVISOR THESIS & KEY CATALYSTS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                <div className="space-y-2 bg-[#FFF7ED]/40 p-4 rounded-xl border border-[#FFEDD5]">
                  <h4 className="text-[11px] font-bold text-[#EA580C] uppercase tracking-wider flex items-center gap-1.5">
                    <Briefcase size={13} />
                    M&A Advisor Strategic Thesis
                  </h4>
                  <p className="text-xs text-[#0F2747] leading-relaxed font-normal">
                    {activeSectorData.advisorThesis}
                  </p>
                </div>

                <div className="space-y-2 bg-[#F9FAFB] p-4 rounded-xl border border-[#E5E7EB]">
                  <h4 className="text-[11px] font-bold text-[#0F2747] uppercase tracking-wider flex items-center gap-1.5">
                    <TrendingUp size={13} className="text-[#16A34A]" />
                    Underlying Deal Catalysts & Structural Tailwinds
                  </h4>
                  <div className="space-y-1.5">
                    {activeSectorData.catalysts.map((cat, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-[#0F2747]">
                        <CheckCircle2 size={13} className="text-[#16A34A] shrink-0 mt-0.5" />
                        <span>{cat}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ACTION FOOTER */}
              <div className="flex items-center justify-between pt-2 border-t border-[#E5E7EB]">
                <span className="text-xs text-[#747775]">
                  Want to explore active market matching for {activeSectorData.name}?
                </span>
                <button
                  onClick={() => handleSectorChat(activeSectorData.name, activeSectorData.advisorThesis)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0F2747] hover:bg-[#FF6A00] text-white rounded-xl text-xs font-bold transition-all shadow-xs"
                >
                  <MessageSquare size={13} />
                  <span>Analyze {activeSectorData.name} in AI Chat</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* SECTION 2: GEOGRAPHY & CROSS-BORDER CORRIDORS */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[#FF6A00] uppercase tracking-wider">
                <Globe size={12} />
                Geographic Capital Allocation
              </div>
              <h2 className="text-lg font-bold text-[#0F2747]">
                M&A Transaction Corridors & Ticket Ranges
              </h2>
            </div>
            <span className="text-xs text-[#747775]">
              Regional valuation spread and deal closing velocity
            </span>
          </div>

          {/* CORRIDOR GRID */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {corridors.map((c) => {
              const isSelected = selectedCorridorTab === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedCorridorTab(c.id)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                    isSelected
                      ? 'bg-white border-[#0F2747] shadow-sm ring-1 ring-[#0F2747]'
                      : 'bg-white border-[#E5E7EB] hover:border-gray-400'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-[#FF6A00] bg-[#FFF7ED] px-2 py-0.5 rounded-full border border-[#FFEDD5]">
                        {c.avgLoiVelocityDays} Days LOI
                      </span>
                      <span className="text-[10px] font-mono text-[#747775]">
                        {c.inboundCapitalPct}% Inbound
                      </span>
                    </div>
                    <h3 className="text-xs font-bold text-[#0F2747] leading-tight">
                      {c.corridor}
                    </h3>
                    <p className="text-[11px] text-[#747775] line-clamp-2">
                      {c.hub}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-[#E5E7EB] space-y-1 text-xs">
                    <div className="text-[10px] text-[#747775]">Typical Ticket Range</div>
                    <div className="font-bold text-[#0F2747]">{c.ticketRange}</div>
                    <div className="text-[10px] text-[#16A34A] font-semibold truncate">
                      {c.ebitdaMultipleSpread}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* SELECTED CORRIDOR SUMMARY BANNER */}
          {activeCorridorData && (
            <div className="bg-[#F9FAFB] p-5 rounded-2xl border border-[#E5E7EB] flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#0F2747] uppercase tracking-wide">
                    Corridor Focus: {activeCorridorData.corridor}
                  </span>
                  <span className="text-[10px] font-bold text-[#16A34A] bg-[#DCFCE7] px-2 py-0.5 rounded-full">
                    {activeCorridorData.avgLoiVelocityDays} Days Avg Velocity
                  </span>
                </div>
                <p className="text-[#747775] leading-relaxed max-w-2xl font-normal">
                  {activeCorridorData.summary}
                </p>
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[10px] text-[#747775] font-semibold">Primary Focus:</span>
                  {activeCorridorData.primarySectors.map((sec, i) => (
                    <span key={i} className="px-2 py-0.5 bg-white border border-[#E5E7EB] rounded-md text-[10px] font-semibold text-[#0F2747]">
                      {sec}
                    </span>
                  ))}
                </div>
              </div>

              <button
                onClick={() => handleCorridorChat(activeCorridorData.corridor, activeCorridorData.summary)}
                className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-[#0F2747] hover:bg-[#0F2747] hover:text-white text-[#0F2747] rounded-xl text-xs font-bold transition-all shadow-xs"
              >
                <MessageSquare size={13} />
                <span>Explore Corridor Deals in AI</span>
              </button>
            </div>
          )}
        </div>

        {/* SECTION 3: BUYER PERSONA & CAPITAL INTENT MATRIX */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[#FF6A00] uppercase tracking-wider">
                <Briefcase size={12} />
                Investor Archetypes
              </div>
              <h2 className="text-lg font-bold text-[#0F2747]">
                Buyer Persona Segmentation & Return Thresholds
              </h2>
            </div>
            <span className="text-xs text-[#747775]">
              Mandate horizon, required IRR hurdles, and preferred buyout structures
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {personas.map((p, idx) => (
              <div key={idx} className="bg-white p-5 rounded-2xl border border-[#E5E7EB] shadow-xs space-y-4 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[#0F2747] bg-[#F9FAFB] border border-[#E5E7EB] px-2 py-0.5 rounded-full">
                      {p.allocationShare}% Dry Powder Share
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-[#0F2747]">
                    {p.persona}
                  </h3>
                  <p className="text-xs text-[#747775] leading-relaxed font-normal">
                    {p.primaryThesis}
                  </p>
                </div>

                <div className="space-y-2 pt-3 border-t border-[#E5E7EB] text-xs">
                  <div>
                    <span className="text-[10px] text-[#747775] block uppercase font-bold">Typical Ticket</span>
                    <span className="font-bold text-[#0F2747]">{p.typicalTicket}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#747775] block uppercase font-bold">Return Hurdle</span>
                    <span className="font-semibold text-[#16A34A]">{p.returnThreshold}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#747775] block uppercase font-bold">Decision Velocity</span>
                    <span className="font-medium text-[#0F2747]">{p.decisionHorizon}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#747775] block uppercase font-bold">Deal Structure</span>
                    <span className="text-[#747775]">{p.preferredStructure}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
