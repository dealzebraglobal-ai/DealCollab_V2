'use client';
import React from 'react';
import { BarChart3, TrendingUp, PieChart, Activity, ArrowUpRight, ArrowDownRight } from 'lucide-react';

import FeatureLockedOverlay from '@/components/FeatureLockedOverlay';

export default function AnalyticsPage() {
  const isLocked = false; // Feature lock enabled

  const stats = [
    { label: 'Total Deal Volume', value: '$1.2B', change: '+12.5%', trending: 'up' },
    { label: 'Network Multiplier', value: '8.4x', change: '+4.2%', trending: 'up' },
    { label: 'Active Mandates', value: '124', change: '-2.1%', trending: 'down' },
    { label: 'Success Rate', value: '92%', change: '+0.5%', trending: 'up' },
  ];

  return (
    <div className="relative flex-1">
      <div className={`p-8 space-y-8 max-w-7xl mx-auto transition-all duration-700 ${isLocked ? 'blur-sm pointer-events-none' : ''}`}>
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Market Analytics</h1>
            <p className="text-gray-500 mt-2 font-medium">Real-time M&A intelligence and network performance</p>
          </div>
          <div className="flex gap-3">
            <button className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm">
              Export PDF
            </button>
            <button className="px-4 py-2 bg-[#F97316] text-white rounded-xl text-sm font-semibold hover:bg-[#EA580C] transition-colors shadow-lg shadow-orange-500/20">
              Generate Report
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, i) => (
            <div key={i} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">{stat.label}</p>
              <div className="flex items-end gap-3 mt-4">
                <h3 className="text-3xl font-bold text-gray-900">{stat.value}</h3>
                <div className={`flex items-center gap-1 mb-1 text-sm font-bold ${
                  stat.trending === 'up' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {stat.trending === 'up' ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                  {stat.change}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Charts Placeholder */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm h-[400px] flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-lg font-bold text-gray-900">Volume Forecast</h3>
              <TrendingUp size={20} className="text-gray-400" />
            </div>
            <div className="flex-1 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center">
              <div className="text-center space-y-3">
                <BarChart3 size={48} className="mx-auto text-gray-300" />
                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Interactive Chart Coming Soon</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm h-[400px] flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-lg font-bold text-gray-900">Sector Distribution</h3>
              <PieChart size={20} className="text-gray-400" />
            </div>
            <div className="flex-1 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center">
              <div className="text-center space-y-3">
                <Activity size={48} className="mx-auto text-gray-300" />
                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">AI Sector Analysis Initializing</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isLocked && <FeatureLockedOverlay />}
    </div>
  );
}
