import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { restoreDemoStateFromLocalStorage } from '../demoPersist';

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
  /** True after localStorage demo state has been restored into the server (or skipped). */
  demoReady: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('sales_agent_token'));
  const [loading, setLoading] = useState(true);
  const [demoReady, setDemoReady] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setDemoReady(false);
      return;
    }
    let cancelled = false;
    (async () => {
      let sessionOk = false;
      try {
        const r = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
        if (r.ok) {
          const data = await r.json();
          if (cancelled) return;
          setAgent(data.agent);
          sessionOk = true;
        } else {
          // Keep session if login already hydrated agent (cold-start /me race).
          setAgent((current) => {
            if (current) {
              sessionOk = true;
              return current;
            }
            localStorage.removeItem('sales_agent_token');
            setToken(null);
            return null;
          });
        }
      } catch {
        setAgent((current) => {
          if (current) {
            sessionOk = true;
            return current;
          }
          localStorage.removeItem('sales_agent_token');
          setToken(null);
          return null;
        });
      }

      if (cancelled) return;

      if (sessionOk) {
        // Do NOT export/persist here — a separate serverless instance can return seed
        // data and wipe the browser backup (names/messages change on refresh).
        // Page loads use /demo/run which imports localStorage atomically per request.
        try {
          await restoreDemoStateFromLocalStorage();
        } catch (err) {
          console.warn('[demo-persist] restore failed', err);
        }
        if (!cancelled) setDemoReady(true);
      } else {
        setDemoReady(false);
      }

      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const onExpired = () => {
      setToken(null);
      setAgent(null);
      setDemoReady(false);
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
    setDemoReady(false);
    setToken(nextToken);
    setAgent(nextAgent);
  };

  const logout = () => {
    localStorage.removeItem('sales_agent_token');
    setToken(null);
    setAgent(null);
    setDemoReady(false);
  };

  return (
    <AuthContext.Provider value={{ agent, token, login, enterSession, logout, loading, demoReady }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
