import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ProfileSummary, RoleDetail, Service, Session } from '../api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { usePageMeta, useToast } from '../components/Shell';
import { cx } from '../lib/format';
import { ArrowLeft, Trash2, UserCog } from 'lucide-react';

type Props = { session: Session };
type Tab = 'permissions' | 'users' | 'profiles' | 'routing';

const PERM_GROUPS: Array<{ label: string; keys: string[] }> = [
  { label: 'Profiles', keys: ['profiles:view', 'profiles:add', 'profiles:manage'] },
  { label: 'Users', keys: ['users:view', 'users:manage'] },
  { label: 'Roles', keys: ['roles:view', 'roles:manage'] },
  { label: 'Services', keys: ['services:view', 'services:manage'] },
  { label: 'Administration', keys: ['admin:access'] },
];

function permLabel(p: string) {
  const map: Record<string, string> = {
    'profiles:view': 'View profiles',
    'profiles:add': 'Add profiles',
    'profiles:manage': 'Manage profiles',
    'users:view': 'View users',
    'users:manage': 'Manage users',
    'roles:view': 'View roles',
    'roles:manage': 'Manage roles',
    'services:view': 'View services',
    'services:manage': 'Manage services',
    'admin:access': 'Admin access',
  };
  return map[p] ?? p.split(':').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
}

export function RoleDetailPage({ session }: Props) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [role, setRole] = useState<RoleDetail | null>(null);
  const [allPermissions, setAllPermissions] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [profileAccess, setProfileAccess] = useState<{ userId: string; profileId: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tab, setTab] = useState<Tab>('permissions');

  const canManage = Boolean(session.isRoot || session.permissions?.includes('roles:manage'));
  usePageMeta({ title: role?.name ? `${role.name} role` : 'Role details' });

  async function load(showSpinner = false) {
    if (showSpinner) setLoading(true);
    try {
      const [r, perms, p, s, access] = await Promise.all([
        api.role(id),
        api.permissionsList().catch(() => [] as string[]),
        api.profiles().catch(() => [] as ProfileSummary[]),
        api.services().catch(() => [] as Service[]),
        api.profileAccess().catch(() => [] as { userId: string; profileId: string }[]),
      ]);
      setRole(r); setAllPermissions(perms); setProfiles(p); setServices(s); setProfileAccess(access);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load role');
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(true); }, [id]);

  async function removeRole() {
    if (!role) return;
    setBusy('delete');
    try {
      await api.deleteRole(role.id);
      pushToast({ title: 'Role deleted', body: `${role.name} was removed.`, tone: 'success' });
      navigate('/roles');
    } catch (cause) {
      pushToast({ title: 'Delete failed', body: cause instanceof Error ? cause.message : 'Unable to delete role', tone: 'danger' });
    } finally { setBusy(''); setConfirmDelete(false); }
  }

  async function togglePermission(permission: string, checked: boolean) {
    if (!role) return;
    setBusy(`perm-${permission}`);
    try {
      if (checked) await api.attachRolePermission(role.id, permission);
      else await api.detachRolePermission(role.id, permission);
      await load();
      pushToast({ title: checked ? 'Permission attached' : 'Permission detached', body: `${permission} ${checked ? 'added to' : 'removed from'} ${role.name}.`, tone: 'success' });
    } catch (cause) {
      pushToast({ title: 'Unable to update permission', body: cause instanceof Error ? cause.message : 'Request failed', tone: 'danger' });
    } finally { setBusy(''); }
  }

  const memberIds = new Set(role?.users.map((u) => u.id) ?? []);
  const visibleProfileIds = useMemo(() => new Set(profileAccess.filter((a) => memberIds.has(a.userId)).map((a) => a.profileId)), [profileAccess, memberIds]);
  const visibleProfiles = useMemo(() => profiles.filter((p) => visibleProfileIds.has(p.id)), [profiles, visibleProfileIds]);
  const visibleRoutes = useMemo(() => services.filter((s) => s.profiles.some((p) => visibleProfileIds.has(p.id))), [services, visibleProfileIds]);

  const rolePerms = new Set(role?.permissions ?? []);
  const allPermKeys = useMemo(() => PERM_GROUPS.flatMap((g) => g.keys), []);
  const availablePerms = allPermissions.filter((p) => allPermKeys.includes(p));

  if (loading && !role) return <div className="page"><div className="detail-loading"><span className="spinner" /><p>Loading role…</p></div></div>;
  if (!role) return <div className="page"><Link to="/roles" className="back-link"><ArrowLeft size={18} /> All roles</Link><div className="empty-state"><h2>Role unavailable</h2><p>{error || 'This role could not be found.'}</p></div></div>;

  return (
    <div className="page">
      <header className="detail-head">
        <div className="detail-title"><Link to="/roles" className="back-link"><ArrowLeft size={18} /> All roles</Link></div>
        <div className="detail-actions">
          {canManage && role.name !== 'root' && (
            <button className="ghost small danger-text" onClick={() => setConfirmDelete(true)} disabled={busy === 'delete'}>
              <Trash2 size={18} /> Delete role
            </button>
          )}
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      <div className="stack-lg">
        <nav className="console-tabs">
          <button className={cx(tab === 'permissions' && 'active')} onClick={() => setTab('permissions')}>Permissions</button>
          <button className={cx(tab === 'users' && 'active')} onClick={() => setTab('users')}>Assigned users</button>
          <button className={cx(tab === 'profiles' && 'active')} onClick={() => setTab('profiles')}>Visible profiles</button>
          <button className={cx(tab === 'routing' && 'active')} onClick={() => setTab('routing')}>Visible routing</button>
        </nav>

        {tab === 'permissions' && (
          <div className="stack-lg">
            <section className="card">
              <div className="card-head">
                <div><h2>Permissions</h2><p>Every system operation listed. Check what this role should be allowed to do.</p></div>
                <span className="badge">{role.permissions.length} attached</span>
              </div>
              <div className="perm-checklist">
                {PERM_GROUPS.map((group) => {
                  const keys = group.keys.filter((k) => availablePerms.includes(k));
                  if (keys.length === 0) return null;
                  return (
                    <div key={group.label} className="perm-group">
                      <h3>{group.label}</h3>
                      <div className="perm-list">
                        {keys.map((p) => {
                          const checked = rolePerms.has(p);
                          return (
                            <label key={p} className="perm-item">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => void togglePermission(p, e.target.checked)}
                                disabled={!canManage || busy.startsWith('perm-')}
                              />
                              <span>{permLabel(p)}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              {!canManage && <p className="muted small-text">You do not have permission to modify this role&apos;s permissions.</p>}
            </section>
          </div>
        )}

        {tab === 'users' && (
          <div className="stack-lg">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>User</th><th>Type</th><th>User ID</th><th className="right">Action</th></tr></thead>
                <tbody>
                  {role.users.map((u) => (
                    <tr key={u.id}>
                      <td><div className="entity-cell"><span className="entity-avatar"><UserCog size={18} /></span><div><strong>{u.email}</strong><small>{u.isRoot ? 'Root' : u.isAdmin ? 'Admin' : 'Member'}</small></div></div></td>
                      <td><span className="tag">{u.isRoot ? 'root' : u.isAdmin ? 'admin' : 'member'}</span></td>
                      <td><code className="mono">{u.id.slice(0, 8)}</code></td>
                      <td className="right"><Link className="ghost small" to={`/users/${u.id}`}>Open</Link></td>
                    </tr>
                  ))}
                  {role.users.length === 0 && <tr><td colSpan={4}><p className="muted empty-inline">No users assigned to this role.</p></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'profiles' && (
          <div className="stack-lg">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Profile</th><th>Provider</th><th>Status</th><th>Profile ID</th></tr></thead>
                <tbody>
                  {visibleProfiles.map((p) => (
                    <tr key={p.id}>
                      <td><strong>{p.phoneNumber}</strong><small className="cell-sub">{p.deviceModel || 'Saved device'}</small></td>
                      <td><span className="tag">{p.provider}</span></td>
                      <td><span className="muted small-text">{p.fcmStatus}</span></td>
                      <td><code className="mono">{p.id.slice(0, 8)}</code></td>
                    </tr>
                  ))}
                  {visibleProfiles.length === 0 && <tr><td colSpan={4}><p className="muted empty-inline">No explicit profile access for members of this role.</p></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'routing' && (
          <div className="stack-lg">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Route</th><th>Visible profiles</th><th>Callback</th></tr></thead>
                <tbody>
                  {visibleRoutes.map((s) => {
                    const matched = s.profiles.filter((p) => visibleProfileIds.has(p.id));
                    return (
                      <tr key={s.id}>
                        <td><strong>{s.name}</strong><small className="cell-sub">{s.description || 'No description'}</small></td>
                        <td><div className="table-metrics">{matched.map((p) => <span key={p.id} className="tag">{p.phoneNumber}</span>)}</div></td>
                        <td><code className="url-cell">{s.callbackUrl}</code></td>
                      </tr>
                    );
                  })}
                  {visibleRoutes.length === 0 && <tr><td colSpan={3}><p className="muted empty-inline">No routing rules reference profiles visible to this role.</p></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${role.name}?`}
          description="This removes the role and detaches it from users. This action cannot be undone."
          confirmLabel="Delete role"
          busy={busy === 'delete'}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void removeRole()}
        />
      )}
    </div>
  );
}
