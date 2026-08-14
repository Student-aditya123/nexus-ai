import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, Check, Zap } from 'lucide-react';
import { useAuthStore } from '../stores/auth.store';
import api from '../services/api';
import toast from 'react-hot-toast';

export default function BillingPage() {
  const { user } = useAuthStore();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/billing/plans').then(r => setPlans(r.data.data)).catch(() => {});
  }, []);

  const subscribe = async (planId) => {
    if (planId === 'free') return;
    setLoading(true);
    try {
      const { data } = await api.post('/billing/checkout', { planId });
      window.location.href = data.data.url;
    } catch { toast.error('Failed to start checkout'); setLoading(false); }
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="font-display font-bold text-white text-2xl">Billing & Plans</h1>
        <p className="text-nexus-muted text-sm">Current plan: <span className="text-nexus-accent capitalize font-medium">{user?.plan?.type || 'free'}</span></p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((plan, i) => (
            <motion.div key={plan.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
              className={`glass rounded-2xl p-5 ${user?.plan?.type === plan.id ? 'border-nexus-accent glow-accent' : ''}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-semibold text-white">{plan.name}</h3>
                {user?.plan?.type === plan.id && <span className="badge-success text-[10px]">Current</span>}
              </div>
              <p className="text-2xl font-bold text-white mb-1">
                ${plan.price}<span className="text-sm font-normal text-nexus-muted">/mo</span>
              </p>
              <ul className="space-y-1.5 mt-4 mb-5">
                {plan.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-xs text-nexus-text">
                    <Check className="w-3.5 h-3.5 text-nexus-emerald flex-shrink-0" />{f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => subscribe(plan.id)}
                disabled={loading || user?.plan?.type === plan.id}
                className={`w-full py-2 rounded-xl text-sm font-medium transition-all
                  ${user?.plan?.type === plan.id
                    ? 'bg-nexus-surface text-nexus-muted cursor-not-allowed'
                    : 'btn-primary'}`}
              >
                {user?.plan?.type === plan.id ? 'Current Plan' : plan.price === 0 ? 'Downgrade' : 'Upgrade'}
              </button>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
