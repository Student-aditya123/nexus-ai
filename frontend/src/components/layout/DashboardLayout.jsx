/**
 * NEXUS AI - Dashboard Layout
 * Main app shell with animated sidebar + content area
 */

import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, FileText, Bot, BarChart3, Settings,
  CreditCard, LogOut, Menu, X, Zap, ChevronRight,
  Bell, User, Cpu
} from 'lucide-react';
import { useAuthStore } from '../../stores/auth.store';
import UserMenu from './UserMenu';
import TokenUsageBar from '../ui/TokenUsageBar';

const NAV_ITEMS = [
  { path: '/chat', icon: MessageSquare, label: 'Chat', badge: null },
  { path: '/documents', icon: FileText, label: 'Documents', badge: null },
  { path: '/agent', icon: Bot, label: 'AI Agent', badge: 'NEW' },
  { path: '/analytics', icon: BarChart3, label: 'Analytics', badge: null },
];

const BOTTOM_ITEMS = [
  { path: '/billing', icon: CreditCard, label: 'Billing' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-nexus-border">
        <div className="w-8 h-8 rounded-xl bg-nexus-accent flex items-center justify-center glow-accent flex-shrink-0">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
            >
              <span className="font-display font-bold text-white text-lg tracking-tight">Nexus AI</span>
              <div className="flex items-center gap-1 mt-0.5">
                <Cpu className="w-2.5 h-2.5 text-nexus-emerald" />
                <span className="text-[10px] text-nexus-emerald font-medium">Groq LPU</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ path, icon: Icon, label, badge }) => (
          <NavLink key={path} to={path} onClick={() => setMobileOpen(false)}>
            {({ isActive }) => (
              <div className={`sidebar-item ${isActive ? 'active' : ''}`}>
                <Icon className="w-4 h-4 flex-shrink-0" />
                <AnimatePresence>
                  {sidebarOpen && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex-1 truncate"
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
                {badge && sidebarOpen && (
                  <span className="badge-info text-[10px] py-0">{badge}</span>
                )}
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Token Usage */}
      {sidebarOpen && user && (
        <div className="px-4 pb-2">
          <TokenUsageBar
            used={user.plan?.tokensUsed || 0}
            limit={user.plan?.tokenLimit || 100000}
            plan={user.plan?.type || 'free'}
          />
        </div>
      )}

      {/* Bottom Items */}
      <div className="px-3 py-3 border-t border-nexus-border space-y-1">
        {BOTTOM_ITEMS.map(({ path, icon: Icon, label }) => (
          <NavLink key={path} to={path} onClick={() => setMobileOpen(false)}>
            {({ isActive }) => (
              <div className={`sidebar-item ${isActive ? 'active' : ''}`}>
                <Icon className="w-4 h-4 flex-shrink-0" />
                {sidebarOpen && <span className="truncate">{label}</span>}
              </div>
            )}
          </NavLink>
        ))}

        <button onClick={handleLogout} className="sidebar-item w-full text-nexus-rose hover:bg-nexus-rose/10 hover:text-nexus-rose">
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {sidebarOpen && <span>Log out</span>}
        </button>
      </div>

      {/* User Info */}
      {sidebarOpen && user && (
        <div className="px-3 pb-4">
          <div className="glass rounded-xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-nexus-accent-dim flex items-center justify-center flex-shrink-0">
              {user.avatar
                ? <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full object-cover" />
                : <User className="w-4 h-4 text-nexus-accent-glow" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-nexus-text truncate">{user.name}</p>
              <p className="text-xs text-nexus-muted truncate">{user.plan?.type || 'free'} plan</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-nexus-bg">
      {/* Desktop Sidebar */}
      <motion.aside
        animate={{ width: sidebarOpen ? 240 : 64 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="hidden md:flex flex-col glass-strong border-r border-nexus-border flex-shrink-0 relative z-20"
      >
        <SidebarContent />

        {/* Collapse toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full
          bg-nexus-surface border border-nexus-border flex items-center justify-center
          hover:border-nexus-accent transition-colors z-10"
        >
          <ChevronRight
            className={`w-3 h-3 text-nexus-muted transition-transform duration-200 ${sidebarOpen ? 'rotate-180' : ''}`}
          />
        </button>
      </motion.aside>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-30 md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -240 }}
              animate={{ x: 0 }}
              exit={{ x: -240 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 bottom-0 w-60 glass-strong border-r border-nexus-border z-40 md:hidden"
            >
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-nexus-border glass-strong">
          <button onClick={() => setMobileOpen(true)} className="btn-ghost p-2">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-nexus-accent" />
            <span className="font-display font-bold text-white">Nexus AI</span>
          </div>
          <div className="w-10" />
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
