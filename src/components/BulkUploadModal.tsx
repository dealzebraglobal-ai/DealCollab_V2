'use client';
import React, { useRef, useState } from 'react';
import { X, UploadCloud, FileText, Loader2, CheckCircle2, AlertTriangle, Trash2 } from 'lucide-react';

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

interface UploadProgress {
  current: number;
  total: number;
  currentFileName: string;
}

const ACCEPTED = '.csv,.pdf,.docx,.doc,.txt,.jpg,.jpeg,.png,.webp';

export default function BulkUploadModal({ isOpen, onClose, onUploaded }: BulkUploadModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList) return;
    setFiles(prev => [...prev, ...Array.from(fileList)]);
    setResult(null);
  };

  const removeFile = (index: number) => {
    if (uploading) return;
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0 || uploading) return;
    setUploading(true);
    setResult(null);

    const aggregate: UploadResponse = {
      success: true,
      created: 0,
      skipped: 0,
      errors: 0,
      results: [],
    };

    try {
      // Process files one-by-one in the background to prevent 413 Payload Too Large and function timeouts
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress({ current: i + 1, total: files.length, currentFileName: file.name });

        const formData = new FormData();
        formData.append('files', file);

        try {
          const res = await fetch('/api/deals/bulk-upload', {
            method: 'POST',
            body: formData,
          });

          const text = await res.text();
          let data: UploadResponse;
          try {
            data = JSON.parse(text);
          } catch {
            if (res.status === 413) {
              throw new Error(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max size is 4.5MB per document.`);
            }
            throw new Error(`Server returned error (${res.status}): ${text.slice(0, 100) || 'Unknown error'}`);
          }

          if (!res.ok) {
            throw new Error(data.error || `Upload failed (status ${res.status})`);
          }

          aggregate.created += data.created || 0;
          aggregate.skipped += data.skipped || 0;
          aggregate.errors += data.errors || 0;
          if (data.results && data.results.length > 0) {
            aggregate.results.push(...data.results);
          }
        } catch (fileErr) {
          const errorMsg = fileErr instanceof Error ? fileErr.message : String(fileErr);
          aggregate.errors += 1;
          aggregate.results.push({
            file: file.name,
            status: 'error',
            reason: errorMsg,
          });
        }

        // Live update summary as files finish
        setResult({ ...aggregate, results: [...aggregate.results] });
      }

      if (aggregate.created > 0) {
        onUploaded();
      }
    } catch (err) {
      const mainErrMsg = err instanceof Error ? err.message : String(err);
      setResult({
        success: false,
        created: aggregate.created,
        skipped: aggregate.skipped,
        errors: aggregate.errors || files.length,
        results: aggregate.results,
        error: mainErrMsg,
      });
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  const handleClose = () => {
    if (uploading) return;
    setFiles([]);
    setResult(null);
    setProgress(null);
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
            disabled={uploading}
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <X size={18} />
          </button>
        </div>

        <div
          onClick={() => !uploading && inputRef.current?.click()}
          className={`border-2 border-dashed border-gray-200 hover:border-[#F97316]/40 rounded-2xl py-8 px-6 flex flex-col items-center text-center transition-all ${
            uploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
          }`}
        >
          <div className="w-12 h-12 bg-[#F97316]/10 rounded-2xl flex items-center justify-center mb-3">
            <UploadCloud size={24} className="text-[#F97316]" />
          </div>
          <p className="text-sm font-bold text-[#1F2937]">Click to select files</p>
          <p className="text-xs text-gray-400 mt-1">CSV, PDF, DOCX, DOC, TXT, JPG, PNG — up to 25 files, 10MB each</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED}
            disabled={uploading}
            className="hidden"
            onChange={(e) => {
              handleFilesSelected(e.target.files);
              if (inputRef.current) inputRef.current.value = '';
            }}
          />
        </div>

        {/* Selected files list */}
        {files.length > 0 && !uploading && !result && (
          <div className="mt-4 space-y-1.5 max-h-32 overflow-y-auto">
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-1.5">
                <div className="flex items-center gap-2 truncate">
                  <FileText size={12} className="shrink-0 text-gray-400" />
                  <span className="truncate">{f.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="text-gray-400 hover:text-red-500 p-0.5 rounded transition-colors"
                  title="Remove file"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Live Upload Progress */}
        {uploading && progress && (
          <div className="mt-4 p-4 bg-orange-50/80 border border-orange-200/70 rounded-2xl space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-gray-700">
              <span className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-[#F97316]" />
                Processing {progress.current} of {progress.total}...
              </span>
              <span className="text-[#F97316] font-bold">
                {Math.round((progress.current / progress.total) * 100)}%
              </span>
            </div>
            <div className="w-full bg-orange-200/60 rounded-full h-2 overflow-hidden">
              <div
                className="bg-[#F97316] h-2 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${Math.max(5, Math.round((progress.current / progress.total) * 100))}%` }}
              />
            </div>
            <p className="text-[11px] text-gray-600 truncate">
              Current: <span className="font-medium text-gray-900">{progress.currentFileName}</span>
            </p>
          </div>
        )}

        {/* Upload Summary Results */}
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
              <div key={i} className="text-[11px] text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-1.5">
                <span className="font-semibold text-gray-800">{r.file}{r.row ? ` (row ${r.row})` : ''}:</span> {r.reason}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={handleClose}
            disabled={uploading}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {result ? 'Close' : 'Cancel'}
          </button>
          <button
            onClick={handleUpload}
            disabled={files.length === 0 || uploading}
            className="flex-1 flex items-center justify-center gap-2 bg-[#F97316] text-white px-4 py-2.5 rounded-xl text-sm font-black hover:bg-[#EA580C] transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-orange-500/10"
          >
            {uploading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Processing...
              </>
            ) : result ? (
              'Upload More'
            ) : (
              `Upload ${files.length > 0 ? `(${files.length})` : ''}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
