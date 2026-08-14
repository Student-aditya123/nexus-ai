import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import './index.css';

// Pages
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardLayout from './components/layout/DashboardLayout';
import ChatPage from './pages/ChatPage';
import DocumentsPage from './pages/DocumentsPage';
import AgentPage from './pages/AgentPage';
import AnalyticsPage from './pages/AnalyticsPage';
import SettingsPage from './pages/SettingsPage';
import BillingPage from './pages/BillingPage';
import AuthCallback from './pages/AuthCallback';

// Auth guard
import { useAuthStore } from './stores/auth.store';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

const PublicRoute = ({ children }) => {
  const { isAuthenticated } = useAuthStore();
  return !isAuthenticated ? children : <Navigate to="/chat" replace />;
};

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Protected */}
        <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/chat" replace />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="chat/:sessionId" element={<ChatPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="agent" element={<AgentPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="billing" element={<BillingPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Routes>

      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#161b27',
            color: '#e2e8f0',
            border: '1px solid #1e2535',
            borderRadius: '12px',
            fontFamily: 'Sora, sans-serif',
            fontSize: '14px',
          },
          success: { iconTheme: { primary: '#10b981', secondary: '#161b27' } },
          error: { iconTheme: { primary: '#f43f5e', secondary: '#161b27' } },
        }}
      />
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
