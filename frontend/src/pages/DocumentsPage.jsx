/**
 * NEXUS AI - Documents Page
 * Upload, manage, and query documents with drag-and-drop
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Upload, Trash2, Search, Filter,
  CheckCircle, Clock, AlertCircle, Loader2,
  File, FileType, MoreVertical, Eye, Zap
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

const STATUS_CONFIG = {
  completed: { icon: CheckCircle, color: 'text-nexus-emerald', badge: 'badge-success', label: 'Ready' },
  processing: { icon: Loader2, color: 'text-nexus-amber animate-spin', badge: 'badge-warning', label: 'Processing' },
  pending: { icon: Clock, color: 'text-nexus-muted', badge: 'badge-warning', label: 'Queued' },
  failed: { icon: AlertCircle, color: 'text-nexus-rose', badge: 'badge-error', label: 'Failed' },
};

const FILE_ICONS = {
  pdf: { color: 'text-red-400', bg: 'bg-red-400/10' },
  docx: { color: 'text-blue-400', bg: 'bg-blue-400/10' },
  pptx: { color: 'text-orange-400', bg: 'bg-orange-400/10' },
  txt: { color: 'text-nexus-muted', bg: 'bg-nexus-subtle/20' },
  md: { color: 'text-nexus-accent', bg: 'bg-nexus-accent/10' },
};

function DocumentCard({ doc, onDelete, onQuery }) {
  const [showMenu, setShowMenu] = useState(false);
  const status = STATUS_CONFIG[doc.processing?.status] || STATUS_CONFIG.pending;
  const StatusIcon = status.icon;
  const fileStyle = FILE_ICONS[doc.fileType] || FILE_ICONS.txt;

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="glass rounded-2xl p-4 hover:border-nexus-accent/30 transition-all cursor-pointer group relative"
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl ${fileStyle.bg} flex items-center justify-center flex-shrink-0`}>
          <FileText className={`w-5 h-5 ${fileStyle.color}`} />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-nexus-text truncate" title={doc.originalName}>
            {doc.originalName}
          </h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs text-nexus-muted">{formatSize(doc.fileSize)}</span>
            {doc.content?.pageCount && (
              <span className="text-xs text-nexus-muted">{doc.content.pageCount} pages</span>
            )}
            {doc.content?.wordCount && (
              <span className="text-xs text-nexus-muted">{doc.content.wordCount.toLocaleString()} words</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            <StatusIcon className={`w-3.5 h-3.5 ${status.color}`} />
            <span className={status.badge}>{status.label}</span>
            {doc.vectorized && (
              <span className="badge-info flex items-center gap-1">
                <Zap className="w-2.5 h-2.5" /> Vectorized
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="btn-ghost p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          <AnimatePresence>
            {showMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="absolute right-0 top-8 glass-strong rounded-xl border border-nexus-border shadow-card z-10 min-w-[140px] py-1"
                onMouseLeave={() => setShowMenu(false)}
              >
                {doc.vectorized && (
                  <button
                    onClick={() => { onQuery(doc); setShowMenu(false); }}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-nexus-text hover:bg-nexus-hover w-full text-left"
                  >
                    <Eye className="w-3.5 h-3.5" /> Query Doc
                  </button>
                )}
                <button
                  onClick={() => { onDelete(doc._id); setShowMenu(false); }}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-nexus-rose hover:bg-nexus-rose/10 w-full text-left"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Processing progress */}
      {doc.processing?.status === 'processing' && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-nexus-muted mb-1">
            <span>Processing...</span>
            <span>{doc.processing.progress || 0}%</span>
          </div>
          <div className="h-1 bg-nexus-border rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-nexus-accent rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${doc.processing.progress || 0}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
      )}

      {doc.content?.preview && (
        <p className="mt-3 text-xs text-nexus-muted line-clamp-2">{doc.content.preview}</p>
      )}
    </motion.div>
  );
}

function UploadZone({ onUpload }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const onDrop = useCallback(async (acceptedFiles) => {
    if (!acceptedFiles.length) return;

    setUploading(true);
    let uploaded = 0;

    for (const file of acceptedFiles) {
      const formData = new FormData();
      formData.append('document', file);

      try {
        const { data } = await api.post('/documents/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e) => setProgress(Math.round(e.loaded / e.total * 100)),
        });
        onUpload(data.data);
        uploaded++;
        toast.success(`${file.name} uploaded successfully!`);
      } catch (err) {
        toast.error(`Failed to upload ${file.name}: ${err.response?.data?.message || 'Unknown error'}`);
      }
    }

    setUploading(false);
    setProgress(0);
  }, [onUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
    },
    maxSize: 50 * 1024 * 1024,
    disabled: uploading,
  });

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all
        ${isDragActive
          ? 'border-nexus-accent bg-nexus-accent/5 glow-accent'
          : 'border-nexus-border hover:border-nexus-accent/50 hover:bg-nexus-hover/30'
        }
        ${uploading ? 'pointer-events-none opacity-70' : ''}`}
    >
      <input {...getInputProps()} />

      <div className="flex flex-col items-center gap-3">
        <div className={`w-12 h-12 rounded-2xl bg-nexus-accent/10 flex items-center justify-center
          ${isDragActive ? 'scale-110' : ''} transition-transform`}>
          {uploading
            ? <Loader2 className="w-6 h-6 text-nexus-accent animate-spin" />
            : <Upload className="w-6 h-6 text-nexus-accent" />
          }
        </div>

        {uploading ? (
          <div className="space-y-2 w-full max-w-xs">
            <p className="text-sm text-nexus-text">Uploading...</p>
            <div className="h-1.5 bg-nexus-border rounded-full overflow-hidden">
              <div
                className="h-full bg-nexus-accent rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <>
            <div>
              <p className="text-sm font-medium text-nexus-text">
                {isDragActive ? 'Drop files here' : 'Drag & drop or click to upload'}
              </p>
              <p className="text-xs text-nexus-muted mt-1">PDF, DOCX, PPTX, TXT, MD · Max 50MB each</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [queryDoc, setQueryDoc] = useState(null);
  const [queryInput, setQueryInput] = useState('');
  const [queryResult, setQueryResult] = useState(null);
  const [querying, setQuerying] = useState(false);

  useEffect(() => {
    fetchDocuments();
    // Poll for processing documents
    const interval = setInterval(() => {
      const hasProcessing = documents.some(d => d.processing?.status === 'processing' || d.processing?.status === 'pending');
      if (hasProcessing) fetchDocuments();
    }, 3000);
    return () => clearInterval(interval);
  }, [documents.length]);

  const fetchDocuments = async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filter !== 'all') params.set('status', filter);
      const { data } = await api.get(`/documents?${params}`);
      setDocuments(data.data);
    } catch {
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/documents/${id}`);
      setDocuments(prev => prev.filter(d => d._id !== id));
      toast.success('Document deleted');
    } catch {
      toast.error('Failed to delete document');
    }
  };

  const handleQuery = async () => {
    if (!queryInput.trim() || !queryDoc) return;
    setQuerying(true);
    try {
      const { data } = await api.post(`/documents/${queryDoc._id}/query`, { query: queryInput });
      setQueryResult(data.data);
    } catch {
      toast.error('Query failed');
    } finally {
      setQuerying(false);
    }
  };

  const filtered = documents.filter(d => {
    const matchSearch = !search || d.originalName.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || d.processing?.status === filter;
    return matchSearch && matchFilter;
  });

  return (
    <div className="h-full flex flex-col p-6 overflow-y-auto">
      <div className="max-w-5xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display font-bold text-white text-2xl">Documents</h1>
            <p className="text-nexus-muted text-sm mt-0.5">{documents.length} documents · RAG-powered Q&A</p>
          </div>
        </div>

        {/* Upload */}
        <UploadZone onUpload={(doc) => setDocuments(prev => [doc, ...prev])} />

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nexus-muted" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search documents..."
              className="nexus-input pl-9 py-2 text-sm"
            />
          </div>
          <div className="flex gap-1">
            {['all', 'completed', 'processing', 'failed'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all
                  ${filter === f ? 'bg-nexus-accent text-white' : 'btn-ghost'}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="glass rounded-2xl p-4 h-32">
                <div className="shimmer h-4 rounded-lg w-3/4 mb-2" />
                <div className="shimmer h-3 rounded-lg w-1/2" />
              </div>
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <AnimatePresence>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(doc => (
                <DocumentCard
                  key={doc._id}
                  doc={doc}
                  onDelete={handleDelete}
                  onQuery={setQueryDoc}
                />
              ))}
            </div>
          </AnimatePresence>
        ) : (
          <div className="text-center py-16">
            <FileText className="w-10 h-10 text-nexus-muted mx-auto mb-3" />
            <p className="text-nexus-muted">No documents found. Upload your first document above.</p>
          </div>
        )}

        {/* Quick Query Modal */}
        <AnimatePresence>
          {queryDoc && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
              onClick={() => { setQueryDoc(null); setQueryResult(null); }}
            >
              <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.95 }}
                className="glass-strong rounded-2xl p-6 max-w-lg w-full"
                onClick={e => e.stopPropagation()}
              >
                <h3 className="font-display font-semibold text-white mb-1">Quick Query</h3>
                <p className="text-sm text-nexus-muted mb-4">{queryDoc.originalName}</p>
                <div className="flex gap-2">
                  <input
                    value={queryInput}
                    onChange={e => setQueryInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleQuery()}
                    placeholder="Ask a question about this document..."
                    className="nexus-input flex-1 text-sm"
                  />
                  <button onClick={handleQuery} disabled={querying} className="btn-primary px-4">
                    {querying ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ask'}
                  </button>
                </div>
                {queryResult && (
                  <div className="mt-4 glass rounded-xl p-4">
                    <p className="text-sm text-nexus-text">{queryResult.answer}</p>
                    {queryResult.sources?.length > 0 && (
                      <div className="mt-3 space-y-1">
                        <p className="text-xs font-medium text-nexus-muted">Sources:</p>
                        {queryResult.sources.map((s, i) => (
                          <div key={i} className="text-xs text-nexus-muted glass rounded-lg px-2 py-1">
                            Page {s.page} · Score: {(s.score * 100).toFixed(0)}%
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
