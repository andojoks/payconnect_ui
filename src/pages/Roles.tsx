import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, Role, Session } from '../api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useGlobalSearch, usePageMeta, useToast } from '../components/Shell';
import { ChevronRight, Plus, Shield, X } from 'lucide-react';

type Props = { session: Session };

export function RolesPage({ session }: Props) {
  usePageMeta({ title: 'Roles' });
  const { query } = useGlobalSearch();
  const { pushToast } = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Role | null>(null);

  const canManage = Boolean(session.isRoot || session.permissions?.includes('roles:manage'));

  async function load(showSpinner = false) {
    if (showSpinner) setLoading(true);
    try { setRoles(await api.adminRoles()); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load roles'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(true); }, []);



  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return roles;
    return roles.filter((r) => [r.name, r.description, r.id, ...r.permissions].some((v) => String(v).toLowerCase().includes(search)));
  }, [roles, query]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.createRole(name.trim(), description.trim());
      pushToast({ title: 'Role created', body: `${name.trim()} is ready to configure.`, tone: 'success' });
      setShowCreate(false); setName(''); setDescription('');
      await load();
    } catch (cause) {
      pushToast({ title: 'Unable to create role', body: cause instanceof Error ? cause.message : 'Request failed', tone: 'danger' });
    } finally { setBusy(false); }
  }

  async function removeRole() {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await api.deleteRole(confirmDelete.id);
      pushToast({ title: 'Role deleted', body: `${confirmDelete.name} was removed.`, tone: 'success' });
      setConfirmDelete(null); await load();
    } catch (cause) {
      pushToast({ title: 'Delete failed', body: cause instanceof Error ? cause.message : 'Unable to delete role', tone: 'danger' });
    } finally { setBusy(false); }
  }

  if (!session.isRoot && !session.permissions?.includes('roles:manage') && !session.permissions?.includes('roles:view')) {
    return <div className="page"><div className="empty-state"><h2>Roles access required</h2><p>Your account does not have permission to view roles.</p></div></div>;
  }

  return (
    <div className="page">
      {error && <div className="error">{error}</div>}
      <section className="stack-lg">
        <div className="page-toolbar">
          <div><h2>Roles</h2><p>Role definitions, permissions, and assigned users.</p></div>
          <div className="page-actions">
            {canManage && (
              <button className="primary" onClick={() => setShowCreate(true)}>
                <Plus size={18} /> New role
              </button>
            )}
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Role</th><th>Permissions</th><th>Role ID</th><th className="right">Actions</th></tr></thead>
            <tbody>
              {filtered.map((role) => (
                <tr key={role.id}>
                  <td>
                    <div className="entity-cell">
                      <span className="entity-avatar"><Shield size={18} /></span>
                      <div><strong>{role.name}</strong><small>{role.description || 'No description'}</small></div>
                    </div>
                  </td>
                  <td><div className="table-metrics">{role.permissions.slice(0, 4).map((p) => <span key={p} className="tag">{p}</span>)}{role.permissions.length > 4 && <span className="muted small-text">+{role.permissions.length - 4} more</span>}{role.permissions.length === 0 && <span className="muted small-text">No permissions</span>}</div></td>
                  <td><code className="mono">{role.id.slice(0, 8)}</code></td>
                  <td className="right">
                    <div className="row-actions">
                      <Link className="ghost small" to={`/roles/${role.id}`}>Details <ChevronRight size={18} /></Link>
                      {canManage && role.name !== 'root' && <button className="ghost small danger-text" onClick={() => setConfirmDelete(role)}>Delete</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && <tr><td colSpan={4}><p className="muted empty-inline">No roles match your search.</p></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {showCreate && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="create-role-title">
            <div className="modal-header">
              <div><span className="eyebrow">ROLE</span><h2 id="create-role-title">Create role</h2></div>
              <button className="icon-button" onClick={() => setShowCreate(false)} aria-label="Close"><X size={18} /></button>
            </div>
            <form className="stack" onSubmit={create}>
              <label className="field"><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} required /></label>
              <label className="field"><span>Description</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></label>
              <div className="modal-actions">
                <button type="button" className="ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                <button className="primary" disabled={busy}>{busy ? 'Creating…' : 'Create role'}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${confirmDelete.name}?`}
          description="This removes the role and detaches it from users. This action cannot be undone."
          confirmLabel="Delete role"
          busy={busy}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void removeRole()}
        />
      )}
    </div>
  );
}
