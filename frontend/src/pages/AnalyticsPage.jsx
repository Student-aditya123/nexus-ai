/**
 * NEXUS AI - Analytics Page
 * Usage analytics with recharts visualization
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import {
  MessageSquare, FileText, Zap, Clock, TrendingUp,
  Bot, BookOpen, BarChart3
} from 'lucide-react';
import api from '../services/api';
import { useAuthStore } from '../stores/auth.store';
import { format, parseISO } from 'date-fns';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e'];

function StatCard({ icon: Icon, label, value, sub, color = 'text-nexus-accent', trend }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-5"
    >
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-xl bg-current/10 flex items-center justify-center ${color}`}>
          <Icon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} />
        </div>
        {trend !== undefined && (
          <span className={`text-xs font-medium ${trend >= 0 ? 'text-nexus-emerald' : 'text-nexus-rose'}`}>
            {trend >= 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-display font-bold text-white">{value}</p>
        <p className="text-sm text-nexus-text mt-0.5">{label}</p>
        {sub && <p className="text-xs text-nexus-muted mt-0.5">{sub}</p>}
      </div>
    </motion.div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-strong rounded-xl p-3 border border-nexus-border text-xs">
      <p className="text-nexus-muted mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-medium">
          {p.name}: {p.value?.toLocaleString()}
        </p>
      ))}
    </div>
  );
};

export default function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [userStats, setUserStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthStore();

  useEffect(() => {
    Promise.all([
      api.get('/analytics/usage'),
      api.get('/users/stats'),
    ]).then(([analyticsRes, statsRes]) => {
      setData(analyticsRes.data.data);
      setUserStats(statsRes.data.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-nexus-muted">Loading analytics...</div>
      </div>
    );
  }

  const summary = data?.summary || {};
  const daily = (data?.daily || []).slice(-14).map(d => ({
    ...d,
    date: format(parseISO(d.date), 'MMM d'),
  }));

  const modeData = [
    { name: 'Chat', value: data?.byMode?.chat || 0 },
    { name: 'Doc Q&A', value: data?.byMode?.rag || 0 },
    { name: 'Agent', value: data?.byMode?.agent || 0 },
  ].filter(d => d.value > 0);

  const tokenPct = user?.plan
    ? Math.round((user.plan.tokensUsed / user.plan.tokenLimit) * 100)
    : 0;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="font-display font-bold text-white text-2xl">Analytics</h1>
          <p className="text-nexus-muted text-sm mt-0.5">Last 30 days · All usage metrics</p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={MessageSquare}
            label="Total Messages"
            value={(summary.totalMessages || 0).toLocaleString()}
            color="text-nexus-accent"
          />
          <StatCard
            icon={Zap}
            label="Tokens Used"
            value={((summary.totalTokens || 0) / 1000).toFixed(1) + 'K'}
            sub={`of ${((user?.plan?.tokenLimit || 100000) / 1000).toFixed(0)}K limit`}
            color="text-nexus-amber"
          />
          <StatCard
            icon={FileText}
            label="Documents"
            value={userStats?.documents || 0}
            color="text-nexus-emerald"
          />
          <StatCard
            icon={Clock}
            label="Avg Latency"
            value={`${Math.round(summary.avgLatency || 0)}ms`}
            sub="Groq LPU speed"
            color="text-nexus-rose"
          />
        </div>

        {/* Token Usage Bar */}
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-nexus-text">Token Budget</h3>
            <span className="text-sm text-nexus-muted">
              {(user?.plan?.tokensUsed || 0).toLocaleString()} / {(user?.plan?.tokenLimit || 100000).toLocaleString()}
            </span>
          </div>
          <div className="h-2.5 bg-nexus-border rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(tokenPct, 100)}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className={`h-full rounded-full ${
                tokenPct > 90 ? 'bg-nexus-rose' :
                tokenPct > 70 ? 'bg-nexus-amber' : 'bg-nexus-accent'
              }`}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-xs text-nexus-muted capitalize">{user?.plan?.type || 'free'} plan</span>
            <span className="text-xs text-nexus-muted">{tokenPct}% used</span>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Message Volume */}
          <div className="glass rounded-2xl p-5 lg:col-span-2">
            <h3 className="font-medium text-nexus-text mb-4">Message Volume (14 days)</h3>
            {daily.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={daily}>
                  <defs>
                    <linearGradient id="msgGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="messages" name="Messages" stroke="#6366f1" fill="url(#msgGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-44 flex items-center justify-center text-nexus-muted text-sm">
                No data yet. Start chatting!
              </div>
            )}
          </div>

          {/* Mode distribution */}
          <div className="glass rounded-2xl p-5">
            <h3 className="font-medium text-nexus-text mb-4">Usage by Mode</h3>
            {modeData.length > 0 ? (
              <div className="space-y-4">
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie data={modeData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} dataKey="value" strokeWidth={0}>
                      {modeData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5">
                  {modeData.map((d, i) => (
                    <div key={d.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i] }} />
                        <span className="text-nexus-muted">{d.name}</span>
                      </div>
                      <span className="text-nexus-text font-medium">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-44 flex items-center justify-center text-nexus-muted text-sm">No sessions yet</div>
            )}
          </div>
        </div>

        {/* Token Usage Over Time */}
        {daily.length > 0 && (
          <div className="glass rounded-2xl p-5">
            <h3 className="font-medium text-nexus-text mb-4">Token Consumption (14 days)</h3>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="tokens" name="Tokens" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
