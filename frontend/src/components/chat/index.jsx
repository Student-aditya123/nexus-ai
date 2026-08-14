/**
 * NEXUS AI - Chat Sub-Components
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, MessageSquare, Trash2, Pin, BookOpen,
  MessageCircle, Bot, ChevronDown, FileText,
  Loader2, Check, ExternalLink, Zap
} from 'lucide-react';
import { format } from 'date-fns';
import api from '../../services/api.js';

// ─── Session Sidebar ──────────────────────────────────────────────────────────

export function SessionSidebar({ sessions, activeId, onSelect, onNew, onDelete }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <motion.div
      animate={{ width: collapsed ? 0 : 260 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="flex-shrink-0 border-r border-nexus-border glass-strong overflow-hidden hidden lg:flex flex-col"
    >
      <div className="flex items-center justify-between px-3 py-3 border-b border-nexus-border">
        <span className="text-xs font-semibold text-nexus-muted uppercase tracking-wider">Chats</span>
        <button onClick={onNew} className="btn-ghost p-1.5 hover:text-nexus-accent" title="New chat">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2 space-y-0.5 px-2">
        <AnimatePresence>
          {sessions.map(session => (
            <motion.div
              key={session._id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              className={`group flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all
                ${activeId === session._id
                  ? 'bg-nexus-accent/10 border border-nexus-accent/20'
                  : 'hover:bg-nexus-hover'}`}
              onClick={() => onSelect(session._id)}
            >
              <MessageSquare className="w-3.5 h-3.5 text-nexus-muted flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-nexus-text truncate">{session.title || 'New Chat'}</p>
                <p className="text-[10px] text-nexus-muted">
                  {session.stats?.messageCount || 0} msgs · {session.mode}
                </p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); onDelete(session._id); }}
                className="opacity-0 group-hover:opacity-100 btn-ghost p-1 transition-opacity"
              >
                <Trash2 className="w-3 h-3 text-nexus-rose" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>

        {sessions.length === 0 && (
          <div className="text-center py-8 text-nexus-muted text-xs">
            <MessageSquare className="w-6 h-6 mx-auto mb-2 opacity-40" />
            No conversations yet
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Mode Selector ────────────────────────────────────────────────────────────

const MODES = [
  { id: 'chat', label: 'Chat', icon: MessageCircle, desc: 'General AI conversation' },
  { id: 'rag', label: 'Document Q&A', icon: BookOpen, desc: 'Ask questions about your docs' },
  { id: 'agent', label: 'Agent', icon: Bot, desc: 'Autonomous task execution' },
];

export function ModeSelector({ mode, onModeChange }) {
  const [open, setOpen] = useState(false);
  const current = MODES.find(m => m.id === mode) || MODES[0];
  const Icon = current.icon;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 btn-ghost rounded-xl text-sm py-1.5 px-3 border border-nexus-border"
      >
        <Icon className="w-3.5 h-3.5" />
        <span className="hidden sm:block">{current.label}</span>
        <ChevronDown className="w-3 h-3 text-nexus-muted" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute right-0 top-10 glass-strong rounded-xl border border-nexus-border shadow-card z-20 min-w-[200px] py-1"
            onMouseLeave={() => setOpen(false)}
          >
            {MODES.map(m => {
              const MIcon = m.icon;
              return (
                <button
                  key={m.id}
                  onClick={() => { onModeChange(m.id); setOpen(false); }}
                  className={`flex items-start gap-3 px-3 py-2.5 w-full text-left transition-colors hover:bg-nexus-hover
                    ${mode === m.id ? 'text-nexus-accent' : 'text-nexus-text'}`}
                >
                  <MIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium">{m.label}</p>
                    <p className="text-[10px] text-nexus-muted">{m.desc}</p>
                  </div>
                  {mode === m.id && <Check className="w-3.5 h-3.5 ml-auto mt-0.5" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Document Selector ────────────────────────────────────────────────────────

export function DocumentSelector({ selected, onSelect }) {
  const [open, setOpen] = useState(false);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadDocs = async () => {
    if (docs.length) return;
    setLoading(true);
    try {
      const { data } = await api.get('/documents?status=completed');
      setDocs(data.data);
    } catch {} finally { setLoading(false); }
  };

  const toggle = (id) => {
    onSelect(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
  };

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(!open); loadDocs(); }}
        className={`flex items-center gap-2 btn-ghost rounded-xl text-sm py-1.5 px-3 border transition-all
          ${selected.length ? 'border-nexus-emerald/50 text-nexus-emerald' : 'border-nexus-border'}`}
      >
        <FileText className="w-3.5 h-3.5" />
        <span className="hidden sm:block text-xs">
          {selected.length ? `${selected.length} doc${selected.length > 1 ? 's' : ''}` : 'Select docs'}
        </span>
        <ChevronDown className="w-3 h-3 text-nexus-muted" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute right-0 top-10 glass-strong rounded-xl border border-nexus-border shadow-card z-20 min-w-[240px] max-h-64 overflow-y-auto"
            onMouseLeave={() => setOpen(false)}
          >
            <div className="px-3 py-2 border-b border-nexus-border">
              <p className="text-xs font-medium text-nexus-muted">Select documents for context</p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-4 h-4 animate-spin text-nexus-muted" />
              </div>
            ) : docs.length === 0 ? (
              <div className="text-center py-6 text-xs text-nexus-muted">
                No ready documents. Upload and process files first.
              </div>
            ) : (
              <div className="py-1">
                {docs.map(doc => (
                  <button
                    key={doc._id}
                    onClick={() => toggle(doc._id)}
                    className="flex items-center gap-3 px-3 py-2.5 w-full text-left hover:bg-nexus-hover transition-colors"
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0
                      ${selected.includes(doc._id) ? 'bg-nexus-accent border-nexus-accent' : 'border-nexus-border'}`}
                    >
                      {selected.includes(doc._id) && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-nexus-text truncate">{doc.originalName}</p>
                      <p className="text-[10px] text-nexus-muted">{doc.content?.pageCount} pages</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Source Citations ─────────────────────────────────────────────────────────

export function SourceCitations({ sources }) {
  const [expanded, setExpanded] = useState(false);

  if (!sources?.length) return null;

  return (
    <div className="max-w-[75%]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[10px] text-nexus-muted hover:text-nexus-accent transition-colors"
      >
        <ExternalLink className="w-3 h-3" />
        {sources.length} source{sources.length > 1 ? 's' : ''}
        <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-1.5">
              {sources.map((s, i) => (
                <div key={i} className="glass rounded-xl px-3 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="w-3 h-3 text-nexus-accent flex-shrink-0" />
                    <span className="text-[10px] font-medium text-nexus-text truncate">{s.filename}</span>
                    <span className="text-[10px] text-nexus-muted ml-auto">p.{s.page}</span>
                    <span className="text-[10px] text-nexus-emerald">{Math.round(s.score * 100)}%</span>
                  </div>
                  <p className="text-[10px] text-nexus-muted line-clamp-2">{s.excerpt}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Token Usage Bar (Sidebar Widget) ─────────────────────────────────────────

export function TokenUsageBar({ used, limit, plan }) {
  const pct = Math.min(Math.round((used / limit) * 100), 100);
  const color = pct > 90 ? 'bg-nexus-rose' : pct > 70 ? 'bg-nexus-amber' : 'bg-nexus-accent';

  return (
    <div className="glass rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3 h-3 text-nexus-accent" />
          <span className="text-[10px] font-medium text-nexus-text">Tokens</span>
        </div>
        <span className="text-[10px] text-nexus-muted capitalize">{plan}</span>
      </div>
      <div className="h-1.5 bg-nexus-border rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-nexus-muted">{(used / 1000).toFixed(0)}K used</span>
        <span className="text-[10px] text-nexus-muted">{pct}%</span>
      </div>
    </div>
  );
}

export default { SessionSidebar, ModeSelector, DocumentSelector, SourceCitations, TokenUsageBar };
