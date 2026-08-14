/**
 * NEXUS AI - Auth Pages (Login + Register)
 */

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Zap, Cpu, ArrowRight, Loader2 } from 'lucide-react';
import { useAuthStore } from '../stores/auth.store';

function AuthLayout({ children, title, subtitle }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-nexus-bg" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-nexus-accent/5 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-nexus-emerald/5 rounded-full blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-nexus-accent mx-auto flex items-center justify-center glow-accent mb-4">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <h1 className="font-display font-bold text-white text-2xl">{title}</h1>
          <p className="text-nexus-muted text-sm mt-1">{subtitle}</p>
        </div>

        <div className="glass rounded-2xl p-6 border border-nexus-border">
          {children}
        </div>

        {/* Groq badge */}
        <div className="flex items-center justify-center gap-1.5 mt-4 text-xs text-nexus-muted">
          <Cpu className="w-3 h-3 text-nexus-emerald" />
          <span>Powered by Groq LPU · Ultra-fast AI inference</span>
        </div>
      </motion.div>
    </div>
  );
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const { login, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const success = await login(email, password);
    if (success) navigate('/chat');
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your Nexus AI account">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-medium text-nexus-muted block mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="nexus-input text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-nexus-muted block mb-1.5">Password</label>
          <div className="relative">
            <input
              type={showPwd ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="nexus-input text-sm pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPwd(!showPwd)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-nexus-muted hover:text-nexus-text"
            >
              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <button type="submit" disabled={isLoading} className="btn-primary w-full flex items-center justify-center gap-2">
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Sign In <ArrowRight className="w-4 h-4" /></>}
        </button>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-nexus-border" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-nexus-card px-3 text-xs text-nexus-muted">or</span>
          </div>
        </div>

        <a
          href="/api/v1/auth/google"
          className="flex items-center justify-center gap-2 w-full glass rounded-xl py-2.5 text-sm text-nexus-text hover:border-nexus-accent/50 transition-all"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Continue with Google
        </a>
      </form>

      <p className="text-center text-xs text-nexus-muted mt-5">
        Don't have an account?{' '}
        <Link to="/register" className="text-nexus-accent hover:text-nexus-accent-glow">Create one free</Link>
      </p>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [showPwd, setShowPwd] = useState(false);
  const { register, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const success = await register(form.name, form.email, form.password);
    if (success) navigate('/chat');
  };

  return (
    <AuthLayout title="Create your account" subtitle="Start using Nexus AI for free">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-medium text-nexus-muted block mb-1.5">Full Name</label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="Your name"
            required minLength={2}
            className="nexus-input text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-nexus-muted block mb-1.5">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            placeholder="you@example.com"
            required
            className="nexus-input text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-nexus-muted block mb-1.5">
            Password <span className="text-nexus-muted font-normal">(min 8 chars, 1 uppercase, 1 number)</span>
          </label>
          <div className="relative">
            <input
              type={showPwd ? 'text' : 'password'}
              value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              placeholder="Create a strong password"
              required minLength={8}
              className="nexus-input text-sm pr-10"
            />
            <button type="button" onClick={() => setShowPwd(!showPwd)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-nexus-muted hover:text-nexus-text">
              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <button type="submit" disabled={isLoading} className="btn-primary w-full flex items-center justify-center gap-2">
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Create Account <ArrowRight className="w-4 h-4" /></>}
        </button>
      </form>

      <p className="text-center text-xs text-nexus-muted mt-5">
        Already have an account?{' '}
        <Link to="/login" className="text-nexus-accent hover:text-nexus-accent-glow">Sign in</Link>
      </p>
    </AuthLayout>
  );
}

export default LoginPage;
