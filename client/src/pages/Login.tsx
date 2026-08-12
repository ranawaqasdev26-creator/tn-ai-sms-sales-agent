import { useState } from 'react';
import { LogIn, Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type LoginPhase = 'idle' | 'loading' | 'success' | 'error';

export default function Login() {
  const { login, enterSession } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<LoginPhase>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setPhase('loading');
    try {
      const session = await login(email, password);
      setPhase('success');
      // Let the success animation play before opening the dashboard
      await new Promise((r) => setTimeout(r, 850));
      enterSession(session.token, session.agent);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setPhase('error');
    }
  };

  const busy = phase === 'loading' || phase === 'success';

  return (
    <div className="min-h-screen bg-luxury-page flex items-center justify-center p-4 overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-gold-200/30 rounded-full blur-3xl login-blob" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-navy-100/40 rounded-full blur-3xl login-blob login-blob-delay" />
      </div>

      <div className={`w-full max-w-md relative login-enter ${phase === 'success' ? 'login-success-exit' : ''}`}>
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl overflow-hidden mx-auto mb-4 shadow-luxury ring-1 ring-luxury-200 bg-white login-logo">
            <img src="/favicon.svg?v=4" alt="" className="w-full h-full object-cover" />
          </div>
          <h1 className="font-display text-3xl font-semibold text-luxury-900">SMS Sales Agent</h1>
          <p className="text-luxury-500 mt-2">Sign in to access your dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-8 space-y-5 shadow-luxury-lg">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm login-shake">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-luxury-600 mb-1.5">Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={busy}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-luxury-600 mb-1.5">Password</label>
            <div className="relative">
              <input
                className="input pr-11"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={busy}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 px-3 flex items-center text-luxury-400 hover:text-luxury-700 transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={0}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={busy}
            className={`btn-primary w-full flex items-center justify-center gap-2 relative overflow-hidden ${
              phase === 'loading' ? 'login-btn-pulse' : ''
            } ${phase === 'success' ? 'login-btn-success' : ''}`}
          >
            {phase === 'loading' && (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Signing in...
              </>
            )}
            {phase === 'success' && (
              <>
                <CheckCircle2 className="w-4 h-4 login-check" />
                Welcome in
              </>
            )}
            {(phase === 'idle' || phase === 'error') && (
              <>
                <LogIn className="w-4 h-4" />
                Sign In
              </>
            )}
          </button>
          <p className="text-xs text-luxury-400 text-center">
            Login: tech@nationwideadvance.com
          </p>
        </form>
      </div>
    </div>
  );
}
