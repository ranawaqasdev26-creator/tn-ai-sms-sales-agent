import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export interface Agent {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthContextType {
  agent: Agent | null;
  token: string | null;
  /** Validates credentials only — call `enterSession` to open the dashboard. */
  login: (email: string, password: string) => Promise<{ token: string; agent: Agent }>;
  enterSession: (token: string, agent: Agent) => void;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('sales_agent_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (!cancelled) setAgent(data.agent);
      })
      .catch(() => {
        if (cancelled) return;
        // Keep session if login already hydrated agent (cold-start /me race).
        setAgent((current) => {
          if (current) return current;
          localStorage.removeItem('sales_agent_token');
          setToken(null);
          return null;
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const onExpired = () => {
      setToken(null);
      setAgent(null);
    };
    window.addEventListener('sales-agent-auth-expired', onExpired);
    return () => window.removeEventListener('sales-agent-auth-expired', onExpired);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Login failed' }));
      throw new Error(err.error || 'Login failed');
    }
    const data = await res.json();
    return { token: data.token as string, agent: data.agent as Agent };
  };

  const enterSession = (nextToken: string, nextAgent: Agent) => {
    localStorage.setItem('sales_agent_token', nextToken);
    setToken(nextToken);
    setAgent(nextAgent);
  };

  const logout = () => {
    localStorage.removeItem('sales_agent_token');
    setToken(null);
    setAgent(null);
  };

  return (
    <AuthContext.Provider value={{ agent, token, login, enterSession, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
