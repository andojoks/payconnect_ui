import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, AdminUserDetail, ProfileSummary, Role, Service, Session } from '../api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { usePageActions, usePageMeta, useToast } from '../components/layout/Shell';
import { cx } from '../lib/format';
import { ArrowLeft, Shield, Trash2, UserCog } from 'lucide-react';

type Props = { session: Session };
type Tab = 'roles' | 'profiles';

export function UserDetailPage({ session }: Props) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [roleToAdd, setRoleToAdd] = useState('');
  const [profileToAdd, setProfileToAdd] = useState('');
  const [tab, setTab] = useState<Tab>('roles');

  const canManage = Boolean(session.isRoot || session.permissions?.includes('users:manage'));
  const canManageRoles = Boolean(session.isRoot || session.permissions?.includes('roles:manage'));

  usePageMeta({ title: user?.email ?? 'User details' });

  async function load(showSpinner = false) {
    if (showSpinner) setLoading(true);
    try {
      const [u, r, p, s] = await Promise.all([
        api.adminUser(id),
        api.adminRoles().catch(() => [] as Role[]),
        api.profiles().catch(() => [] as ProfileSummary[]),
        api.services().catch(() => [] as Service[]),
      ]);
      setUser(u); setRoles(r); setProfiles(p); setServices(s);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load user');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(true); }, [id]);

  const pageActions = useMemo(
    () => (canManage && user && !user.isRoot
      ? <button className="ghost small danger-text" onClick={() => setConfirmDelete(true)}><Trash2 size={18} /> Delete user</button>
      : null),
    [canManage, user],
  );
  usePageActions(pageActions);

  async function removeUser() {
    if (!user) return;
    setBusy('delete');
    try {
      await api.deleteAdminUser(user.id);
      pushToast({ title: 'User deleted', body: `${user.email} was removed.`, tone: 'success' });
      navigate('/users');
    } catch (cause) {
      pushToast({ title: 'Delete failed', body: cause instanceof Error ? cause.message : 'Unable to delete user', tone: 'danger' });
    } finally { setBusy(''); setConfirmDelete(false); }
  }

  async function toggleDisabled() {
    if (!user) return;
    setBusy('disable');
    try {
      await api.updateAdminUser(user.id, { disabled: !user.disabled });
      pushToast({ title: user.disabled ? 'User enabled' : 'User disabled', body: `${user.email} access updated.`, tone: 'success' });
      await load();
    } catch (cause) {
      pushToast({ title: 'Update failed', body: cause instanceof Error ? cause.message : 'Unable to update user', tone: 'danger' });
    } finally { setBusy(''); }
  }

  async function assignRole() {
    if (!user || !roleToAdd) return;
    setBusy('role-add');
    try {
      await api.assignRole(user.id, roleToAdd);
      setRoleToAdd('');
      await load();
      pushToast({ title: 'Role assigned', body: 'User roles updated.', tone: 'success' });
    } catch (cause) {
      pushToast({ title: 'Unable to assign role', body: cause instanceof Error ? cause.message : 'Request failed', tone: 'danger' });
    } finally { setBusy(''); }
  }

  async function detachRole(roleId: string, roleName: string) {
    if (!user) return;
    setBusy(`role-${roleId}`);
    try {
      await api.revokeUserRole(user.id, roleId);
      await load();
      pushToast({ title: 'Role detached', body: `${roleName} removed from ${user.email}.`, tone: 'success' });
    } catch (cause) {
      pushToast({ title: 'Unable to detach role', body: cause instanceof Error ? cause.message : 'Request failed', tone: 'danger' });
    } finally { setBusy(''); }
  }

  async function grantProfileAccess() {
    if (!user || !profileToAdd) return;
    setBusy('profile-add');
    try {
      await api.grantProfileAccess(user.id, profileToAdd);
      setProfileToAdd('');
      await load();
      pushToast({ title: 'Profile access granted', body: 'Visible profiles updated.', tone: 'success' });
    } catch (cause) {
      pushToast({ title: 'Unable to grant access', body: cause instanceof Error ? cause.message : 'Request failed', tone: 'danger' });
    } finally { setBusy(''); }
  }

  async function revokeProfile(profileId: string) {
    if (!user) return;
    setBusy(`profile-${profileId}`);
    try {
      await api.revokeProfileAccess(user.id, profileId);
      await load();
      pushToast({ title: 'Profile access removed', body: 'Visible profiles updated.', tone: 'success' });
    } catch (cause) {
      pushToast({ title: 'Unable to revoke access', body: cause instanceof Error ? cause.message : 'Request failed', tone: 'danger' });
    } finally { setBusy(''); }
  }

  const availableRoles = useMemo(() => roles.filter((r) => !user?.roles.some((ur) => ur.id === r.id)), [roles, user]);
  const availableProfiles = useMemo(() => profiles.filter((p) => !user?.profileAccess.some((a) => a.profileId === p.id)), [profiles, user]);
  const visibleProfileIds = new Set(user?.profileAccess.map((a) => a.profileId) ?? []);
  const routingVisible = useMemo(() => services.filter((s) => s.profiles.some((p) => visibleProfileIds.has(p.id))), [services, visibleProfileIds]);

  if (loading && !user) {
    return <div className="page"><div className="detail-loading"><span className="spinner" /><p>Loading user…</p></div></div>;
  }
  if (!user) {
    return <div className="page"><Link to="/users" className="back-link"><ArrowLeft size={18} /> All users</Link><div className="empty-state"><h2>User unavailable</h2><p>{error || 'This user could not be found.'}</p></div></div>;
  }

  return (
    <div className="page">
      <header className="detail-head">
        <div className="detail-title">
          <Link to="/users" className="back-link"><ArrowLeft size={18} /> All users</Link>
        </div>
        <div className="detail-actions">
          {canManage && !user.isRoot && (
            <button className="ghost small" onClick={() => void toggleDisabled()} disabled={busy === 'disable'}>
              {user.disabled ? 'Enable user' : 'Disable user'}
            </button>
          )}
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      <div className="stack-lg">
        <section className="card">
          <div className="card-head">
            <div>
              <div className="entity-cell"><span className="entity-avatar"><UserCog size={18} /></span><div><h2>{user.email}</h2><p>User profile and access summary</p></div></div>
            </div>
            <div className="status-stack">
              <span className={cx('pill', user.disabled ? 'warn' : 'ok')}>{user.disabled ? 'Disabled' : 'Active'}</span>
              <span className="muted small-text">{user.isRoot ? 'Root' : user.isAdmin ? 'Admin' : 'Member'}</span>
            </div>
          </div>
          <div className="metric-grid">
            <div><span className="muted small-text">User ID</span><div><code className="mono">{user.id}</code></div></div>
            <div><span className="muted small-text">Created</span><div><strong>{new Date(user.createdAt).toLocaleString()}</strong></div></div>
            <div><span className="muted small-text">Roles</span><div><strong>{user.roles.length}</strong></div></div>
            <div><span className="muted small-text">Effective permissions</span><div><strong>{user.permissions.length}</strong></div></div>
          </div>
          <div className="stack" style={{ marginTop: 16 }}>
            <div className="section-head">
              <div><h2>Effective permissions</h2></div>
              <span className="badge">{user.permissions.length}</span>
            </div>
            <div className="table-metrics">
              {user.permissions.length ? user.permissions.map((p) => <span key={p} className="tag">{p}</span>) : <span className="muted small-text">No permissions.</span>}
            </div>
          </div>
        </section>

        <nav className="console-tabs">
          <button className={cx(tab === 'roles' && 'active')} onClick={() => setTab('roles')}>Assigned roles</button>
          <button className={cx(tab === 'profiles' && 'active')} onClick={() => setTab('profiles')}>Visible profiles</button>
        </nav>

        {tab === 'roles' && (
          <div className="stack-lg">
            <div className="toolbar">
              {canManageRoles ? (
                <>
                  <select value={roleToAdd} onChange={(e) => setRoleToAdd(e.target.value)} disabled={availableRoles.length === 0 || busy === 'role-add'}>
                    <option value="">Select role…</option>
                    {availableRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <button className="ghost small" onClick={() => void assignRole()} disabled={!roleToAdd || busy === 'role-add'}>Assign</button>
                </>
              ) : <span />}
              <span className="badge">{user.roles.length} assigned</span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Role</th><th>Description</th><th>Permissions</th><th className="right">Action</th></tr></thead>
                <tbody>
                  {user.roles.map((ur) => {
                    const detail = roles.find((r) => r.id === ur.id);
                    return (
                      <tr key={ur.id}>
                        <td><div className="entity-cell"><span className="entity-avatar"><Shield size={18} /></span><div><strong>{ur.name}</strong><small><code className="mono">{ur.id.slice(0, 8)}</code></small></div></div></td>
                        <td>{detail?.description || <span className="muted small-text">—</span>}</td>
                        <td><div className="table-metrics">{(detail?.permissions ?? []).slice(0, 4).map((p) => <span key={p} className="tag">{p}</span>)}{(detail?.permissions?.length ?? 0) > 4 && <span className="muted small-text">+{(detail?.permissions?.length ?? 0) - 4} more</span>}</div></td>
                        <td className="right">{canManageRoles ? <button className="ghost small danger-text" onClick={() => void detachRole(ur.id, ur.name)} disabled={busy === `role-${ur.id}` || (user.isRoot && ur.name === 'root')}>Detach</button> : <span className="muted small-text">—</span>}</td>
                      </tr>
                    );
                  })}
                  {user.roles.length === 0 && <tr><td colSpan={4}><p className="muted empty-inline">No roles assigned.</p></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'profiles' && (
          <div className="stack-lg">
            <div className="toolbar">
              {canManage ? (
                <>
                  <select value={profileToAdd} onChange={(e) => setProfileToAdd(e.target.value)} disabled={availableProfiles.length === 0 || busy === 'profile-add'}>
                    <option value="">Select profile…</option>
                    {availableProfiles.map((p) => <option key={p.id} value={p.id}>{p.phoneNumber} ({p.provider})</option>)}
                  </select>
                  <button className="ghost small" onClick={() => void grantProfileAccess()} disabled={!profileToAdd || busy === 'profile-add'}>Grant</button>
                </>
              ) : <span />}
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Profile</th><th>Provider</th><th>Profile ID</th><th>Routing visibility</th><th className="right">Action</th></tr></thead>
                <tbody>
                  {user.profileAccess.map((a) => {
                    const routes = services.filter((s) => s.profiles.some((sp) => sp.id === a.profileId));
                    return (
                      <tr key={a.profileId}>
                        <td><strong>{a.phoneNumber}</strong></td>
                        <td><span className="tag">{a.provider}</span></td>
                        <td><code className="mono">{a.profileId.slice(0, 8)}</code></td>
                        <td>{routes.length ? <div className="table-metrics">{routes.slice(0, 3).map((s) => <span key={s.id} className="tag">{s.name}</span>)}{routes.length > 3 && <span className="muted small-text">+{routes.length - 3} more</span>}</div> : <span className="muted small-text">No routes attached</span>}</td>
                        <td className="right">{canManage ? <button className="ghost small danger-text" onClick={() => void revokeProfile(a.profileId)} disabled={busy === `profile-${a.profileId}`}>Detach</button> : <span className="muted small-text">—</span>}</td>
                      </tr>
                    );
                  })}
                  {user.profileAccess.length === 0 && <tr><td colSpan={5}><p className="muted empty-inline">No explicit profile access granted.</p></td></tr>}
                </tbody>
              </table>
            </div>
            {routingVisible.length > 0 && (
              <p className="muted small-text">Visible in routing: {routingVisible.map((s) => s.name).join(', ')}</p>
            )}
          </div>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${user.email}?`}
          description="This removes the user account and its access. This action cannot be undone."
          confirmLabel="Delete user"
          busy={busy === 'delete'}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void removeUser()}
        />
      )}
    </div>
  );
}
