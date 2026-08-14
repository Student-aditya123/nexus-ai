/**
 * NEXUS AI - Agent Page
 * Autonomous AI task execution with real-time step visualization
 */

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Play, StopCircle, Loader2, CheckCircle,
  Brain, Wrench, Eye, Lightbulb, Terminal,
  Calculator, Search, FileSearch, BarChart2, Zap
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import toast from 'react-hot-toast';
import { createStream } from '../services/api';

const TOOL_ICONS = {
  web_search: Search,
  calculate: Calculator,
  summarize_text: FileSearch,
  search_documents: FileSearch,
  extract_data: BarChart2,
  analyze_sentiment: Brain,
};

const EXAMPLE_TASKS = [
  'Research the latest trends in quantum computing and summarize key findings',
  'Calculate the compound interest on $10,000 at 7% for 10 years, then explain the result',
  'Search my documents for information about quarterly revenue and create a summary',
  'Find information about machine learning frameworks and compare their pros and cons',
];

function StepCard({ step, index }) {
  const [expanded, setExpanded] = useState(true);
  const ToolIcon = TOOL_ICONS[step.action] || Terminal;

  const isComplete = step.observation !== null;
  const isFinish = step.action === 'FINISH';

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className={`agent-step ${isFinish ? 'border-nexus-emerald' : 'border-nexus-accent'}`}
    >
      {/* Step header */}
      <div
        className="flex items-start gap-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5
          ${isFinish ? 'bg-nexus-emerald/20' : 'bg-nexus-accent/20'}`}
        >
          {isComplete
            ? <CheckCircle className={`w-3.5 h-3.5 ${isFinish ? 'text-nexus-emerald' : 'text-nexus-accent'}`} />
            : <Loader2 className="w-3.5 h-3.5 text-nexus-accent animate-spin" />
          }
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-nexus-muted">Step {step.stepNumber}</span>
            {step.action && step.action !== 'FINISH' && (
              <div className="flex items-center gap-1 badge-info">
                <ToolIcon className="w-2.5 h-2.5" />
                <span>{step.action}</span>
              </div>
            )}
            {isFinish && <span className="badge-success">✓ Complete</span>}
          </div>

          {/* Thought */}
          <p className="text-xs text-nexus-text mt-1 line-clamp-2">{step.thought}</p>
        </div>
      </div>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2 pl-9">
              {/* Thought */}
              <div className="glass rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Brain className="w-3 h-3 text-nexus-accent" />
                  <span className="text-[10px] font-medium text-nexus-accent uppercase tracking-wide">Thought</span>
                </div>
                <p className="text-xs text-nexus-text">{step.thought}</p>
              </div>

              {/* Action + Args */}
              {step.action && step.action !== 'FINISH' && step.args && (
                <div className="glass rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Wrench className="w-3 h-3 text-nexus-amber" />
                    <span className="text-[10px] font-medium text-nexus-amber uppercase tracking-wide">Action</span>
                  </div>
                  <code className="text-xs text-nexus-amber font-mono">
                    {step.action}({JSON.stringify(step.args, null, 2)})
                  </code>
                </div>
              )}

              {/* Observation */}
              {step.observation && (
                <div className="glass rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Eye className="w-3 h-3 text-nexus-emerald" />
                    <span className="text-[10px] font-medium text-nexus-emerald uppercase tracking-wide">Observation</span>
                  </div>
                  <p className="text-xs text-nexus-text whitespace-pre-wrap max-h-32 overflow-y-auto">
                    {step.observation}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function AgentPage() {
  const [task, setTask] = useState('');
  const [steps, setSteps] = useState([]);
  const [finalAnswer, setFinalAnswer] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | running | complete | error
  const [stats, setStats] = useState(null);
  const abortRef = useRef(null);
  const stepsEndRef = useRef(null);

  const runAgent = async () => {
    if (!task.trim() || isRunning) return;

    setSteps([]);
    setFinalAnswer('');
    setStats(null);
    setIsRunning(true);
    setStatus('running');

    abortRef.current = new AbortController();

    try {
      const response = await createStream('/agent/execute', {
        method: 'POST',
        body: { task: task.trim(), stream: true },
        signal: abortRef.current.signal,
      });

      if (!response.ok) throw new Error('Agent failed to start');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === 'started') {
              // no-op
            } else if (event.type === 'step_start') {
              setSteps(prev => {
                const exists = prev.find(s => s.stepNumber === event.step.stepNumber);
                if (exists) return prev;
                return [...prev, event.step];
              });
            } else if (event.type === 'step_complete') {
              setSteps(prev => prev.map(s =>
                s.stepNumber === event.step.stepNumber ? event.step : s
              ));
              stepsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            } else if (event.type === 'complete') {
              if (event.step) {
                setSteps(prev => [...prev, event.step]);
              }
            } else if (event.type === 'finished') {
              setFinalAnswer(event.result.finalAnswer);
              setStats({
                executionTime: event.result.executionTime,
                toolsUsed: event.result.toolsUsed,
                stepCount: event.result.steps?.length || 0,
              });
              setStatus('complete');
            }
          } catch {}
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        toast.error('Agent execution failed');
        setStatus('error');
      } else {
        setStatus('idle');
      }
    } finally {
      setIsRunning(false);
    }
  };

  const stopAgent = () => {
    abortRef.current?.abort();
    setIsRunning(false);
    setStatus('idle');
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-nexus-amber/10 flex items-center justify-center">
              <Bot className="w-5 h-5 text-nexus-amber" />
            </div>
            <div>
              <h1 className="font-display font-bold text-white text-xl">AI Agent</h1>
              <p className="text-nexus-muted text-xs">Autonomous multi-step reasoning powered by Groq LPU</p>
            </div>
          </div>

          {/* Task Input */}
          <div className="glass rounded-2xl p-4 space-y-3">
            <label className="text-sm font-medium text-nexus-text">Describe your task</label>
            <textarea
              value={task}
              onChange={e => setTask(e.target.value)}
              placeholder="e.g., Research the top 5 programming languages in 2024 and create a comparison table with pros, cons, and use cases..."
              rows={3}
              disabled={isRunning}
              className="nexus-input resize-none text-sm"
            />

            {/* Examples */}
            <div className="space-y-1.5">
              <p className="text-xs text-nexus-muted">Try an example:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {EXAMPLE_TASKS.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => setTask(ex)}
                    disabled={isRunning}
                    className="text-left text-xs text-nexus-muted hover:text-nexus-text glass rounded-xl px-3 py-2
                    hover:border-nexus-accent/30 transition-all line-clamp-2 disabled:opacity-50"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4 text-xs text-nexus-muted">
                <span>ReAct pattern</span>
                <span>•</span>
                <span>Max 10 steps</span>
                <span>•</span>
                <span>6 tools available</span>
              </div>

              {isRunning ? (
                <button onClick={stopAgent} className="btn-danger flex items-center gap-2 text-sm">
                  <StopCircle className="w-4 h-4" /> Stop
                </button>
              ) : (
                <button
                  onClick={runAgent}
                  disabled={!task.trim()}
                  className="btn-primary flex items-center gap-2 text-sm"
                >
                  <Zap className="w-4 h-4" /> Run Agent
                </button>
              )}
            </div>
          </div>

          {/* Status + Steps */}
          {(steps.length > 0 || isRunning) && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {isRunning
                  ? <Loader2 className="w-4 h-4 text-nexus-accent animate-spin" />
                  : <CheckCircle className="w-4 h-4 text-nexus-emerald" />
                }
                <span className="text-sm font-medium text-nexus-text">
                  {isRunning ? 'Agent is working...' : `Completed in ${(stats?.executionTime / 1000).toFixed(1)}s`}
                </span>
                {stats && (
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs text-nexus-muted">{stats.stepCount} steps</span>
                    {stats.toolsUsed?.map(t => (
                      <span key={t} className="badge-info text-[10px]">{t}</span>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <AnimatePresence>
                  {steps.map((step, i) => (
                    <StepCard key={step.stepNumber} step={step} index={i} />
                  ))}
                </AnimatePresence>
                <div ref={stepsEndRef} />
              </div>
            </div>
          )}

          {/* Final Answer */}
          <AnimatePresence>
            {finalAnswer && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass rounded-2xl p-5 border-nexus-emerald/30"
                style={{ borderColor: 'rgba(16,185,129,0.3)' }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="w-4 h-4 text-nexus-emerald" />
                  <span className="text-sm font-semibold text-nexus-emerald">Final Answer</span>
                </div>
                <div className="prose-nexus text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{finalAnswer}</ReactMarkdown>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
