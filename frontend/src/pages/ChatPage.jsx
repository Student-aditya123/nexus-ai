/**
 * NEXUS AI - Chat Page
 * Full-featured chat with streaming, RAG mode, session management
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Plus, Paperclip, StopCircle, ChevronDown,
  FileText, BookOpen, Cpu, Trash2, Pin, Archive,
  MessageSquare, Sparkles, Copy, Check
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import toast from 'react-hot-toast';

import api, { createStream } from '../services/api';
import { useAuthStore } from '../stores/auth.store';
import SessionSidebar from '../components/chat/SessionSidebar';
import DocumentSelector from '../components/chat/DocumentSelector';
import ModeSelector from '../components/chat/ModeSelector';
import SourceCitations from '../components/chat/SourceCitations';

const MODES = {
  chat: { label: 'Chat', icon: MessageSquare, color: 'text-nexus-accent' },
  rag: { label: 'Document Q&A', icon: BookOpen, color: 'text-nexus-emerald' },
  agent: { label: 'Agent', icon: Cpu, color: 'text-nexus-amber' },
};

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-3">
      <div className="typing-dot" />
      <div className="typing-dot" />
      <div className="typing-dot" />
      <span className="text-xs text-nexus-muted ml-1">Nexus is thinking...</span>
    </div>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="btn-ghost p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
      {copied ? <Check className="w-3.5 h-3.5 text-nexus-emerald" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-3 group ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {!isUser && (
        <div className="w-7 h-7 rounded-lg bg-nexus-accent-dim flex items-center justify-center flex-shrink-0 mt-1">
          <Sparkles className="w-3.5 h-3.5 text-nexus-accent-glow" />
        </div>
      )}

      <div className={`max-w-[75%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div className={`px-4 py-3 text-sm ${isUser ? 'message-user' : 'message-assistant'} relative`}>
          {isUser ? (
            <p className="text-nexus-text whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose-nexus">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ node, inline, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                      <SyntaxHighlighter
                        style={oneDark}
                        language={match[1]}
                        PreTag="div"
                        customStyle={{
                          margin: 0, borderRadius: '8px',
                          background: '#0d1117', border: '1px solid #1e2535',
                        }}
                        {...props}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : (
                      <code className={className} {...props}>{children}</code>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}

          {!isUser && (
            <div className="absolute top-2 right-2">
              <CopyButton text={message.content} />
            </div>
          )}
        </div>

        {/* Sources */}
        {message.metadata?.sources?.length > 0 && (
          <SourceCitations sources={message.metadata.sources} />
        )}

        {/* Meta */}
        <div className="flex items-center gap-2 px-1">
          {message.metadata?.latency && (
            <span className="text-[10px] text-nexus-muted">
              {message.metadata.latency}ms
            </span>
          )}
          {message.metadata?.tokensUsed && (
            <span className="text-[10px] text-nexus-muted">
              {message.metadata.tokensUsed} tokens
            </span>
          )}
        </div>
      </div>

      {isUser && (
        <div className="w-7 h-7 rounded-lg bg-nexus-hover flex items-center justify-center flex-shrink-0 mt-1">
          <span className="text-xs font-bold text-nexus-text">U</span>
        </div>
      )}
    </motion.div>
  );
}

function StreamingMessage({ content }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex gap-3"
    >
      <div className="w-7 h-7 rounded-lg bg-nexus-accent-dim flex items-center justify-center flex-shrink-0 mt-1">
        <Sparkles className="w-3.5 h-3.5 text-nexus-accent animate-pulse" />
      </div>
      <div className="message-assistant px-4 py-3 max-w-[75%]">
        <div className="prose-nexus text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || ''}</ReactMarkdown>
        </div>
        <span className="inline-block w-0.5 h-4 bg-nexus-accent animate-pulse ml-0.5 align-text-bottom" />
      </div>
    </motion.div>
  );
}

export default function ChatPage() {
  const { sessionId: urlSessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [mode, setMode] = useState('chat');
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [sources, setSources] = useState([]);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    if (urlSessionId) loadSession(urlSessionId);
  }, [urlSessionId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchSessions = async () => {
    try {
      const { data } = await api.get('/chat/sessions');
      setSessions(data.data);
    } catch {}
  };

  const loadSession = async (id) => {
    try {
      setIsLoading(true);
      const [sessionRes, msgRes] = await Promise.all([
        api.get(`/chat/sessions/${id}`),
        api.get(`/chat/sessions/${id}/messages`),
      ]);
      setActiveSession(sessionRes.data.data);
      setMessages(msgRes.data.data);
      setMode(sessionRes.data.data.mode || 'chat');
      setSelectedDocs(sessionRes.data.data.attachedDocuments?.map(d => d._id) || []);
    } catch {
      toast.error('Failed to load session');
    } finally {
      setIsLoading(false);
    }
  };

  const createSession = async () => {
    try {
      const { data } = await api.post('/chat/sessions', { mode, documentIds: selectedDocs });
      const session = data.data;
      setSessions(prev => [session, ...prev]);
      setActiveSession(session);
      setMessages([]);
      navigate(`/chat/${session._id}`);
      return session;
    } catch {
      toast.error('Failed to create session');
      return null;
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isStreaming) return;

    let session = activeSession;
    if (!session) {
      session = await createSession();
      if (!session) return;
    }

    const userMsg = {
      _id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMsg]);
    const msgInput = input.trim();
    setInput('');
    setIsStreaming(true);
    setStreamingContent('');
    setSources([]);

    abortControllerRef.current = new AbortController();

    try {
      const response = await createStream('/chat/message', {
        method: 'POST',
        body: { sessionId: session._id, message: msgInput, stream: true },
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) throw new Error('Stream failed');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let msgSources = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === 'delta') {
              accumulated += event.content;
              setStreamingContent(accumulated);
            } else if (event.type === 'sources') {
              msgSources = event.data;
              setSources(event.data);
            } else if (event.type === 'complete') {
              const assistantMsg = {
                _id: event.messageId || Date.now().toString(),
                role: 'assistant',
                content: accumulated,
                metadata: { sources: msgSources },
                timestamp: new Date().toISOString(),
              };
              setMessages(prev => [...prev, assistantMsg]);
              setStreamingContent('');

              // Update session title
              if (event.title) {
                setActiveSession(prev => ({ ...prev, title: event.title }));
                setSessions(prev => prev.map(s =>
                  s._id === session._id ? { ...s, title: event.title } : s
                ));
              }
            }
          } catch {}
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        toast.error('Failed to get response');
        setMessages(prev => prev.filter(m => m._id !== userMsg._id));
        setInput(msgInput);
      }
    } finally {
      setIsStreaming(false);
      setStreamingContent('');
    }
  };

  const stopStreaming = () => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
    if (streamingContent) {
      setMessages(prev => [...prev, {
        _id: Date.now().toString(),
        role: 'assistant',
        content: streamingContent + ' *(stopped)*',
        timestamp: new Date().toISOString(),
      }]);
    }
    setStreamingContent('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const deleteSession = async (id) => {
    try {
      await api.delete(`/chat/sessions/${id}`);
      setSessions(prev => prev.filter(s => s._id !== id));
      if (activeSession?._id === id) {
        setActiveSession(null);
        setMessages([]);
        navigate('/chat');
      }
      toast.success('Session deleted');
    } catch {
      toast.error('Failed to delete session');
    }
  };

  return (
    <div className="flex h-full">
      {/* Session Sidebar */}
      <SessionSidebar
        sessions={sessions}
        activeId={activeSession?._id}
        onSelect={(id) => navigate(`/chat/${id}`)}
        onNew={createSession}
        onDelete={deleteSession}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-nexus-border glass-strong">
          <div className="flex items-center gap-3">
            <h1 className="font-display font-semibold text-white truncate">
              {activeSession?.title || 'New Chat'}
            </h1>
            {mode !== 'chat' && (
              <span className={`badge-info text-xs ${MODES[mode]?.color}`}>
                {MODES[mode]?.label}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <ModeSelector mode={mode} onModeChange={setMode} />
            {mode === 'rag' && (
              <DocumentSelector
                selected={selectedDocs}
                onSelect={setSelectedDocs}
              />
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          {messages.length === 0 && !isStreaming && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-4"
              >
                <div className="w-16 h-16 rounded-2xl bg-nexus-accent-dim flex items-center justify-center mx-auto glow-accent">
                  <Sparkles className="w-7 h-7 text-nexus-accent" />
                </div>
                <div>
                  <h2 className="font-display font-semibold text-white text-xl mb-1">Start a conversation</h2>
                  <p className="text-nexus-muted text-sm">
                    {mode === 'rag'
                      ? 'Select documents and ask questions about your files'
                      : mode === 'agent'
                      ? 'Describe a task and let the AI agent execute it step-by-step'
                      : 'Ask anything. Powered by Groq LPU for ultra-fast responses.'}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 max-w-sm">
                  {['Summarize a topic', 'Explain a concept', 'Analyze data', 'Write code'].map(prompt => (
                    <button
                      key={prompt}
                      onClick={() => setInput(prompt)}
                      className="glass rounded-xl px-3 py-2 text-xs text-nexus-muted hover:text-nexus-text hover:border-nexus-accent/50 transition-all text-left"
                    >
                      {prompt} →
                    </button>
                  ))}
                </div>
              </motion.div>
            </div>
          )}

          <AnimatePresence>
            {messages.map(msg => (
              <MessageBubble key={msg._id} message={msg} />
            ))}
          </AnimatePresence>

          {isStreaming && streamingContent && (
            <StreamingMessage content={streamingContent} />
          )}

          {isStreaming && !streamingContent && <TypingIndicator />}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="px-4 py-4 border-t border-nexus-border glass-strong">
          <div className="relative">
            <div className="glass rounded-2xl border border-nexus-border focus-within:border-nexus-accent/50 transition-colors">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  mode === 'rag' ? 'Ask a question about your documents...' :
                  mode === 'agent' ? 'Describe a task for the AI agent...' :
                  'Message Nexus AI... (Shift+Enter for newline)'
                }
                rows={1}
                disabled={isStreaming}
                className="w-full bg-transparent px-4 py-3 pr-24 text-nexus-text placeholder-nexus-muted
                  resize-none focus:outline-none text-sm max-h-32 overflow-y-auto"
                style={{ minHeight: '48px' }}
                onInput={e => {
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
                }}
              />

              <div className="absolute bottom-2 right-2 flex items-center gap-1">
                <span className={`text-xs ${input.length > 9000 ? 'text-nexus-rose' : 'text-nexus-muted'}`}>
                  {input.length > 0 && `${input.length}/10000`}
                </span>

                {isStreaming ? (
                  <button
                    onClick={stopStreaming}
                    className="w-8 h-8 rounded-xl bg-nexus-rose/20 text-nexus-rose hover:bg-nexus-rose/30
                    flex items-center justify-center transition-colors"
                  >
                    <StopCircle className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={sendMessage}
                    disabled={!input.trim()}
                    className="w-8 h-8 rounded-xl bg-nexus-accent hover:bg-nexus-accent-glow
                    flex items-center justify-center transition-colors
                    disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Send className="w-3.5 h-3.5 text-white" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <p className="text-center text-[11px] text-nexus-muted mt-2">
            Powered by <span className="text-nexus-accent">Groq LPU</span> · llama3-70b-8192 · Ultra-fast inference
          </p>
        </div>
      </div>
    </div>
  );
}
