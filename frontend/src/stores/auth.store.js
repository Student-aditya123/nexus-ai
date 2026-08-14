/**
 * NEXUS AI - Auth Store (Zustand)
 * Global auth state management with persistence
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../services/api';
import toast from 'react-hot-toast';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const { data } = await api.post('/auth/login', { email, password });
          set({
            user: data.data.user,
            accessToken: data.data.accessToken,
            isAuthenticated: true,
            isLoading: false,
          });
          api.defaults.headers.common['Authorization'] = `Bearer ${data.data.accessToken}`;
          toast.success(`Welcome back, ${data.data.user.name}!`);
          return true;
        } catch (err) {
          set({ isLoading: false });
          toast.error(err.response?.data?.message || 'Login failed');
          return false;
        }
      },

      register: async (name, email, password) => {
        set({ isLoading: true });
        try {
          const { data } = await api.post('/auth/register', { name, email, password });
          set({
            user: data.data.user,
            accessToken: data.data.accessToken,
            isAuthenticated: true,
            isLoading: false,
          });
          api.defaults.headers.common['Authorization'] = `Bearer ${data.data.accessToken}`;
          toast.success('Account created! Welcome to Nexus AI 🚀');
          return true;
        } catch (err) {
          set({ isLoading: false });
          toast.error(err.response?.data?.message || 'Registration failed');
          return false;
        }
      },

      logout: async () => {
        try {
          await api.post('/auth/logout');
        } catch {}
        delete api.defaults.headers.common['Authorization'];
        set({ user: null, accessToken: null, isAuthenticated: false });
        toast.success('Logged out successfully');
      },

      refreshToken: async () => {
        try {
          const { data } = await api.post('/auth/refresh');
          set({ accessToken: data.data.accessToken });
          api.defaults.headers.common['Authorization'] = `Bearer ${data.data.accessToken}`;
          return data.data.accessToken;
        } catch {
          get().logout();
          return null;
        }
      },

      updateUser: (updates) => set(state => ({ user: { ...state.user, ...updates } })),

      setToken: (token) => {
        set({ accessToken: token, isAuthenticated: true });
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      },
    }),
    {
      name: 'nexus-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
