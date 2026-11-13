import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, getApiBaseURL, Service, Session } from '../api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useGlobalSearch, usePageMeta } from '../components/layout/Shell';
import { cx, relativeTime } from '../lib/format';
import { ChevronRight, Copy, Plus, Router, X } from 'lucide-react';

type Props = { session: Session };
type Tab = 'routing' | 'integration';

function NewServiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: (service: Service) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [callbackUrl, setCallbackUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      onCreated(await api.createService(name, callbackUrl, description));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create service');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="new-service-title">
        <div className="modal-header">
          <div>
            <span className="eyebrow">CALLBACK ROUTE</span>
            <h2 id="new-service-title">Register an application</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <p className="modal-copy">
          Register the HTTPS endpoint that should receive matching MoMo alerts. A signing secret is generated once and shown after creation.
        </p>
        <form onSubmit={submit} className="stack">
          <label className="field">
            <span>Application name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Checkout service" autoFocus required />
          </label>
          <label className="field">
            <span>Description</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} placeholder="What consumes these alerts?" />
          </label>
          <label className="field">
            <span>Callback URL</span>
            <input value={callbackUrl} onChange={(event) => setCallbackUrl(event.target.value)} placeholder="https://example.com/payconnect/callback" type="url" required />
          </label>
          {error && <div className="error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="ghost" onClick={onClose}>Cancel</button>
            <button className="primary" disabled={busy}>{busy ? 'Creating…' : 'Create route'}</button>
          </div>
        </form>
      </section>
    </div>
  );
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
          Store this secret now. It will not be shown again. Use the exact string as the <code>X-PayConnect-Secret</code> value and as the HMAC-SHA256 key when verifying callback signatures.
        </p>
        <div className="secret-box">
          <code>{secret}</code>
          <button className="icon-button" onClick={() => void navigator.clipboard?.writeText(secret).catch(() => undefined)} aria-label="Copy secret"><Copy size={18} /></button>
        </div>
        <div className="modal-actions">
          <button className="primary" onClick={onClose}>I stored the secret</button>
        </div>
      </section>
    </div>
  );
}

function CodeTabs({ active, options, onChange }: { active: string; options: string[]; onChange: (lang: string) => void }) {
  return (
    <div className="code-tabs">
      {options.map((lang) => (
        <button key={lang} className={cx(lang === active ? 'primary' : 'ghost')} onClick={() => onChange(lang)}>
          {lang}
        </button>
      ))}
    </div>
  );
}

function CodeBlock({ lang, active, children }: { lang: string; active: string; children: React.ReactNode }) {
  if (lang !== active) return null;
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (copied) {
      const t = setTimeout(() => setCopied(false), 1500);
      return () => clearTimeout(t);
    }
  }, [copied]);
  async function handleCopy() {
    const text = preRef.current?.innerText ?? '';
    await navigator.clipboard?.writeText(text);
    setCopied(true);
  }
  return (
    <div className="code-wrap">
      <pre ref={preRef} className="code-block">{children}</pre>
      <button className="copy-btn" onClick={handleCopy} aria-label="Copy code" title="Copy code">
        {copied ? 'Copied!' : <Copy size={14} />}
      </button>
    </div>
  );
}

export function RouterPage({ session }: Props) {
  usePageMeta({ title: 'Routing rules', eyebrow: 'CALLBACK ROUTER' });
  const navigate = useNavigate();
  const { query } = useGlobalSearch();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [secretService, setSecretService] = useState<Service | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Service | null>(null);
  const [busy, setBusy] = useState('');
  const [tab, setTab] = useState<Tab>('routing');
  const [sigLang, setSigLang] = useState('JavaScript');
  const [intentLang, setIntentLang] = useState('JavaScript');

  async function load() {
    try {
      setServices(await api.services());
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load callback routes');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredServices = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return services;
    return services.filter((service) =>
      [service.name, service.description, service.callbackUrl, service.active ? 'active' : 'paused', service.id, ...service.profiles.map((profile) => profile.phoneNumber)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search)),
    );
  }, [services, query]);

  async function removeService() {
    if (!confirmDelete) return;
    setBusy('delete');
    try {
      await api.deleteService(confirmDelete.id);
      setConfirmDelete(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to delete route');
    } finally {
      setBusy('');
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

  return (
    <div className="page">
      {error && <div className="error">{error}</div>}

      <section className="stack-lg">
        <div className="page-toolbar">
          <div>
            <h2>Routing rules</h2>
            <p>Register application endpoints that receive matching MoMo alerts.</p>
          </div>
          <div className="page-actions">
            <button className="primary" onClick={() => setShowCreate(true)}>
              <Plus size={18} /> New route
            </button>
          </div>
        </div>

        <nav className="console-tabs">
          <button className={cx(tab === 'routing' && 'active')} onClick={() => setTab('routing')}>Routing rules</button>
          <button className={cx(tab === 'integration' && 'active')} onClick={() => setTab('integration')}>How to integrate</button>
        </nav>

        {tab === 'routing' && (
          <div className="stack-lg">
            {loading && services.length === 0 ? (
              <div className="table-wrap">
                <table className="table">
                  <tbody>
                    {[0, 1, 2].map((item) => (
                      <tr key={item}>
                        <td><div className="skeleton-line wide" /></td>
                        <td><div className="skeleton-line" /></td>
                        <td><div className="skeleton-line short" /></td>
                        <td><div className="skeleton-line short" /></td>
                        <td><div className="skeleton-line" /></td>
                        <td><div className="skeleton-line short" /></td>
                        <td><div className="skeleton-line mono" /></td>
                        <td className="right"><div className="skeleton-line short" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : services.length === 0 ? (
              <section className="empty-state">
                <span className="empty-icon"><Router size={28} /></span>
                <h2>No callback routes</h2>
                <p>Register your first application endpoint, then attach a MoMo profile and create an intent expectation.</p>
                <button className="primary" onClick={() => setShowCreate(true)}><Plus size={18} /> Register application</button>
              </section>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Route</th>
                      <th>Status</th>
                      <th>Callback</th>
                      <th>Activity</th>
                      <th>Last delivery</th>
                      <th>Service ID</th>
                      <th className="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredServices.map((service) => (
                      <tr key={service.id}>
                        <td>
                          <div className="entity-cell">
                            <span className="entity-avatar"><Router size={18} /></span>
                            <div>
                              <strong>{service.name}</strong>
                              <small>{service.description || 'No description'}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="status-stack">
                            <span className={cx('pill', service.active ? 'ok' : 'neutral')}>{service.active ? 'Active' : 'Paused'}</span>
                            <span className="muted small-text">{service.profiles.length} profile{service.profiles.length === 1 ? '' : 's'} attached</span>
                          </div>
                        </td>
                        <td>
                          <code className="url-cell" title={service.callbackUrl}>{service.callbackUrl}</code>
                          <small className="cell-sub">Callback endpoint</small>
                        </td>
                        <td>
                          <div className="table-metrics">
                            <span><strong>{service.pendingIntents}</strong> intents</span>
                            <span><strong>{service.pendingDeliveries}</strong> queued</span>
                            <span><strong className={service.failedDeliveries ? 'danger-text' : ''}>{service.failedDeliveries}</strong> failed</span>
                          </div>
                        </td>
                        <td>
                          <strong className="small-text">{relativeTime(service.lastDeliveryAt)}</strong>
                          <small className="cell-sub">{service.pendingDeliveries ? 'Deliveries pending' : 'No pending deliveries'}</small>
                        </td>
                        <td><code className="mono">{service.id.slice(0, 8)}</code></td>
                        <td className="right">
                          <div className="row-actions">
                            <Link className="ghost small" to={`/router/${service.id}`}>
                              Open <ChevronRight size={18} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredServices.length === 0 && <tr><td colSpan={7}><p className="muted empty-inline">No routes match your search.</p></td></tr>}
                  </tbody>
                </table>
                {filteredServices.length === 0 && <p className="muted empty-inline">No routes match your search.</p>}
              </div>
            )}
            {services.length > 0 && !loading && (
              <div className="load-more">
                <button className="ghost" onClick={() => setShowCreate(true)}>Register another application</button>
              </div>
            )}
          </div>
        )}

        {tab === 'integration' && (
          <IntegrationGuide sigLang={sigLang} setSigLang={setSigLang} intentLang={intentLang} setIntentLang={setIntentLang} />
        )}
      </section>

      {showCreate && (
        <NewServiceModal
          onClose={() => setShowCreate(false)}
          onCreated={(service) => {
            setShowCreate(false);
            setSecretService(service);
            void load();
          }}
        />
      )}
      {secretService && (
        <SecretModal
          service={secretService}
          onClose={() => {
            const id = secretService.id;
            setSecretService(null);
            navigate(`/router/${id}`);
          }}
        />
      )}
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

function IntegrationGuide({ sigLang, setSigLang, intentLang, setIntentLang }: { sigLang: string; setSigLang: (s: string) => void; intentLang: string; setIntentLang: (s: string) => void }) {
  // Every fully-qualified URL below is rendered from the configured API origin.
  const apiBase = getApiBaseURL();
  return (
    <div className="stack-lg">
      <div className="page-toolbar">
        <div>
          <h2>Integration guide</h2>
          <p>Connect external systems to PayConnect callback routes and collection intents.</p>
        </div>
      </div>

      <section className="card">
        <div className="card-head"><div><h3>Overview</h3><p>Two directions: inbound calls from your system to PayConnect, and outbound callbacks from PayConnect to your endpoint.</p></div></div>
        <div className="details">
          <div><dt>API base URL</dt><dd className="mono">{apiBase}</dd></div>
          <div><dt>Inbound auth</dt><dd><code>X-PayConnect-Service</code> (route/service ID) and <code>X-PayConnect-Secret</code> (signing secret). No session cookie on server-to-server calls.</dd></div>
          <div><dt>Outbound auth</dt><dd>HMAC-SHA256 signature in <code>X-PayConnect-Signature</code>. Your callback URL must be absolute HTTPS.</dd></div>
          <div><dt>Discovery</dt><dd><code>GET {apiBase}/api/v1/meta</code> returns every URL below from the running router.</dd></div>
          <div><dt>Encoding</dt><dd>JSON request/response bodies.</dd></div>
        </div>
      </section>

      <section className="card">
        <div className="card-head"><div><h3>PayConnect endpoints (fully qualified)</h3><p>These paths match the API router exactly. Replace <code>{'{serviceId}'}</code> with the Service ID shown on the route details page.</p></div></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Purpose</th><th>Method</th><th>URL</th><th>Auth</th></tr></thead>
            <tbody>
              <tr><td>Discover the integration contract</td><td><code>GET</code></td><td className="mono">{apiBase}/api/v1/meta</td><td>None</td></tr>
              <tr><td>Health probe</td><td><code>GET</code></td><td className="mono">{apiBase}/healthz</td><td>None</td></tr>
              <tr><td>Create a collection intent</td><td><code>POST</code></td><td className="mono">{apiBase}/api/v1/services/{'{serviceId}'}/intents</td><td>Service headers or session</td></tr>
              <tr><td>List intents</td><td><code>GET</code></td><td className="mono">{apiBase}/api/v1/services/{'{serviceId}'}/intents</td><td>Service headers or session</td></tr>
              <tr><td>Cancel an intent</td><td><code>DELETE</code></td><td className="mono">{apiBase}/api/v1/services/{'{serviceId}'}/intents/{'{intentId}'}</td><td>Service headers or session</td></tr>
              <tr><td>Inspect callback deliveries</td><td><code>GET</code></td><td className="mono">{apiBase}/api/v1/services/{'{serviceId}'}/deliveries</td><td>Service headers or session</td></tr>
              <tr><td>Post a collection alert</td><td><code>POST</code></td><td className="mono">{apiBase}/api/v1/collect</td><td>Service headers</td></tr>
              <tr><td>Receive callbacks</td><td><code>POST</code></td><td className="mono">{'{the callbackUrl registered on the route}'}</td><td>HMAC signature</td></tr>
            </tbody>
          </table>
        </div>
        <p className="muted small-text">There is no PayConnect <code>/callback</code> route to register: callbacks travel the other way. The callback URL in the last row belongs to your application and is registered when the route is created or edited.</p>
      </section>

      <section className="card">
        <div className="card-head"><div><h3>1. Create a collection intent (your system &rarr; PayConnect)</h3><p>Tell PayConnect to expect a payment. When a matching MoMo alert arrives, PayConnect POSTs <code>collection.matched</code> to the route callback URL.</p></div></div>

        <div className="section-head"><div><h4>Endpoint</h4></div></div>
        <div className="details">
          <div><dt>Method</dt><dd><code>POST</code></dd></div>
          <div><dt>URL</dt><dd className="mono">{apiBase}/api/v1/services/{'{serviceId}'}/intents</dd></div>
          <div><dt>Auth</dt><dd>Either <code>X-PayConnect-Service</code> + <code>X-PayConnect-Secret</code>, or a dashboard session cookie with <code>services:manage</code>.</dd></div>
          <div><dt>Content-Type</dt><dd><code>application/json</code></dd></div>
        </div>

        <div className="section-head"><div><h4>Headers</h4></div></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Header</th><th>Value</th></tr></thead>
            <tbody>
              <tr><td><code>X-PayConnect-Service</code></td><td>Service ID from the route details page; must match <code>{'{serviceId}'}</code>.</td></tr>
              <tr><td><code>X-PayConnect-Secret</code></td><td>Signing secret shown when the route is created or rotated.</td></tr>
              <tr><td><code>Content-Type</code></td><td><code>application/json</code></td></tr>
              <tr><td><code>Idempotency-Key</code></td><td>Optional; same value as the body <code>idempotencyKey</code>. Used when the body field is omitted.</td></tr>
            </tbody>
          </table>
        </div>

        <div className="section-head"><div><h4>Body</h4></div></div>
        <pre className="code-block">{`{
  "profileId": "connected-profile-uuid",
  "phoneNumber": "+2376XXXXXXXX",
  "amount": 5000,
  "currency": "XAF",
  "reference": "INV-1001",
  "idempotencyKey": "INV-1001"
}`}</pre>
        <div className="details">
          <div><dt>profileId</dt><dd>Required; must be attached to this route (service credentials) or accessible to your session (dashboard).</dd></div>
          <div><dt>phoneNumber</dt><dd>Required; the payer phone number the payment is expected from.</dd></div>
          <div><dt>amount</dt><dd>Optional expected amount; matching tolerance is 0.01. Omit to match any amount.</dd></div>
          <div><dt>currency</dt><dd>Defaults to <code>XAF</code>.</dd></div>
          <div><dt>reference</dt><dd>Your order or invoice reference; echoed back in the callback.</dd></div>
          <div><dt>idempotencyKey</dt><dd>Reuse the same key (or the same reference) to update a pending intent. Matched or cancelled intents return <code>409</code>.</dd></div>
          <div><dt>expiresInMinutes</dt><dd>Optional; defaults to <code>2</code> and is capped at <code>2</code>. Pending intents are marked <code>expired</code> automatically.</dd></div>
        </div>

        <div className="section-head"><div><h4>Response (201 new, 200 updated)</h4></div></div>
        <pre className="code-block">{`{
  "id": "intent-uuid",
  "status": "pending",
  "profileId": "connected-profile-uuid",
  "phoneNumber": "+237XXXXXXXX",
  "amount": 5000,
  "currency": "XAF",
  "reference": "INV-1001",
  "idempotencyKey": "INV-1001",
  "expiresInMinutes": 2,
  "created": true
}`}</pre>

        <div className="section-head"><div><h4>Code examples</h4></div></div>
        <div className="code-tabs">
          <CodeTabs active={intentLang} options={['JavaScript', 'Python', 'Java']} onChange={setIntentLang} />
        </div>
        <CodeBlock lang="JavaScript" active={intentLang}>
          {`// JavaScript (fetch)
const SERVICE_ID = 'service-id';
const res = await fetch(\`${apiBase}/api/v1/services/\${SERVICE_ID}/intents\`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-PayConnect-Service': SERVICE_ID,
    'X-PayConnect-Secret': 'signing-secret',
  },
  body: JSON.stringify({
    profileId: 'connected-profile-uuid',
    phoneNumber: '+2376XXXXXXXX',
    amount: 5000,
    currency: 'XAF',
    reference: 'INV-1001',
    idempotencyKey: 'INV-1001',
  }),
});
if (!res.ok) throw new Error(await res.text());
const intent = await res.json(); // { id, status, ... }`}
        </CodeBlock>
        <CodeBlock lang="Python" active={intentLang}>
          {`# Python (requests)
import requests

SERVICE_ID = 'service-id'
url = f'${apiBase}/api/v1/services/{SERVICE_ID}/intents'
headers = {
    'Content-Type': 'application/json',
    'X-PayConnect-Service': SERVICE_ID,
    'X-PayConnect-Secret': 'signing-secret',
}
payload = {
    'profileId': 'connected-profile-uuid',
    'phoneNumber': '+2376XXXXXXXX',
    'amount': 5000,
    'currency': 'XAF',
    'reference': 'INV-1001',
    'idempotencyKey': 'INV-1001',
}
res = requests.post(url, json=payload, headers=headers)
res.raise_for_status()
intent = res.json()`}
        </CodeBlock>
        <CodeBlock lang="Java" active={intentLang}>
          {`// Java (HttpClient)
String serviceId = "service-id";
HttpRequest request = HttpRequest.newBuilder()
    .uri(URI.create("${apiBase}/api/v1/services/" + serviceId + "/intents"))
    .header("Content-Type", "application/json")
    .header("X-PayConnect-Service", serviceId)
    .header("X-PayConnect-Secret", "signing-secret")
    .POST(HttpRequest.BodyPublishers.ofString("""
        {
          "profileId": "connected-profile-uuid",
          "phoneNumber": "+2376XXXXXXXX",
          "amount": 5000,
          "currency": "XAF",
          "reference": "INV-1001",
          "idempotencyKey": "INV-1001"
        }
    """))
    .build();
HttpResponse<String> res = client.send(request, BodyHandlers.ofString());`}
        </CodeBlock>

        <div className="section-head"><div><h4>Track the intent</h4><p>Poll the same service with the same headers. Intents match in arrival order (FIFO) and one payment matches at most one intent per service. Status moves <code>pending</code> &rarr; <code>matched</code>, or to <code>expired</code> after two minutes / <code>cancelled</code>.</p></div></div>
        <pre className="code-block">{`GET ${apiBase}/api/v1/services/{serviceId}/intents
GET ${apiBase}/api/v1/services/{serviceId}/deliveries`}</pre>
      </section>

      <section className="card">
        <div className="card-head"><div><h3>2. Receive callbacks (PayConnect &rarr; your endpoint)</h3><p>PayConnect POSTs matching MoMo alerts to the HTTPS callback URL registered on the route. Verify the HMAC signature before processing.</p></div></div>

        <div className="section-head"><div><h4>Request</h4></div></div>
        <div className="details">
          <div><dt>Method</dt><dd><code>POST</code></dd></div>
          <div><dt>URL</dt><dd className="mono">The <code>callbackUrl</code> registered on your route (not a PayConnect route)</dd></div>
          <div><dt>Content-Type</dt><dd><code>application/json</code></dd></div>
          <div><dt>Retries</dt><dd>Same event is retried with the same <code>X-PayConnect-Idempotency-Key</code>.</dd></div>
        </div>

        <div className="section-head"><div><h4>Headers</h4></div></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Header</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><code>X-PayConnect-Timestamp</code></td><td>Unix seconds when the callback was sent (&plusmn;5 min tolerance).</td></tr>
              <tr><td><code>X-PayConnect-Idempotency-Key</code></td><td>Unique key per delivery; retry-safe deduplication.</td></tr>
              <tr><td><code>X-PayConnect-Signature</code></td><td><code>{'sha256='}</code> HMAC-SHA256 hex over the exact bytes <code>{'{timestamp}.{idempotencyKey}.{rawBody}'}</code>, keyed with the base64url service secret shown when the route was created. Use the raw request body, not a re-serialized JSON object.</td></tr>
            </tbody>
          </table>
        </div>

        <div className="section-head"><div><h4>Body</h4></div></div>
        <pre className="code-block">{`{
  "event": "collection.matched",
  "intentId": "...",
  "profileId": "...",
  "phoneNumber": "+237XXXXXXXX",
  "amount": 5000,
  "currency": "XAF",
  "reference": "INV-1001",
  "recipientName": "...",
  "financialTransactionId": "...",
  "transactionId": "...",
  "direction": "received",
  "matchedAt": "2026-11-11T12:00:00Z",
  "notification": {
    "id": "...",
    "title": "MoMo alert",
    "receivedAt": "2026-11-11T12:00:00Z"
  }
}`}</pre>
        <p className="muted small-text">A <code>collection</code> event posted through <code>{apiBase}/api/v1/collect</code> is delivered with the same shape but contains the caller-supplied <code>phoneNumber</code>, <code>amount</code>, <code>currency</code>, <code>reference</code>, and <code>sourceServiceId</code>.</p>

        <div className="section-head"><div><h4>Verify the signature</h4></div></div>
        <div className="code-tabs">
          <CodeTabs active={sigLang} options={['JavaScript', 'Python', 'Java']} onChange={setSigLang} />
        </div>
        <CodeBlock lang="JavaScript" active={sigLang}>
          {`const crypto = require('crypto');
const express = require('express');
const app = express();

function verifySignature(secret, timestamp, idempotencyKey, rawBody, signature) {
  const now = Math.floor(Date.now() / 1000);
  if (!timestamp || Math.abs(now - Number(timestamp)) > 300) return false;
  if (!signature || !idempotencyKey || !Buffer.isBuffer(rawBody)) return false;

  const message = Buffer.concat([
    Buffer.from(String(timestamp) + '.' + idempotencyKey + '.', 'utf8'),
    rawBody,
  ]);
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');

  const received = Buffer.from(signature, 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  return received.length === wanted.length && crypto.timingSafeEqual(received, wanted);
}

// Keep the raw bytes: do not put express.json() before this route.
app.post(
  '/payconnect/callback',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const ok = verifySignature(
      process.env.PAYCONNECT_SECRET, // base64url secret shown in the dashboard
      req.get('X-PayConnect-Timestamp'),
      req.get('X-PayConnect-Idempotency-Key'),
      req.body, // Buffer with the exact bytes PayConnect sent
      req.get('X-PayConnect-Signature'),
    );
    if (!ok) return res.status(401).send('invalid signature');

    const event = JSON.parse(req.body.toString('utf8'));
    // process event
    res.status(200).send('ok');
  },
);`}
        </CodeBlock>
        <CodeBlock lang="Python" active={sigLang}>
          {`import hmac, hashlib, time
from flask import request, abort

SECRET = b'your-service-secret'  # base64url secret shown in the dashboard

def verify(secret, timestamp, idempotency_key, raw_body, signature):
    message = timestamp.encode() + b'.' + idempotency_key.encode() + b'.' + raw_body
    expected = 'sha256=' + hmac.new(secret, message, hashlib.sha256).hexdigest()
    now = int(time.time())
    if abs(now - int(timestamp)) > 300:
        raise ValueError('stale timestamp')
    return hmac.compare_digest(signature, expected)

@app.route('/payconnect/callback', methods=['POST'])
def callback():
    try:
        ok = verify(
            SECRET,
            request.headers.get('X-PayConnect-Timestamp', ''),
            request.headers.get('X-PayConnect-Idempotency-Key', ''),
            request.get_data(cache=True),  # exact raw body bytes
            request.headers.get('X-PayConnect-Signature', ''),
        )
        if not ok:
            abort(401, 'invalid signature')
        event = request.get_json()
        return 'ok', 200
    except Exception as err:
        return str(err), 400`}
        </CodeBlock>
        <CodeBlock lang="Java" active={sigLang}>
          {`import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

public class Callback {
  static final byte[] SECRET = "your-service-secret".getBytes(StandardCharsets.UTF_8);

  static boolean verify(long timestamp, String idempotencyKey,
                        byte[] rawBody, String signature) throws Exception {
    long now = System.currentTimeMillis() / 1000;
    if (signature == null || Math.abs(now - timestamp) > 300) return false;

    Mac mac = Mac.getInstance("HmacSHA256");
    mac.init(new SecretKeySpec(SECRET, "HmacSHA256"));
    mac.update((timestamp + "." + idempotencyKey + ".").getBytes(StandardCharsets.UTF_8));
    mac.update(rawBody);

    String expected = "sha256=" + bytesToHex(mac.doFinal());
    return MessageDigest.isEqual(
      signature.getBytes(StandardCharsets.UTF_8),
      expected.getBytes(StandardCharsets.UTF_8)
    );
  }

  static String bytesToHex(byte[] bytes) {
    StringBuilder sb = new StringBuilder();
    for (byte b : bytes) sb.append(String.format("%02x", b));
    return sb.toString();
  }
}`}
        </CodeBlock>

        <p className="muted small-text">Capture the raw request body before parsing JSON. In Express, mount this route with <code>express.raw</code> before any <code>express.json()</code> middleware; in Flask, use <code>request.get_data()</code>. The HMAC key is the base64url secret exactly as shown in the dashboard.</p>

        <div className="section-head"><div><h4>Respond</h4></div></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Status</th><th>Meaning</th></tr></thead>
            <tbody>
              <tr><td><code>2xx</code></td><td>Delivery marked delivered; no retry.</td></tr>
              <tr><td><code>429 / 503 / 408</code></td><td>Retried with exponential backoff (up to 10 attempts).</td></tr>
              <tr><td>Other 4xx</td><td>Marked failed permanently; no retry.</td></tr>
            </tbody>
          </table>
        </div>

        <div className="section-head"><div><h4>Callback event types</h4></div></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Event</th><th>Delivered?</th><th>Meaning</th></tr></thead>
            <tbody>
              <tr><td><code>collection.intent</code></td><td>No (stored state)</td><td>An intent expectation was registered through <code>POST /api/v1/services/{'{serviceId}'}/intents</code>. It is matched against incoming MoMo alerts.</td></tr>
              <tr><td><code>collection</code></td><td>Yes</td><td>A payment was posted to <code>POST /api/v1/collect</code> by your system; queued to the route callback URL.</td></tr>
              <tr><td><code>collection.matched</code></td><td>Yes</td><td>An incoming MoMo alert matched a pending intent; POSTed to the route callback URL with the intent, payment, and notification details.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-head"><div><h3>3. Optional: post a collection alert (your system &rarr; PayConnect)</h3><p>Use this when your system already observed a payment and wants PayConnect to record it and notify the route. It is separate from an intent expectation.</p></div></div>

        <div className="section-head"><div><h4>Endpoint</h4></div></div>
        <div className="details">
          <div><dt>Method</dt><dd><code>POST</code></dd></div>
          <div><dt>URL</dt><dd className="mono">{apiBase}/api/v1/collect</dd></div>
          <div><dt>Auth</dt><dd><code>X-PayConnect-Service</code> (service ID) and <code>X-PayConnect-Secret</code> (signing secret). The phone number must belong to a profile attached to this route.</dd></div>
          <div><dt>Content-Type</dt><dd><code>application/json</code></dd></div>
        </div>

        <div className="section-head"><div><h4>Headers</h4></div></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Header</th><th>Value</th></tr></thead>
            <tbody>
              <tr><td><code>X-PayConnect-Service</code></td><td>Service ID (from the route creation response).</td></tr>
              <tr><td><code>X-PayConnect-Secret</code></td><td>Signing secret (copy it when the route is created or rotate it).</td></tr>
              <tr><td><code>Content-Type</code></td><td><code>application/json</code></td></tr>
            </tbody>
          </table>
        </div>

        <div className="section-head"><div><h4>Body</h4></div></div>
        <pre className="code-block">{`{
  "phoneNumber": "+237XXXXXXXX",
  "amount": 5000,
  "currency": "XAF",
  "idempotencyKey": "unique-key",
  "reference": "INV-1001"
}`}</pre>

        <div className="details">
          <div><dt>idempotencyKey</dt><dd>Required; deduplicates retries for this route.</dd></div>
          <div><dt>phoneNumber</dt><dd>Phone number of the attached profile that received the payment.</dd></div>
          <div><dt>amount</dt><dd>Received amount; must be greater than zero.</dd></div>
          <div><dt>currency</dt><dd>Defaults to <code>XAF</code>.</dd></div>
          <div><dt>reference</dt><dd>Echoed back in the delivered event.</dd></div>
        </div>

        <div className="section-head"><div><h4>Response (202)</h4></div></div>
        <pre className="code-block">{`{
  "eventId": "uuid",
  "deliveries": 1
}`}</pre>

        <div className="section-head"><div><h4>Code examples</h4></div></div>
        <div className="code-tabs">
          <CodeTabs active={intentLang} options={['JavaScript', 'Python', 'Java']} onChange={setIntentLang} />
        </div>
        <CodeBlock lang="JavaScript" active={intentLang}>
          {`// JavaScript (fetch)
const res = await fetch(\`${apiBase}/api/v1/collect\`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-PayConnect-Service': 'service-id',
    'X-PayConnect-Secret': 'signing-secret',
  },
  body: JSON.stringify({
    phoneNumber: '+237XXXXXXXX',
    amount: 5000,
    currency: 'XAF',
    idempotencyKey: 'unique-key',
    reference: 'INV-1001',
  }),
});
if (!res.ok) throw new Error(await res.text());
const result = await res.json(); // { eventId, deliveries }`}
        </CodeBlock>
        <CodeBlock lang="Python" active={intentLang}>
          {`# Python (requests)
import requests

url = '${apiBase}/api/v1/collect'
headers = {
    'Content-Type': 'application/json',
    'X-PayConnect-Service': 'service-id',
    'X-PayConnect-Secret': 'signing-secret',
}
payload = {
    'phoneNumber': '+237XXXXXXXX',
    'amount': 5000,
    'currency': 'XAF',
    'idempotencyKey': 'unique-key',
    'reference': 'INV-1001',
}
res = requests.post(url, json=payload, headers=headers)
res.raise_for_status()
result = res.json()`}
        </CodeBlock>
        <CodeBlock lang="Java" active={intentLang}>
          {`// Java (HttpClient)
HttpRequest request = HttpRequest.newBuilder()
    .uri(URI.create("${apiBase}/api/v1/collect"))
    .header("Content-Type", "application/json")
    .header("X-PayConnect-Service", "service-id")
    .header("X-PayConnect-Secret", "signing-secret")
    .POST(HttpRequest.BodyPublishers.ofString("""
        {
          "phoneNumber": "+237XXXXXXXX",
          "amount": 5000,
          "currency": "XAF",
          "idempotencyKey": "unique-key",
          "reference": "INV-1001"
        }
    """))
    .build();
HttpResponse<String> res = client.send(request, BodyHandlers.ofString());`}
        </CodeBlock>

        <div className="section-head"><div><h4>Tracking deliveries</h4><p>Every outbound attempt is recorded. Poll <code>GET {apiBase}/api/v1/services/{'{serviceId}'}/deliveries</code> with the same service headers to inspect status, attempts, last response, and payload.</p></div></div>
      </section>

      <section className="card">
        <div className="card-head"><div><h3>Error codes</h3><p>HTTP status and meaning returned by PayConnect APIs.</p></div></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Status</th><th>Meaning</th><th>Action</th></tr></thead>
            <tbody>
              <tr><td><code>200</code></td><td>OK / metadata or read succeeded.</td><td>None.</td></tr>
              <tr><td><code>201</code></td><td>Intent created.</td><td>Store the intent id.</td></tr>
              <tr><td><code>202</code></td><td>Collection queued for delivery.</td><td>Track eventId.</td></tr>
              <tr><td><code>204</code></td><td>Deleted / cancelled.</td><td>None.</td></tr>
              <tr><td><code>400</code></td><td>Invalid request body or missing fields.</td><td>Fix the payload.</td></tr>
              <tr><td><code>401</code></td><td>Authentication failed (session, service ID, or secret).</td><td>Re-auth or rotate secret.</td></tr>
              <tr><td><code>403</code></td><td>Permission denied (services:manage).</td><td>Grant the role permission.</td></tr>
              <tr><td><code>404</code></td><td>Service, profile, or intent not found; or the profile is not attached to the service.</td><td>Verify IDs, attachments, and access.</td></tr>
              <tr><td><code>409</code></td><td>Conflict (duplicate idempotency key, session in use).</td><td>Use a new key or retry later.</td></tr>
              <tr><td><code>429</code></td><td>Rate limited.</td><td>Retry after backoff.</td></tr>
              <tr><td><code>503</code></td><td>Service temporarily unavailable.</td><td>Retry.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
