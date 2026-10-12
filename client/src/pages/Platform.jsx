import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Plus, Power, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { api } from '../api';
import { TopBar, Toast, useToast } from '../components/ui';
import { useNavigate } from 'react-router-dom';

const EMPTY_FORM = { title: '', adminName: '', username: '', password: '' };

export default function Platform() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { toast, notify } = useToast();
  const [tenants, setTenants] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [resetId, setResetId] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', password: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTenants(await api.get('/platform/tenants'));
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { load(); }, [load]);

  const createTenant = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post('/platform/tenants', form);
      setForm(EMPTY_FORM);
      notify('Quiz and Admin account created');
      await load();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleTenant = async (tenant) => {
    try {
      await api.patch(`/platform/tenants/${tenant._id}/status`, { active: !tenant.active });
      notify(tenant.active ? 'Quiz deactivated' : 'Quiz activated');
      await load();
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const resetPassword = async (event, tenant) => {
    event.preventDefault();
    try {
      await api.post(`/platform/tenants/${tenant._id}/admin-password`, { password: newPassword });
      setNewPassword('');
      setResetId(null);
      notify('Admin password reset');
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const changeOwnPassword = async (event) => {
    event.preventDefault();
    try {
      await api.patch('/platform/password', passwordForm);
      setPasswordForm({ currentPassword: '', password: '' });
      logout();
      navigate('/login', { replace: true });
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  return (
    <>
      <TopBar
        user={user}
        onLogout={logout}
        connected={null}
        links={[
          { to: '/platform', label: 'Platform' },
          { to: '/display', label: 'Stage display', external: true },
        ]}
      />
      <main className="page platform-page">
        <section className="card platform-intro">
          <div className="row">
            <ShieldCheck size={22} aria-hidden="true" />
            <div>
              <h1 className="card-title">Platform administration</h1>
              <p className="muted">Create and manage independent quiz tenants.</p>
            </div>
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">Create a quiz</h2>
          <form className="platform-create-form" onSubmit={createTenant}>
            <label className="field">
              <span>Quiz title</span>
              <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength={100} required />
            </label>
            <label className="field">
              <span>Admin name</span>
              <input value={form.adminName} onChange={(event) => setForm({ ...form, adminName: event.target.value })} required />
            </label>
            <label className="field">
              <span>Admin username</span>
              <input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} autoComplete="off" minLength={3} maxLength={30} required />
            </label>
            <label className="field">
              <span>Initial Admin password</span>
              <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="new-password" minLength={8} required />
            </label>
            <button className="btn btn-lamp" disabled={busy}>
              <Plus size={17} aria-hidden="true" />{busy ? 'Creating…' : 'Create quiz'}
            </button>
          </form>
        </section>

        <section className="card">
          <h2 className="card-title"><KeyRound size={18} aria-hidden="true" /> Change Super Admin password</h2>
          <form className="platform-reset-form" onSubmit={changeOwnPassword}>
            <label className="field">
              <span>Current password</span>
              <input type="password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })} autoComplete="current-password" required />
            </label>
            <label className="field">
              <span>New password</span>
              <input type="password" value={passwordForm.password} onChange={(event) => setPasswordForm({ ...passwordForm, password: event.target.value })} autoComplete="new-password" minLength={8} required />
            </label>
            <button className="btn btn-lamp">Change password</button>
          </form>
        </section>

        <section className="card">
          <div className="row-between">
            <div>
              <h2 className="card-title">Quizzes</h2>
              <p className="muted">Activity totals are scoped to each quiz.</p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
              <RefreshCw size={15} aria-hidden="true" /> Refresh
            </button>
          </div>

          {loading ? <p className="empty">Loading quizzes…</p> : tenants.length === 0 ? (
            <p className="empty">No quizzes yet. Create one above.</p>
          ) : (
            <div className="platform-list">
              {tenants.map((tenant) => (
                <article className="platform-tenant" key={tenant._id}>
                  <div className="row-between platform-tenant-head">
                    <div>
                      <div className="row">
                        <h3>{tenant.title}</h3>
                        <span className={`platform-status ${tenant.active ? 'active' : ''}`}>{tenant.active ? 'Active' : 'Inactive'}</span>
                      </div>
                      {tenant.admin && <p className="muted">Admin account: <b>{tenant.admin.username}</b></p>}
                      <p className="muted">Public display: <a href={`/display?tenant=${encodeURIComponent(tenant.slug)}`} target="_blank" rel="noreferrer">/display?tenant={tenant.slug}</a></p>
                    </div>
                    <div className="row">
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleTenant(tenant)}>
                        <Power size={15} aria-hidden="true" />{tenant.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button className="btn btn-ink btn-sm" onClick={() => { setResetId(resetId === tenant._id ? null : tenant._id); setNewPassword(''); }}>
                        Reset Admin password
                      </button>
                    </div>
                  </div>
                  <dl className="platform-counts">
                    <div><dt>Accounts</dt><dd>{tenant.counts.users}</dd></div>
                    <div><dt>Houses</dt><dd>{tenant.counts.houses}</dd></div>
                    <div><dt>Rounds</dt><dd>{tenant.counts.rounds}</dd></div>
                    <div><dt>Questions</dt><dd>{tenant.counts.questions}</dd></div>
                    <div><dt>Activity logs</dt><dd>{tenant.counts.activity}</dd></div>
                  </dl>
                  {resetId === tenant._id && (
                    <form className="platform-reset-form" onSubmit={(event) => resetPassword(event, tenant)}>
                      <label className="field">
                        <span>New Admin password</span>
                        <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={8} required />
                      </label>
                      <button className="btn btn-lamp">Set new password</button>
                    </form>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
      <Toast toast={toast} />
    </>
  );
}
