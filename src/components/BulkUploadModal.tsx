'use client';
import React, { useRef, useState } from 'react';
import { X, UploadCloud, FileText, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploaded: () => void;
}

interface UploadRowResult {
  file: string;
  row?: number;
  status: 'created' | 'skipped' | 'error';
  reason?: string;
}

interface UploadResponse {
  success: boolean;
  created: number;
  skipped: number;
  errors: number;
  results: UploadRowResult[];
  error?: string;
}

const ACCEPTED = '.csv,.pdf,.docx,.doc,.txt';

export default function BulkUploadModal({ isOpen, onClose, onUploaded }: BulkUploadModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList) return;
    setFiles(Array.from(fileList));
    setResult(null);
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setResult(null);
    try {
      const formData = new FormData();
      files.forEach(f => formData.append('files', f));

      const res = await fetch('/api/deals/bulk-upload', { method: 'POST', body: formData });
      const data: UploadResponse = await res.json();

      if (!res.ok) throw new Error(data.error || 'Upload failed');

      setResult(data);
      if (data.created > 0) onUploaded();
    } catch (err) {
      setResult({
        success: false, created: 0, skipped: 0, errors: files.length, results: [],
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setFiles([]);
    setResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-6 sm:p-8 animate-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-black text-[#1F2937] tracking-tight">Upload Bulk Data</h2>
            <p className="text-sm text-gray-500 mt-1">
              Upload a CSV (one mandate per row) or PDF/DOCX files (one mandate per document).
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-all"
          >
            <X size={18} />
          </button>
        </div>

        <div
          onClick={() => inputRef.current?.click()}
          className="cursor-pointer border-2 border-dashed border-gray-200 hover:border-[#F97316]/40 rounded-2xl py-10 px-6 flex flex-col items-center text-center transition-all"
        >
          <div className="w-14 h-14 bg-[#F97316]/10 rounded-2xl flex items-center justify-center mb-3">
            <UploadCloud size={26} className="text-[#F97316]" />
          </div>
          <p className="text-sm font-bold text-[#1F2937]">Click to select files</p>
          <p className="text-xs text-gray-400 mt-1">CSV, PDF, DOCX, DOC, TXT — up to 25 files, 10MB each</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED}
            className="hidden"
            onChange={(e) => handleFilesSelected(e.target.files)}
          />
        </div>

        {files.length > 0 && (
          <div className="mt-4 space-y-1.5 max-h-32 overflow-y-auto">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-1.5">
                <FileText size={12} className="shrink-0 text-gray-400" />
                <span className="truncate">{f.name}</span>
              </div>
            ))}
          </div>
        )}

        {result && (
          <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
            <div className="flex items-center gap-2 text-xs font-bold">
              {result.errors === 0 ? (
                <CheckCircle2 size={14} className="text-green-500" />
              ) : (
                <AlertTriangle size={14} className="text-amber-500" />
              )}
              <span className="text-[#1F2937]">
                {result.created} created · {result.skipped} skipped · {result.errors} errors
              </span>
            </div>
            {result.error && <p className="text-xs text-red-500">{result.error}</p>}
            {result.results.filter(r => r.status !== 'created').map((r, i) => (
              <div key={i} className="text-[11px] text-gray-500 bg-gray-50 rounded-lg px-3 py-1.5">
                <span className="font-semibold">{r.file}{r.row ? ` (row ${r.row})` : ''}:</span> {r.reason}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={handleClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-all"
          >
            {result ? 'Close' : 'Cancel'}
          </button>
          <button
            onClick={handleUpload}
            disabled={files.length === 0 || uploading}
            className="flex-1 flex items-center justify-center gap-2 bg-[#F97316] text-white px-4 py-2.5 rounded-xl text-sm font-black hover:bg-[#EA580C] transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Uploading...
              </>
            ) : (
              'Upload'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
