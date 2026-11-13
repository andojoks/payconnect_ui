import { FormEvent, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api, Session } from './api';
import { Shell } from './components/Shell';
import { ProfilesPage } from './pages/Profiles';
import { ProfileLayout } from './pages/ProfileLayout';
import { ProfileOverviewPage } from './pages/ProfileOverview';
import { ProfileTransactionsPage } from './pages/ProfileTransactions';
import { ProfileAlertsPage } from './pages/ProfileAlerts';
import { ProfileAccountPage } from './pages/ProfileAccount';
import { ProfileConfigurationPage } from './pages/ProfileConfiguration';
import { RouteDetailPage } from './pages/RouteDetailPage';
import { RouterPage } from './pages/RouterPage';
import { UsersPage } from './pages/Users';
import { UserDetailPage } from './pages/UserDetail';
import { RolesPage } from './pages/Roles';
import { RoleDetailPage } from './pages/RoleDetail';
import { Eye, EyeOff } from 'lucide-react';

function SessionLoading() {
  return (
    <main className="auth" aria-busy="true" aria-live="polite">
      <section className="auth-card session-loading">
        <span className="brand-mark">P</span>
        <span className="spinner" />
        <h1>Restoring your session…</h1>
        <p>Checking your PayConnect session before loading the workspace.</p>
      </section>
    </main>
  );
}

function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api.login(String(data.get('email')), String(data.get('password')));
      const current = await api.session();
      if (!current.authenticated) throw new Error('Unable to establish a session');
      onLogin(current);
      navigate('/profiles', { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth">
      <section className="auth-card">
        <span className="eyebrow">PAYCONNECT</span>
        <h1>Your money, connected.</h1>
        <p>Securely monitor your provider profiles and payment activity.</p>
        <form onSubmit={submit}>
          <label>
            Email
            <input name="email" type="email" required autoComplete="email" autoFocus />
          </label>
          <label>
            Password
            <div className="input-with-action">
              <input name="password" type={showPassword ? 'text' : 'password'} required autoComplete="current-password" />
              <button
                type="button"
                className="icon-button password-toggle"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          {error && <div className="error">{error}</div>}
          <button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </section>
    </main>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .session()
      .then((value) => setSession(value.authenticated ? value : null))
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, []);

  const login = (value: Session) => setSession(value);
  const logout = () => setSession(null);

  if (loading) return <SessionLoading />;
  if (!session) return <Login onLogin={login} />;

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/profiles" replace />} />
      <Route
        path="/profiles"
        element={
          <Shell session={session} onLogout={logout}>
            <ProfilesPage />
          </Shell>
        }
      />
      <Route
        path="/profiles/:id"
        element={
          <Shell session={session} onLogout={logout}>
            <ProfileLayout />
          </Shell>
        }
      >
        <Route index element={<ProfileOverviewPage />} />
        <Route path="transactions" element={<ProfileTransactionsPage />} />
        <Route path="alerts" element={<ProfileAlertsPage />} />
        <Route path="account" element={<ProfileAccountPage />} />
        <Route path="configuration" element={<ProfileConfigurationPage />} />
        <Route path="connection" element={<Navigate to="../configuration" replace />} />
        <Route path="*" element={<Navigate to=".." replace />} />
      </Route>
      <Route
        path="/router"
        element={
          <Shell session={session} onLogout={logout}>
            <RouterPage session={session} />
          </Shell>
        }
      />
      <Route
        path="/router/:id"
        element={
          <Shell session={session} onLogout={logout}>
            <RouteDetailPage session={session} />
          </Shell>
        }
      />
      <Route
        path="/users"
        element={
          <Shell session={session} onLogout={logout}>
            <UsersPage session={session} />
          </Shell>
        }
      />
      <Route
        path="/users/:id"
        element={
          <Shell session={session} onLogout={logout}>
            <UserDetailPage session={session} />
          </Shell>
        }
      />
      <Route
        path="/roles"
        element={
          <Shell session={session} onLogout={logout}>
            <RolesPage session={session} />
          </Shell>
        }
      />
      <Route
        path="/roles/:id"
        element={
          <Shell session={session} onLogout={logout}>
            <RoleDetailPage session={session} />
          </Shell>
        }
      />
      <Route
        path="/admin"
        element={<Navigate to="/users" replace />}
      />
      <Route path="*" element={<Navigate to="/profiles" replace />} />
    </Routes>
  );
}
