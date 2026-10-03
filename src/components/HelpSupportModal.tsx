'use client';
import React, { useState } from 'react';
import { X, LifeBuoy, Mail, MessageCircle, HelpCircle, Send, CheckCircle2, AlertCircle, Copy, Check, ExternalLink } from 'lucide-react';
import { SUPPORT_EMAIL, getGmailComposeUrl, getMailtoUrl, openSupportEmail } from '@/lib/supportEmail';

interface HelpSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string | null;
}

export default function HelpSupportModal({ isOpen, onClose, userEmail }: HelpSupportModalProps) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [emailActionNotice, setEmailActionNotice] = useState<string | null>(null);

  const handleCopyEmail = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    navigator.clipboard?.writeText(SUPPORT_EMAIL);
    setCopiedEmail(true);
    setEmailActionNotice('Email address copied to clipboard (join@dealcollab.in)!');
    setTimeout(() => {
      setCopiedEmail(false);
      setEmailActionNotice(null);
    }, 3000);
  };

  const handleOpenEmail = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    try {
      navigator.clipboard?.writeText(SUPPORT_EMAIL);
      setCopiedEmail(true);
    } catch {
      // ignore
    }
    const opened = openSupportEmail('DealCollab Support Request');
    setEmailActionNotice(opened ? 'Opening Gmail compose in a new tab...' : 'Email copied to clipboard (join@dealcollab.in)!');
    setTimeout(() => {
      setCopiedEmail(false);
      setEmailActionNotice(null);
    }, 4000);
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send your message. Please try Email or WhatsApp support instead.');
      }
      setSubmitted(true);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setSubject('');
    setMessage('');
    setSubmitted(false);
    setSubmitError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gradient-to-r from-gray-50 via-white to-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#F97316]">
              <LifeBuoy size={22} />
            </div>
            <div>
              <h2 className="text-lg font-black text-gray-900 tracking-tight">Help & Support Desk</h2>
              <p className="text-xs text-gray-500 font-medium">We typically reply within 2–4 business hours</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-900 flex items-center justify-center transition-all cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Notice banner for email action */}
          {emailActionNotice && (
            <div className="p-3 rounded-2xl bg-orange-50 border border-orange-200 text-xs text-orange-950 font-medium flex items-center justify-between animate-in fade-in duration-200">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-[#F97316] shrink-0" />
                <span>{emailActionNotice}</span>
              </div>
              <span className="text-[10px] font-bold text-[#F97316] uppercase tracking-wider shrink-0">{SUPPORT_EMAIL}</span>
            </div>
          )}

          {/* Quick Contact Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div 
              role="button"
              tabIndex={0}
              onClick={() => handleOpenEmail()}
              onKeyDown={(e) => e.key === 'Enter' && handleOpenEmail()}
              className="p-4 rounded-2xl border border-gray-200/80 bg-gray-50/60 hover:bg-white hover:border-[#F97316]/50 hover:shadow-md transition-all group flex flex-col justify-between cursor-pointer text-left select-none"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-[#F97316] group-hover:scale-105 transition-transform shrink-0">
                    <Mail size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold text-gray-900">Email Support</p>
                      <ExternalLink size={11} className="text-gray-400 group-hover:text-[#F97316]" />
                    </div>
                    <p className={`text-[10px] truncate ${copiedEmail ? 'text-emerald-600 font-semibold' : 'text-gray-500'}`}>
                      {copiedEmail ? 'Copied to clipboard!' : SUPPORT_EMAIL}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopyEmail(e);
                  }}
                  title="Copy email address"
                  className="p-2 rounded-xl bg-white/80 hover:bg-orange-50 border border-gray-200/60 hover:border-orange-200 text-gray-400 hover:text-[#F97316] transition-all shrink-0 ml-2 cursor-pointer"
                >
                  {copiedEmail ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                </button>
              </div>
              <div className="mt-2.5 pt-2 border-t border-gray-200/60 flex items-center justify-between text-[10px]" onClick={(e) => e.stopPropagation()}>
                <a
                  href={getGmailComposeUrl('DealCollab Support Request')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-[#F97316] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  Open in Gmail ↗
                </a>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopyEmail(e);
                  }}
                  className="text-gray-500 hover:text-gray-800 font-medium hover:underline cursor-pointer"
                >
                  {copiedEmail ? '✓ Copied' : 'Copy Email'}
                </button>
                <a
                  href={getMailtoUrl('DealCollab Support Request')}
                  className="text-gray-400 hover:text-gray-600 hover:underline cursor-pointer"
                >
                  Mail App
                </a>
              </div>
            </div>

            <a 
              href="https://wa.me/919987654321?text=Hi%20DealCollab%20Support,%20I%20need%20assistance"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 rounded-2xl border border-gray-200/80 bg-emerald-50/40 hover:bg-white hover:border-emerald-500/50 hover:shadow-md transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-emerald-600 group-hover:scale-105 transition-transform">
                <MessageCircle size={18} />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-900">WhatsApp Desk</p>
                <p className="text-[10px] text-emerald-700 font-semibold">Live Support Chat</p>
              </div>
            </a>
          </div>

          {/* In-App Ticket Form */}
          {submitted ? (
            <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-3 animate-in fade-in duration-300">
              <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
                <CheckCircle2 size={24} />
              </div>
              <h3 className="text-sm font-black text-emerald-900">Query Received!</h3>
              <p className="text-xs text-emerald-800 leading-relaxed max-w-sm mx-auto">
                Thank you for reaching out. Our support engineering team has received your ticket and will contact you at <strong className="font-bold">{userEmail || 'your email'}</strong>.
              </p>
              <button 
                onClick={handleReset}
                className="mt-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all"
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
                <HelpCircle size={15} className="text-gray-400" />
                <h3 className="text-xs font-black text-gray-800 uppercase tracking-wider">Send In-App Message</h3>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Subject</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Question about EOI tokens or Deal matching"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Message</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Describe your question or issue in detail..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F97316] text-xs resize-none"
                />
              </div>

              {submitError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 font-semibold">
                  <AlertCircle size={14} className="shrink-0" />
                  {submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !message.trim()}
                className="w-full py-3 bg-[#1F2937] hover:bg-[#F97316] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    Submit Support Ticket
                    <Send size={13} />
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
