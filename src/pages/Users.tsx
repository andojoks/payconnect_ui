import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, AdminUser, Session } from '../api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useGlobalSearch, usePageMeta, useToast } from '../components/layout/Shell';
import { cx } from '../lib/format';
import { ChevronRight, Plus, UserCog, X } from 'lucide-react';

type Props = { session: Session };

export function UsersPage({ session }: Props) {
  usePageMeta({ title: 'Users' });
  const { query } = useGlobalSearch();
  const { pushToast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);

  const canManage = Boolean(session.isRoot || session.permissions?.includes('users:manage'));

  async function load(showSpinner = false) {
    if (showSpinner) setLoading(true);
    try {
      setUsers(await api.adminUsers());
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load users');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(true); }, []);



  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return users;
    return users.filter((u) => [u.email, u.id, ...(u.roles || [])].some((v) => String(v).toLowerCase().includes(search)));
  }, [users, query]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.createAdminUser(email.trim(), password);
      pushToast({ title: 'User created', body: `${email.trim()} can now sign in.`, tone: 'success' });
      setShowCreate(false); setEmail(''); setPassword('');
      await load();
    } catch (cause) {
      pushToast({ title: 'Unable to create user', body: cause instanceof Error ? cause.message : 'Request failed', tone: 'danger' });
    } finally { setBusy(false); }
  }

  async function removeUser() {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await api.deleteAdminUser(confirmDelete.id);
      pushToast({ title: 'User deleted', body: `${confirmDelete.email} was removed.`, tone: 'success' });
      setConfirmDelete(null);
      await load();
    } catch (cause) {
      pushToast({ title: 'Delete failed', body: cause instanceof Error ? cause.message : 'Unable to delete user', tone: 'danger' });
    } finally { setBusy(false); }
  }

  if (!session.isRoot && !session.permissions?.includes('users:view') && !session.permissions?.includes('users:manage')) {
    return <div className="page"><div className="empty-state"><h2>Users access required</h2><p>Your account does not have permission to view users.</p></div></div>;
  }

  return (
    <div className="page">
      {error && <div className="error">{error}</div>}

      <section className="stack-lg">
        <div className="page-toolbar">
          <div>
            <h2>User profiles</h2>
            <p>Accounts with access to PayConnect workspaces and profiles.</p>
          </div>
          <div className="page-actions">
            {canManage && (
              <button className="primary" onClick={() => setShowCreate(true)}>
                <Plus size={18} /> New user
              </button>
            )}
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Status</th>
                <th>Roles</th>
                <th>Created</th>
                <th>User ID</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="entity-cell">
                      <span className="entity-avatar"><UserCog size={18} /></span>
                      <div>
                        <strong>{user.email}</strong>
                        <small>{user.isRoot ? 'Root account' : user.isAdmin ? 'Admin' : 'Member'}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="status-stack">
                      <span className={cx('pill', user.disabled ? 'warn' : 'ok')}>{user.disabled ? 'Disabled' : 'Active'}</span>
                      <span className="muted small-text">{user.roles?.length ?? 0} role{(user.roles?.length ?? 0) === 1 ? '' : 's'}</span>
                    </div>
                  </td>
                  <td>
                    <div className="table-metrics">
                      {(user.roles?.length ? user.roles : ['—']).slice(0, 3).map((r) => <span key={r} className="tag">{r}</span>)}
                    </div>
                  </td>
                  <td><strong className="small-text">{new Date(user.createdAt).toLocaleDateString()}</strong><small className="cell-sub">{new Date(user.createdAt).toLocaleTimeString()}</small></td>
                  <td><code className="mono">{user.id.slice(0, 8)}</code></td>
                  <td className="right">
                    <div className="row-actions">
                      <Link className="ghost small" to={`/users/${user.id}`}>Details <ChevronRight size={18} /></Link>
                      {canManage && !user.isRoot && (
                        <button className="ghost small danger-text" onClick={() => setConfirmDelete(user)}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={6}><p className="muted empty-inline">No users match your search.</p></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showCreate && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="create-user-title">
            <div className="modal-header">
              <div><span className="eyebrow">USER</span><h2 id="create-user-title">Create user</h2></div>
              <button className="icon-button" onClick={() => setShowCreate(false)} aria-label="Close"><X size={18} /></button>
            </div>
            <form className="stack" onSubmit={create}>
              <label className="field"><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
              <label className="field"><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={12} required /></label>
              <p className="muted small-text">New users are assigned the viewer role by default.</p>
              <div className="modal-actions">
                <button type="button" className="ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                <button className="primary" disabled={busy}>{busy ? 'Creating…' : 'Create user'}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${confirmDelete.email}?`}
          description="This removes the user account and its access. This action cannot be undone."
          confirmLabel="Delete user"
          busy={busy}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void removeUser()}
        />
      )}
    </div>
  );
}
