import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, Delivery, Intent, ProfileSummary, Service, ServiceProfile, Session } from '../api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { usePageMeta, useToast } from '../components/layout/Shell';
import { cx, formatDate, formatMoney, relativeTime, statusTone } from '../lib/format';
import { Activity, ArrowLeft, Clock, Copy, KeyRound, Plus, Send, Settings, Trash2, TriangleAlert, Users, X } from 'lucide-react';

type Props = { session: Session };
type ConsoleTab = 'overview' | 'profiles' | 'intents' | 'deliveries';

function copyText(value: string) {
  void navigator.clipboard?.writeText(value).catch(() => undefined);
}

function SecretModal({ service, onClose }: { service: Service; onClose: () => void }) {
  const secret = service.secret ?? '';
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="secret-title">
        <div className="modal-header">
          <div>
            <span className="eyebrow">SIGNING SECRET</span>
            <h2 id="secret-title">{service.name} is ready</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <p className="modal-copy">
          Store this secret now. It signs every callback with HMAC-SHA256 and will not be shown again. Use it as the <code>X-PayConnect-Secret</code> value when creating intents or posting collections.
        </p>
        <div className="secret-box">
          <code>{secret}</code>
          <button className="icon-button" onClick={() => copyText(secret)} aria-label="Copy secret"><Copy size={18} /></button>
        </div>
        <div className="modal-actions">
          <button className="primary" onClick={onClose}>I stored the secret</button>
        </div>
      </section>
    </div>
  );
}

export function RouteDetailPage({ session }: Props) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [service, setService] = useState<Service | null>(null);
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [tab, setTab] = useState<ConsoleTab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [secretService, setSecretService] = useState<Service | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Service | null>(null);
  const [busy, setBusy] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCallbackUrl, setEditCallbackUrl] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [editBusy, setEditBusy] = useState(false);

  usePageMeta({ title: service?.name ?? 'Route details', eyebrow: 'CALLBACK ROUTER' });

  async function load() {
    try {
      const [nextService, nextProfiles] = await Promise.all([api.service(id), api.profiles()]);
      setService(nextService);
      setProfiles(nextProfiles);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load route');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  useEffect(() => {
    if (!service) return;
    setEditName(service.name);
    setEditDescription(service.description);
    setEditCallbackUrl(service.callbackUrl);
    setEditActive(service.active);
  }, [service]);

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!service) return;
    setEditBusy(true);
    try {
      await api.updateService(service.id, { name: editName, description: editDescription, callbackUrl: editCallbackUrl, active: editActive });
      await load();
      pushToast({ title: 'Route updated', body: 'The application settings were saved.', tone: 'success' });
      setShowEditModal(false);
    } catch (cause) {
      pushToast({ title: 'Update failed', body: cause instanceof Error ? cause.message : 'Unable to update route', tone: 'danger' });
    } finally {
      setEditBusy(false);
    }
  }

  async function removeService() {
    if (!confirmDelete) return;
    setBusy('delete');
    try {
      await api.deleteService(confirmDelete.id);
      pushToast({ title: 'Route deleted', body: `${confirmDelete.name} will no longer receive callbacks.`, tone: 'success' });
      navigate('/router');
    } catch (cause) {
      pushToast({ title: 'Delete failed', body: cause instanceof Error ? cause.message : 'Unable to delete route', tone: 'danger' });
    } finally {
      setBusy('');
      setConfirmDelete(null);
    }
  }

  if (!session.isRoot && !session.permissions?.includes('services:manage')) {
    return (
      <div className="page">
        <div className="empty-state">
          <h2>Router access required</h2>
          <p>Your account does not have the <code>services:manage</code> permission.</p>
        </div>
      </div>
    );
  }

  if (loading && !service) {
    return (
      <div className="page">
        <div className="detail-loading">
          <span className="spinner" />
          <p>Loading route…</p>
        </div>
      </div>
    );
  }

  if (!service) {
    return (
      <div className="page">
        <Link to="/router" className="back-link"><ArrowLeft size={18} /> All routes</Link>
        <div className="empty-state">
          <h2>Route unavailable</h2>
          <p>{error || 'This route may have been removed or you no longer have access.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="detail-head">
        <div className="detail-title">
          <Link to="/router" className="back-link"><ArrowLeft size={18} /> All routes</Link>
        </div>
        <div className="detail-actions">
          <button className="ghost small" onClick={() => setShowEditModal(true)}><Settings size={18} /> Edit</button>
          <button className="ghost small danger-text" onClick={() => setConfirmDelete(service)}><Trash2 size={18} /> Delete</button>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      <nav className="console-tabs">
        {(['overview', 'profiles', 'intents', 'deliveries'] as ConsoleTab[]).map((value) => (
          <button key={value} className={cx(tab === value && 'active')} onClick={() => setTab(value)}>
            {value === 'overview' ? 'Overview' : value === 'profiles' ? 'Profiles' : value === 'intents' ? 'Intents' : 'Deliveries'}
          </button>
        ))}
      </nav>
      <ServiceConsole
        service={service}
        profiles={profiles}
        tab={tab}
        onRefresh={load}
        onRotated={(secret) => setSecretService({ ...service, secret })}
        onToast={pushToast}
      />

      {showEditModal && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-route-title">
            <div className="modal-header">
              <div>
                <span className="eyebrow">ROUTE</span>
                <h2 id="edit-route-title">Edit route</h2>
              </div>
              <button className="icon-button" onClick={() => setShowEditModal(false)} aria-label="Close"><X size={18} /></button>
            </div>
            <form className="stack" onSubmit={saveEdit}>
              <label className="field"><span>Name</span><input value={editName} onChange={(event) => setEditName(event.target.value)} required /></label>
              <label className="field"><span>Description</span><textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} rows={2} /></label>
              <label className="field"><span>Callback URL</span><input value={editCallbackUrl} onChange={(event) => setEditCallbackUrl(event.target.value)} type="url" required /></label>
              <label className="switch">
                <input type="checkbox" checked={editActive} onChange={(event) => setEditActive(event.target.checked)} />
                <span>Route is active</span>
              </label>
              <div className="modal-actions">
                <button type="button" className="ghost" onClick={() => setShowEditModal(false)}>Cancel</button>
                <button className="primary" disabled={editBusy}>{editBusy ? 'Saving…' : 'Save changes'}</button>
              </div>
            </form>
          </section>
        </div>
      )}
      {secretService && <SecretModal service={secretService} onClose={() => setSecretService(null)} />}
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${confirmDelete.name}?`}
          description="This removes the callback route, its intents, and its delivery history. Connected profiles keep their own listeners and history."
          confirmLabel="Delete route"
          busy={busy === 'delete'}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void removeService()}
        />
      )}
    </div>
  );
}

type ConsoleProps = {
  service: Service;
  profiles: ProfileSummary[];
  tab: ConsoleTab;
  onRefresh: () => Promise<void>;
  onRotated: (secret: string) => void;
  onToast: (toast: { title: string; body: string; tone: 'info' | 'success' | 'warning' | 'danger'; href?: string }) => void;
};

function ServiceConsole({ service, profiles, tab, onRefresh, onRotated, onToast }: ConsoleProps) {
  const [intents, setIntents] = useState<Intent[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [profileId, setProfileId] = useState('');
  const [intentPhone, setIntentPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('XAF');
  const [reference, setReference] = useState('');
  const [expires, setExpires] = useState('30');
  const [attachProfile, setAttachProfile] = useState('');
  const [name, setName] = useState(service.name);
  const [description, setDescription] = useState(service.description);
  const [callbackUrl, setCallbackUrl] = useState(service.callbackUrl);
  const [active, setActive] = useState(service.active);
  const [showIntentModal, setShowIntentModal] = useState(false);
  const [intentError, setIntentError] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => {
    setName(service.name);
    setDescription(service.description);
    setCallbackUrl(service.callbackUrl);
    setActive(service.active);
  }, [service]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    if (tab === 'intents') {
      api.serviceIntents(service.id)
        .then((value) => { if (!cancelled) setIntents(value); })
        .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load intents'); })
        .finally(() => { if (!cancelled) setLoading(false); });
    } else if (tab === 'deliveries') {
      api.serviceDeliveries(service.id)
        .then((value) => { if (!cancelled) setDeliveries(value); })
        .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load deliveries'); })
        .finally(() => { if (!cancelled) setLoading(false); });
    } else {
      setLoading(false);
    }
    return () => { cancelled = true; };
  }, [service.id, tab]);

  const assigned = service.profiles;
  const availableProfiles = profiles.filter((profile) => !assigned.some((item) => item.id === profile.id));

  async function createIntent(event: FormEvent): Promise<boolean> {
    event.preventDefault();
    setBusy('intent');
    setIntentError('');
    try {
      await api.createServiceIntent(service.id, {
        profileId,
        phoneNumber: intentPhone.trim(),
        amount: amount ? Number(amount) : undefined,
        currency,
        reference,
        expiresInMinutes: Number(expires) || undefined,
      });
    } catch (cause) {
      // Surface the server response so integration failures are actionable.
      const status = cause instanceof ApiError ? `HTTP ${cause.status}: ` : '';
      const received = cause instanceof ApiError && cause.body.trim()
        ? cause.body.trim()
        : cause instanceof Error ? cause.message : 'Unable to register intent';
      const detail = `${status}${received}`;
      setIntentError(detail);
      onToast({ title: 'Intent failed', body: detail, tone: 'danger' });
      setBusy('');
      return false;
    }

    setIntentPhone('');
    setAmount('');
    setReference('');
    onToast({ title: 'Intent registered', body: 'Matching alerts will now be routed to this application.', tone: 'success' });
    try {
      setIntents(await api.serviceIntents(service.id));
      await onRefresh();
    } catch (cause) {
      onToast({
        title: 'Intent registered',
        body: `Intent saved, but the list could not refresh: ${cause instanceof Error ? cause.message : 'unknown error'}`,
        tone: 'warning',
      });
    } finally {
      setBusy('');
    }
    return true;
  }

  async function cancelIntent(intent: Intent) {
    setBusy(intent.id);
    try {
      await api.cancelServiceIntent(service.id, intent.id);
      setIntents(await api.serviceIntents(service.id));
      await onRefresh();
    } catch (cause) {
      onToast({ title: 'Cancel failed', body: cause instanceof Error ? cause.message : 'Unable to cancel intent', tone: 'danger' });
    } finally {
      setBusy('');
    }
  }

  async function attach(event: FormEvent) {
    event.preventDefault();
    if (!attachProfile) return;
    setBusy('attach');
    try {
      await api.assignServiceProfile(service.id, attachProfile);
      setAttachProfile('');
      await onRefresh();
      onToast({ title: 'Profile attached', body: 'This application can now receive alerts for the profile.', tone: 'success' });
    } catch (cause) {
      onToast({ title: 'Attach failed', body: cause instanceof Error ? cause.message : 'Unable to attach profile', tone: 'danger' });
    } finally {
      setBusy('');
    }
  }

  async function detach(profile: ServiceProfile) {
    setBusy(profile.id);
    try {
      await api.detachServiceProfile(service.id, profile.id);
      await onRefresh();
    } catch (cause) {
      onToast({ title: 'Detach failed', body: cause instanceof Error ? cause.message : 'Unable to detach profile', tone: 'danger' });
    } finally {
      setBusy('');
    }
  }

  async function rotate() {
    setBusy('rotate');
    try {
      const result = await api.rotateServiceSecret(service.id);
      onRotated(result.secret);
      onToast({ title: 'Secret rotated', body: 'Update the application with the new signing secret.', tone: 'success' });
    } catch (cause) {
      onToast({ title: 'Rotate failed', body: cause instanceof Error ? cause.message : 'Unable to rotate secret', tone: 'danger' });
    } finally {
      setBusy('');
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy('save');
    try {
      await api.updateService(service.id, { name, description, callbackUrl, active });
      await onRefresh();
      onToast({ title: 'Route updated', body: 'The application settings were saved.', tone: 'success' });
    } catch (cause) {
      onToast({ title: 'Update failed', body: cause instanceof Error ? cause.message : 'Unable to update route', tone: 'danger' });
    } finally {
      setBusy('');
    }
  }

  if (tab === 'overview') {
    return (
      <div className="console-body">
        <section className="card">
          <div className="card-head">
            <div>
              <span className="eyebrow">ROUTE DETAILS</span>
              <h2>{service.name}</h2>
              <p className="muted small-text">Service ID: <code className="mono">{service.id}</code></p>
              {service.description && <p>{service.description}</p>}
              <div className="console-url">
                <code>{service.callbackUrl}</code>
                <button className="icon-button" onClick={() => copyText(service.callbackUrl)} aria-label="Copy callback URL"><Copy size={18} /></button>
              </div>
              <p className="muted small-text">Status: <span className={cx('pill', service.active ? 'ok' : 'neutral')}>{service.active ? 'active' : 'paused'}</span></p>
            </div>
            <div className="page-actions">
              <button className="ghost small" onClick={() => copyText(service.callbackUrl)}><Copy size={18} /> Copy URL</button>
              <button className="ghost small" onClick={() => void rotate()} disabled={busy === 'rotate'}><KeyRound size={18} /> Rotate secret</button>
            </div>
          </div>
        </section>
        <div className="metric-grid">
          <article className="metric"><span className="stat-icon"><Users size={18} /></span><small>Profiles</small><strong>{service.profiles.length}</strong><em>Attached accounts</em></article>
          <article className="metric"><span className="stat-icon"><Clock size={18} /></span><small>Pending intents</small><strong>{service.pendingIntents}</strong><em>Expectations</em></article>
          <article className="metric"><span className="stat-icon"><Activity size={18} /></span><small>Queued deliveries</small><strong>{service.pendingDeliveries}</strong><em>Waiting to send</em></article>
          <article className="metric"><span className="stat-icon"><TriangleAlert size={18} /></span><small>Failed</small><strong>{service.failedDeliveries}</strong><em>Needs attention</em></article>
        </div>
        <div className="two-column">
          <section className="card inner-card">
            <div className="card-head"><div><h3>Attached profiles</h3><p>Alerts from these profiles can route to this application.</p></div></div>
            <div className="list">
              {assigned.map((profile) => (
                <div className="list-row" key={profile.id}>
                  <span className="list-mark"><Users size={18} /></span>
                  <div className="main"><strong>{profile.phoneNumber}</strong><small>{profile.provider} · ID: {profile.id.slice(0, 8)}</small></div>
                  <span className="pill ok">attached</span>
                </div>
              ))}
              {assigned.length === 0 && <p className="muted empty-inline">No profiles attached. Add one from the Profiles tab.</p>}
            </div>
          </section>
          <section className="card inner-card">
            <div className="card-head"><div><h3>Callback contract</h3><p>Send the secret and receive HMAC-signed JSON.</p></div></div>
            <pre className="code-block">{`POST ${service.callbackUrl}\nX-PayConnect-Signature: sha256=<hmac>\nX-PayConnect-Timestamp: <unix>\nX-PayConnect-Idempotency-Key: <key>\n\n{"event":"collection.matched","intentId":"...","phoneNumber":"...","amount":5000,"currency":"XAF"}`}</pre>
          </section>
        </div>


      </div>
    );
  }

  if (tab === 'profiles') {
    return (
      <div className="console-body">
        <form className="attach-form" onSubmit={attach}>
          <label className="field">
            <span>Attach a connected profile</span>
            <select value={attachProfile} onChange={(event) => setAttachProfile(event.target.value)} required>
              <option value="">Select profile…</option>
              {availableProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.phoneNumber}</option>)}
            </select>
          </label>
          <button className="primary" disabled={busy === 'attach' || !attachProfile}><Plus size={18} /> Attach</button>
        </form>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Profile</th><th>Provider</th><th>Profile ID</th><th>Status</th><th className="right">Action</th></tr></thead>
            <tbody>
              {assigned.map((profile) => (
                <tr key={profile.id}>
                  <td><strong>{profile.phoneNumber}</strong></td>
                  <td>{profile.provider}</td>
                  <td><code className="mono">{profile.id.slice(0, 8)}</code></td>
                  <td><span className="pill ok">attached</span></td>
                  <td className="right"><button className="ghost small danger-text" onClick={() => void detach(profile)} disabled={busy === profile.id}>Detach</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {assigned.length === 0 && <p className="muted empty-inline">No profiles attached yet.</p>}
        </div>
      </div>
    );
  }

  if (tab === 'intents') {
    return (
      <div className="console-body">
        <div className="card-head" style={{ marginBottom: 8 }}>
          <div>
            <h3>Intents</h3>
            <p>Register expectations to match incoming notifications by profile, phone, and amount.</p>
          </div>
          <button
            className="primary"
            onClick={() => {
              setIntentError('');
              setShowIntentModal(true);
            }}
            disabled={assigned.length === 0}
          >
            <Plus size={18} /> Register intent
          </button>
        </div>
        {assigned.length === 0 && <p className="muted">Attach a profile first so intents have a matching scope.</p>}
        {error && <div className="error">{error}</div>}
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Status</th><th>Intent ID</th><th>Profile</th><th>Amount</th><th>Reference</th><th>Created</th><th>Expires</th><th className="right">Action</th></tr></thead>
            <tbody>
              {intents.map((intent) => (
                <tr key={intent.id}>
                  <td><span className={cx('pill', statusTone(intent.status))}>{intent.status}</span></td>
                  <td><code className="mono">{intent.id.slice(0, 8)}</code></td>
                  <td>{intent.phoneNumber || profiles.find((profile) => profile.id === intent.profileId)?.phoneNumber || '—'}</td>
                  <td>{intent.amount ? formatMoney(intent.amount, intent.currency) : 'Any'}</td>
                  <td>{intent.reference || '—'}</td>
                  <td>{formatDate(intent.createdAt)}</td>
                  <td>{intent.expiresAt ? relativeTime(intent.expiresAt) : 'Never'}</td>
                  <td className="right">
                    {intent.status === 'pending' && (
                      <button className="ghost small danger-text" onClick={() => void cancelIntent(intent)} disabled={busy === intent.id}>Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && intents.length === 0 && <p className="muted empty-inline">No intents registered yet.</p>}
        </div>

        {showIntentModal && (
          <div className="modal-backdrop" role="presentation">
            <section className="modal" role="dialog" aria-modal="true" aria-labelledby="register-intent-title">
              <div className="modal-header">
                <div>
                  <span className="eyebrow">INTENT</span>
                  <h2 id="register-intent-title">Register an intent</h2>
                </div>
                <button className="icon-button" onClick={() => setShowIntentModal(false)} aria-label="Close"><X size={18} /></button>
              </div>
              <p className="modal-copy">Match a notification by profile, payer phone, and expected amount.</p>
              <form
                className="stack"
                onSubmit={async (event) => {
                  if (await createIntent(event)) setShowIntentModal(false);
                }}
              >
                <label className="field">
                  <span>Profile</span>
                  <select value={profileId} onChange={(event) => setProfileId(event.target.value)} required>
                    <option value="">Select profile…</option>
                    {assigned.map((profile) => <option key={profile.id} value={profile.id}>{profile.phoneNumber}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Payer phone number</span>
                  <input value={intentPhone} onChange={(event) => setIntentPhone(event.target.value)} inputMode="tel" placeholder="Number the payment is expected from" required />
                </label>
                <label className="field"><span>Expected amount</span><input type="number" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" min="0" step="any" placeholder="Optional" /></label>
                <label className="field">
                  <span>Currency</span>
                  <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
                    <option value="XAF">XAF</option>
                  </select>
                </label>
                <label className="field"><span>Reference</span><input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Order reference" /></label>
                <label className="field"><span>Expires in (minutes)</span><input value={expires} onChange={(event) => setExpires(event.target.value)} inputMode="numeric" /></label>
                {intentError && (
                  <div className="error" role="alert">
                    <strong>Intent POST failed — server response</strong>
                    <pre style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12 }}>{intentError}</pre>
                  </div>
                )}
                <div className="modal-actions">
                  <button type="button" className="ghost" onClick={() => setShowIntentModal(false)}>Cancel</button>
                  <button className="primary" disabled={busy === 'intent' || !profileId || !intentPhone.trim()}><Send size={18} /> {busy === 'intent' ? 'Registering…' : 'Register intent'}</button>
                </div>
              </form>
            </section>
          </div>
        )}
      </div>
    );
  }

  if (tab === 'deliveries') {
    return (
      <div className="console-body">
        {error && <div className="error">{error}</div>}
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Status</th><th>Delivery ID</th><th>Event</th><th>Attempts</th><th>Created</th><th>Delivered</th><th>Detail</th></tr></thead>
            <tbody>
              {deliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td><span className={cx('pill', statusTone(delivery.status))}>{delivery.status}</span></td>
                  <td><code className="mono">{delivery.id.slice(0, 8)}</code></td>
                  <td><strong>{delivery.eventType || 'event'}</strong><small className="cell-sub">{delivery.idempotencyKey}</small></td>
                  <td>{delivery.attempts}</td>
                  <td>{formatDate(delivery.createdAt)}</td>
                  <td>{delivery.deliveredAt ? formatDate(delivery.deliveredAt) : '—'}</td>
                  <td>
                    {delivery.lastError ? <span className="danger-text small-text">{delivery.lastError}</span> : delivery.lastStatusCode ? <span className="muted small-text">HTTP {delivery.lastStatusCode}</span> : <span className="muted small-text">Queued</span>}
                    {delivery.payload && (
                      <details className="payload"><summary>Payload</summary><pre>{JSON.stringify(delivery.payload, null, 2)}</pre></details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && deliveries.length === 0 && <p className="muted empty-inline">No deliveries recorded yet.</p>}
        </div>
      </div>
    );
  }

  return null;
}
