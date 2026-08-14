import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';

export default function AuthCallback() {
  const [params] = useSearchParams();
  const { setToken } = useAuthStore();
  const navigate = useNavigate();
  useEffect(() => {
    const token = params.get('token');
    if (token) { setToken(token); navigate('/chat'); }
    else navigate('/login');
  }, []);
  return <div className="min-h-screen flex items-center justify-center text-nexus-muted">Authenticating...</div>;
}
