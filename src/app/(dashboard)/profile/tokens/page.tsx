'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { CreditCard, ArrowUpRight, History, Loader2 } from 'lucide-react';

interface Transaction {
  id: string;
  createdAt: string;
  type: string;
  action: string;
  amount: number;
  balanceAfter: number;
}

export default function TokenUsagePage() {
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/profile/tokens');
      if (res.ok) {
        const data = await res.json();
        setBalance(data.balance);
        setTransactions(data.transactions);
      }
    } catch (error: unknown) {
      console.error("FULL ERROR:", error);
      console.error("STRINGIFIED:", JSON.stringify(error, null, 2));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchData]);

  return (
    <div className="flex-1 w-full bg-[#F9FAFB] min-h-screen">
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black text-[#1F2937]">Token Usage</h1>
          <Link href="/deal-dashboard" className="text-sm font-bold text-gray-500 hover:text-[#F97316]">
            Back to Dashboard
          </Link>
        </div>

        {/* Balance */}
        <div className="bg-white p-8 rounded-2xl shadow-sm flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">
              <History size={14} /> Available Tokens
            </div>
            <div className="text-5xl font-black text-[#1F2937] tabular-nums">
              {loading ? "..." : balance}
            </div>
          </div>

          <Link
            href="/profile/billing"
            className="flex items-center gap-3 bg-[#1F2937] text-white px-8 py-4 rounded-[20px] font-black uppercase text-xs tracking-[0.2em] shadow-xl hover:bg-[#F97316] transition-all"
          >
            <CreditCard size={18} />
            Buy Tokens
            <ArrowUpRight size={18} />
          </Link>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
          <div className="px-8 py-6 border-b border-gray-50">
            <h2 className="text-lg font-bold text-[#1F2937]">Transaction Ledger</h2>
            <p className="text-xs text-gray-400 font-medium mt-1">History of all credits, debits and purchases</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Date</th>
                  <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Type</th>
                  <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Action</th>
                  <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Amount</th>
                  <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Balance After</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-8 py-20 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="animate-spin text-[#F97316]" size={32} />
                        <p className="text-sm font-bold text-gray-400">Loading your ledger...</p>
                      </div>
                    </td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-8 py-20 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center">
                          <History className="text-gray-200" size={32} />
                        </div>
                        <p className="text-sm font-bold text-gray-400">No transactions recorded yet.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-8 py-5 text-sm font-medium text-gray-600">
                        {new Date(tx.createdAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>

                      <td className="px-8 py-5">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${tx.type === 'debit'
                            ? 'bg-red-50 text-red-600 border border-red-100'
                            : 'bg-green-50 text-green-600 border border-green-100'
                          }`}>
                          {tx.type}
                        </span>
                      </td>

                      <td className="px-8 py-5 text-sm font-bold text-[#1F2937]">
                        {tx.action}
                      </td>

                      <td className={`px-8 py-5 text-right font-black tabular-nums ${tx.amount > 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                        {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                      </td>

                      <td className="px-8 py-5 text-right font-black text-[#1F2937] tabular-nums">
                        {tx.balanceAfter}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
