import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, User, Bell, Shield, Palette } from 'lucide-react';
import { useAuthStore } from '../stores/auth.store';
import toast from 'react-hot-toast';
import api from '../services/api';

export default function SettingsPage() {
  const { user, updateUser } = useAuthStore();
  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);

  const saveProfile = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch('/auth/profile', { name });
      updateUser({ name: data.data.name });
      toast.success('Profile updated');
    } catch { toast.error('Failed to update profile'); }
    finally { setSaving(false); }
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="font-display font-bold text-white text-2xl">Settings</h1>

        <div className="glass rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-4 h-4 text-nexus-accent" />
            <h2 className="font-semibold text-nexus-text">Profile</h2>
          </div>
          <div>
            <label className="text-xs text-nexus-muted block mb-1.5">Display Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="nexus-input text-sm" />
          </div>
          <div>
            <label className="text-xs text-nexus-muted block mb-1.5">Email</label>
            <input value={user?.email || ''} disabled className="nexus-input text-sm opacity-60 cursor-not-allowed" />
          </div>
          <div>
            <label className="text-xs text-nexus-muted block mb-1.5">Plan</label>
            <span className="badge-info capitalize">{user?.plan?.type || 'free'}</span>
          </div>
          <button onClick={saveProfile} disabled={saving} className="btn-primary text-sm">{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>

        <div className="glass rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4 text-nexus-emerald" />
            <h2 className="font-semibold text-nexus-text">Security</h2>
          </div>
          <div className="text-sm text-nexus-muted space-y-2">
            <p>Auth provider: <span className="text-nexus-text capitalize">{user?.authProvider || 'local'}</span></p>
            <p>Account created: <span className="text-nexus-text">{user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}
