import { useEffect, useMemo, useState } from 'react';
import { api, AdminUser, ProfileAccess, ProfileSummary, Role, Session } from '../api';
import { useGlobalSearch, usePageMeta } from '../components/Shell';
import { cx, formatDate } from '../lib/format';
import { KeyRound, RefreshCw, Shield, Users } from 'lucide-react';

type Props = { session: Session };

export function AdminPage({ session }: Props) {
  usePageMeta({ title: 'Administration', eyebrow: 'ACCESS CONTROL' });
  const { query } = useGlobalSearch();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [access, setAccess] = useState<ProfileAccess[]>([]);
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rolesError, setRolesError] = useState('');

  async function load(showSpinner = false) {
    if (showSpinner) setLoading(true);
    try {
      const [nextUsers, nextAccess, nextProfiles] = await Promise.all([api.adminUsers(), api.profileAccess(), api.profiles()]);
      setUsers(nextUsers);
      setAccess(nextAccess);
      setProfiles(nextProfiles);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load administration data');
    } finally {
      setLoading(false);
    }
    if (session.isRoot || session.permissions?.includes('roles:manage')) {
      try {
        setRoles(await api.adminRoles());
        setRolesError('');
      } catch (cause) {
        setRolesError(cause instanceof Error ? cause.message : 'Unable to load roles');
      }
    }
  }

  useEffect(() => {
    void load(true);
  }, []);

  const userMap = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);

  const search = query.trim().toLowerCase();
  const filteredUsers = useMemo(() => {
    if (!search) return users;
    return users.filter((user) =>
      [user.email, user.isRoot ? 'root' : '', user.isAdmin ? 'admin' : '', user.disabled ? 'disabled' : 'active', ...user.roles]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search)),
    );
  }, [users, search]);

  const filteredRoles = useMemo(() => {
    if (!search) return roles;
    return roles.filter((role) =>
      [role.name, role.description, ...role.permissions].filter(Boolean).some((value) => String(value).toLowerCase().includes(search)),
    );
  }, [roles, search]);

  const filteredAccess = useMemo(() => {
    if (!search) return access;
    return access.filter((item) =>
      [userMap.get(item.userId)?.email, profileMap.get(item.profileId)?.phoneNumber]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search)),
    );
  }, [access, search, userMap, profileMap]);

  const activeUsers = users.filter((user) => !user.disabled).length;
  const rootCount = users.filter((user) => user.isRoot).length;

  return (
    <div className="page">
      <div className="page-toolbar">
        <p className="page-lede">Manage operators, role permissions, and which profiles each account can reach.</p>
        <div className="page-actions">
          <button className="ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={18} /> {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <section className="stat-grid">
        <article className="stat-card accent">
          <span className="stat-icon"><Users size={18} /></span>
          <small>Accounts</small>
          <strong>{users.length}</strong>
          <em>{activeUsers} active · {users.length - activeUsers} disabled</em>
        </article>
        <article className="stat-card">
          <span className="stat-icon"><Shield size={18} /></span>
          <small>Roles</small>
          <strong>{roles.length}</strong>
          <em>Permission bundles</em>
        </article>
        <article className="stat-card">
          <span className="stat-icon"><KeyRound size={18} /></span>
          <small>Root operators</small>
          <strong>{rootCount}</strong>
          <em>Unrestricted access</em>
        </article>
        <article className="stat-card">
          <span className="stat-icon"><Users size={18} /></span>
          <small>Profile grants</small>
          <strong>{access.length}</strong>
          <em>Explicit per-account access</em>
        </article>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Users</h2>
            <p>Operator accounts and the roles assigned to them.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Account</th>
                <th>User ID</th>
                <th>Roles</th>
                <th>Scope</th>
                <th>State</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="entity-cell">
                      <span className="entity-avatar">{user.email.slice(0, 1).toUpperCase()}</span>
                      <div>
                        <strong>{user.email}</strong>
                        <small>{user.isRoot ? 'Root account' : user.isAdmin ? 'Administrator' : 'Operator'}</small>
                      </div>
                    </div>
                  </td>
                  <td><code className="mono">{user.id.slice(0, 8)}</code></td>
                  <td>
                    {user.roles.length > 0 ? (
                      <div className="tag-row">
                        {user.roles.map((role) => <span className="tag" key={role}>{role}</span>)}
                      </div>
                    ) : (
                      <span className="muted small-text">No roles</span>
                    )}
                  </td>
                  <td>{user.isRoot ? <span className="pill ok">Unrestricted</span> : <span className="pill neutral">Scoped</span>}</td>
                  <td><span className={cx('pill', user.disabled ? 'danger' : 'ok')}>{user.disabled ? 'disabled' : 'active'}</span></td>
                  <td>{formatDate(user.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filteredUsers.length === 0 && <p className="muted empty-inline">No users match this search.</p>}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Roles</h2>
            <p>Roles bundle the permissions that unlock each workspace area.</p>
          </div>
        </div>
        {rolesError && <div className="error">{rolesError}</div>}
        <div className="table-wrap">
          <table className="table">
              <thead>
              <tr>
                <th>Role</th>
                <th>Role ID</th>
                <th>Description</th>
                <th>Permissions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRoles.map((role) => (
                <tr key={role.id}>
                  <td><strong>{role.name}</strong></td>
                  <td><code className="mono">{role.id.slice(0, 8)}</code></td>
                  <td>{role.description || '—'}</td>
                  <td>
                    <div className="tag-row">
                      {role.permissions.map((permission) => <span className="tag" key={permission}>{permission}</span>)}
                      {role.permissions.length === 0 && <span className="muted small-text">No permissions</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filteredRoles.length === 0 && <p className="muted empty-inline">{roles.length === 0 ? 'Roles are not available for this account.' : 'No roles match this search.'}</p>}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Profile access</h2>
            <p>Explicit grants that let an account open a specific provider profile.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
<thead>
              <tr>
                <th>Account</th>
                <th>User ID</th>
                <th>Profile</th>
                <th>Provider</th>
                <th>Grant ID</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccess.map((item) => {
                const user = userMap.get(item.userId);
                const profile = profileMap.get(item.profileId);
                return (
                  <tr key={`${item.userId}:${item.profileId}`}>
                    <td>{user?.email ?? item.userId}</td>
                    <td><code className="mono">{item.userId.slice(0, 8)}</code></td>
                    <td><strong>{profile?.phoneNumber ?? item.profileId}</strong></td>
                    <td>{profile?.provider ?? '—'}</td>
                    <td><span className="pill neutral">explicit</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && filteredAccess.length === 0 && <p className="muted empty-inline">{access.length === 0 ? 'No explicit profile grants. Root and admin accounts use their wider scope.' : 'No grants match this search.'}</p>}
        </div>
      </section>
    </div>
  );
}
