import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, MessageSquare, BarChart3, Settings, Radio,
  Zap, LogOut, User, Users, FileArchive, CheckCircle2, BookOpen,
} from 'lucide-react';

import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import Conversations from './pages/Conversations';
import Analytics from './pages/Analytics';
import PdfCompressor from './pages/PdfCompressor';
import SettingsPage from './pages/Settings';
import DocsPage from './pages/Docs';
import Login from './pages/Login';
import NotificationBell from './components/NotificationBell';
import { useWebSocket } from './hooks/useWebSocket';
import { useAuth } from './context/AuthContext';
import { useState, useCallback, useEffect } from 'react';
import { api } from './api';

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/leads', icon: Users, label: 'Leads' },
  { to: '/conversations', icon: MessageSquare, label: 'Conversations' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/pdf-compressor', icon: FileArchive, label: 'PDF Compressor' },
  { to: '/docs', icon: BookOpen, label: 'Docs' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];
function AppShell() {
  const location = useLocation();
  const { agent, logout } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const [demoMode, setDemoMode] = useState<boolean | null>(null);

  const handleWSEvent = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const { connected } = useWebSocket(handleWSEvent);

  useEffect(() => {
    api.getSettings().then((s) => setDemoMode(s.integrations.demoMode)).catch(() => {});
  }, [refreshKey]);

  return (
    <div className="flex h-screen overflow-hidden bg-luxury-page">
      <aside className="w-64 bg-luxury-sidebar border-r border-luxury-200 flex flex-col shrink-0 shadow-luxury">
        <div className="p-5 border-b border-luxury-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden shadow-luxury ring-1 ring-luxury-200 bg-white shrink-0">
              <img src="/favicon.svg?v=4" alt="" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="font-display font-semibold text-lg leading-tight text-luxury-900">SMS Agent</h1>
              <p className="text-xs text-luxury-500">AI-Powered Sales</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-gold-50 text-navy-800 border border-gold-200 shadow-sm'
                    : 'text-luxury-500 hover:text-luxury-800 hover:bg-white/60'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-luxury-200 space-y-3 bg-white/40">
          <div className="flex items-center gap-2 text-xs">
            <Radio className={`w-3.5 h-3.5 ${connected ? 'text-emerald-600' : 'text-amber-600'}`} />
            <span className={connected ? 'text-emerald-700 font-medium' : 'text-amber-700 font-medium'}>
              {connected ? 'Live' : 'Polling'}
            </span>
          </div>
          {demoMode !== false && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gold-50 border border-gold-200">
              <Zap className="w-4 h-4 text-gold-600 shrink-0" />
              <span className="text-xs text-gold-700 font-medium">Demo Mode Active</span>
            </div>
          )}
          {demoMode === false && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="text-xs text-emerald-700 font-medium">Live — Real AI Active</span>
            </div>
          )}
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-luxury-600">
            <User className="w-4 h-4" />
            <span className="flex-1 truncate font-medium">{agent?.name}</span>
            <button onClick={logout} className="p-1 hover:text-luxury-900 transition-colors" title="Logout">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <header className="sticky top-0 z-10 bg-white/75 backdrop-blur-md border-b border-luxury-200 px-6 py-4 flex items-center justify-between shadow-sm">
          <h2 className="page-title capitalize">
            {location.pathname === '/' ? 'Dashboard' : location.pathname.slice(1).replace(/-/g, ' ')}
          </h2>
          <NotificationBell />
        </header>
        <div className="p-6">
          <Routes>
            <Route path="/" element={<Dashboard refreshKey={refreshKey} />} />
            <Route path="/leads" element={<Leads refreshKey={refreshKey} />} />
            <Route path="/conversations" element={<Conversations refreshKey={refreshKey} />} />
            <Route path="/analytics" element={<Analytics refreshKey={refreshKey} />} />
            <Route path="/pdf-compressor" element={<PdfCompressor />} />
            <Route path="/docs" element={<DocsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const { agent, loading, demoReady } = useAuth();

  if (loading || (agent && !demoReady)) {
    return (
      <div className="min-h-screen bg-luxury-page flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-gold-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!agent) return <Login />;

  return <AppShell />;
}
