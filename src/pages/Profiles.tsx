import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ProfileSummary } from '../api';
import { ProfileAuthModal } from '../components/ProfileAuthModal';
import { useGlobalSearch, usePageMeta } from '../components/layout/Shell';
import { cx, formatMoney, providerLabel, relativeTime, statusTone } from '../lib/format';
import { ChevronRight, Plus, TriangleAlert, Users, Wallet, Wifi } from 'lucide-react';

export function ProfilesPage() {
  usePageMeta({ title: 'Profiles' });
  const { query } = useGlobalSearch();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [resumePhone, setResumePhone] = useState('');

  async function load(showSpinner = false) {
    if (showSpinner) setLoading(true);
    try {
      setProfiles(await api.profiles());
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load profiles');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(true);
    const timer = window.setInterval(() => void load(false), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const totals = useMemo(() => {
    const currency = profiles.find((profile) => profile.balance)?.balance?.currency ?? 'XAF';
    const balance = profiles.reduce((sum, profile) => sum + (profile.balance?.amount ?? 0), 0);
    return {
      currency,
      balance,
      connected: profiles.filter((profile) => profile.authStatus === 'active').length,
      listeners: profiles.filter((profile) => profile.fcmStatus === 'active').length,
      unread: profiles.reduce((sum, profile) => sum + profile.unreadNotifications, 0),
    };
  }, [profiles]);

  const filteredProfiles = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return profiles;
    return profiles.filter((profile) =>
      [profile.phoneNumber, profile.provider, profile.deviceModel, profile.authStatus, profile.fcmStatus, profile.balance?.currency]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search)),
    );
  }, [profiles, query]);

  return (
    <div className="page">
      <div className="page-toolbar">
        <div>
          <p className="page-lede">Connect MoMo accounts, watch their push listeners, and keep every payment alert in one place.</p>
        </div>
        <div className="page-actions">
          <button
            className="primary"
            onClick={() => {
              setResumePhone('');
              setShowCreate(true);
            }}
          >
            <Plus size={18} /> Connect profile
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <section className="stat-grid">
        <article className="stat-card accent">
          <span className="stat-icon"><Wallet size={18} /></span>
          <small>Combined balance</small>
          <strong>{formatMoney(totals.balance, totals.currency)}</strong>
          <em>{profiles.length} profile{profiles.length === 1 ? '' : 's'} tracked</em>
        </article>
        <article className="stat-card">
          <span className="stat-icon"><Users size={18} /></span>
          <small>Connected profiles</small>
          <strong>{totals.connected}</strong>
          <em>{profiles.length - totals.connected} draft or paused</em>
        </article>
        <article className="stat-card">
          <span className="stat-icon"><Wifi size={18} /></span>
          <small>Live listeners</small>
          <strong>{totals.listeners}</strong>
          <em>Independent FCM per profile</em>
        </article>
        <article className="stat-card">
          <span className="stat-icon"><TriangleAlert size={18} /></span>
          <small>Unread alerts</small>
          <strong>{totals.unread}</strong>
          <em>Routed by phone and amount</em>
        </article>
      </section>

      <section className="stack-lg">
        <div className="page-toolbar">
          <div>
            <h2>Connected profiles</h2>
            <p>Each profile is an isolated provider session with its own push credentials.</p>
          </div>
          <div className="page-actions">
          </div>
        </div>

        {loading && profiles.length === 0 ? (
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {[0, 1, 2].map((item) => (
                  <tr key={item}>
                    <td><div className="skeleton-line wide" /></td>
                    <td><div className="skeleton-line short" /></td>
                    <td><div className="skeleton-line" /></td>
                    <td><div className="skeleton-line" /></td>
                    <td><div className="skeleton-line short" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : profiles.length === 0 ? (
          <section className="empty-state">
            <span className="empty-icon"><Users size={28} /></span>
            <h2>No profiles yet</h2>
            <p>Connect your first MoMo account to start receiving live payment alerts and synchronizing history.</p>
            <button className="primary" onClick={() => setShowCreate(true)}>
              <Plus size={18} /> Connect a profile
            </button>
          </section>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Profile</th>
                  <th>Status</th>
                  <th>Balance</th>
                  <th>Activity</th>
                  <th>Last sync</th>
                  <th>Profile ID</th>
                  <th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProfiles.map((profile) => {
                  const draft = profile.authStatus === 'draft';
                  const statusLabel = draft ? 'Draft' : profile.fcmStatus === 'active' ? 'Listening' : profile.fcmStatus.replaceAll('_', ' ');
                  return (
                    <tr key={profile.id}>
                      <td>
                        <div className="entity-cell">
                          <span className="entity-avatar">{profile.provider === 'mtn_momo' ? 'M' : 'P'}</span>
                          <div>
                            <strong>{profile.phoneNumber}</strong>
                            <small>{providerLabel(profile.provider)} · {profile.deviceModel || 'Saved device'}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="status-stack">
                          <span className={cx('pill', statusTone(draft ? 'draft' : profile.fcmStatus))}>{statusLabel}</span>
                          <span className="muted small-text">{profile.authStatus === 'active' ? 'Session active' : 'Setup incomplete'}</span>
                        </div>
                      </td>
                      <td>
                        <strong>{profile.balance ? formatMoney(profile.balance.amount, profile.balance.currency) : 'Not synced'}</strong>
                        <small className="cell-sub">{profile.balance ? `Updated ${relativeTime(profile.balanceObservedAt)}` : 'Run a sync to load'}</small>
                      </td>
                      <td>
                        <div className="table-metrics">
                          <span><strong>{profile.transactionCount}</strong> transactions</span>
                          <span><strong>{profile.notificationCount}</strong> alerts</span>
                          <span><strong>{profile.unreadNotifications}</strong> unread</span>
                        </div>
                      </td>
                      <td>
                        <strong className="small-text">{relativeTime(profile.lastSyncedAt)}</strong>
                        <small className="cell-sub">{profile.fcmStatus === 'active' ? 'Push live' : 'Push paused'}</small>
                      </td>
                      <td><code className="mono">{profile.id.slice(0, 8)}</code></td>
                      <td className="right">
                        <div className="row-actions">
                          {draft ? (
                            <button
                              className="ghost small"
                              onClick={() => {
                                setResumePhone(profile.phoneNumber);
                                setShowCreate(true);
                              }}
                            >
                              Continue setup <ChevronRight size={18} />
                            </button>
                          ) : (
                            <Link className="ghost small" to={`/profiles/${profile.id}`}>
                              Open <ChevronRight size={18} />
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredProfiles.length === 0 && <p className="muted empty-inline">No profiles match your search.</p>}
          </div>
        )}
      </section>

      {showCreate && (
        <ProfileAuthModal
          initialPhone={resumePhone}
          existingPhones={profiles.map((profile) => profile.phoneNumber)}
          onClose={() => setShowCreate(false)}
          onCreated={(profileId) => {
            setShowCreate(false);
            void load();
            navigate(`/profiles/${profileId}`);
          }}
        />
      )}
    </div>
  );
}
