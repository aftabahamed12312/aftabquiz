import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { homeFor, useAuth } from '../AuthContext';
import { Brand } from '../components/ui';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={homeFor(user)} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const u = await login(username, password);
      navigate(homeFor(u), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-card">
        <Brand size="lg" />
        <p className="muted">Admins, hosts and house leaders sign in here.</p>
        <form onSubmit={submit} className="stack">
          <label className="field">
            <span>Username</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          {error && <div className="banner banner-bad" role="alert">{error}</div>}
          <button className="btn btn-lamp" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <a className="login-link" href="/display" target="_blank" rel="noreferrer">
          Open the stage display
        </a>
      </div>
    </div>
  );
}
