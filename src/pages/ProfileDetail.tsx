import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, Notification, ProfileDetail, Session, Transaction } from '../api';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ReauthModal } from '../components/ReauthModal';
import { TransactionDetailDialog } from '../components/Transaction/TransactionDetailDialog';
import { useEventStream, useGlobalSearch, usePageActions, usePageMeta, useToast } from '../components/Shell';
import { cx, formatDate, formatMoney, providerLabel, relativeTime, statusTone } from '../lib/format';
import { ArrowLeft, ArrowLeftRight, Check, ChevronLeft, ChevronRight, Clock, Download, KeyRound, RefreshCw, Send, Smartphone, TriangleAlert, Unplug, Wifi } from 'lucide-react';

type Props = { session: Session };

type Tab = 'overview' | 'transactions' | 'alerts' | 'account' | 'connection';

function tabFromPath(pathname: string, id: string): Tab {
  const tail = pathname.split('/').filter(Boolean).pop();
  if (tail === 'transactions' || tail === 'alerts' || tail === 'account' || tail === 'connection') return tail;
  return 'overview';
}

function eventNotification(event: { profileId?: string; at: string; data?: Record<string, unknown> | null }, profile: ProfileDetail): Notification | null {
  const data = event.data ?? {};
  if (typeof data.id !== 'string') return null;
  return {
    id: data.id,
    profileId: event.profileId ?? profile.id,
    phoneNumber: profile.phoneNumber,
    title: String(data.title ?? 'MoMo alert'),
    body: String(data.body ?? ''),
    data: (data.data as Record<string, unknown> | undefined) ?? {},
    category: String((data.data as Record<string, unknown> | undefined)?.category ?? ''),
    receivedAt: String(data.receivedAt ?? event.at),
  };
}

const alertFetchPageSize = 500;
const alertFetchMax = 5000;

async function fetchAllNotifications(profileId: string): Promise<Notification[]> {
  const all: Notification[] = [];
  for (let offset = 0; offset < alertFetchMax; offset += alertFetchPageSize) {
    const page = await api.profileNotifications(profileId, { limit: alertFetchPageSize, offset });
    all.push(...page);
    if (page.length < alertFetchPageSize) break;
  }
  return all;
}

export function ProfileDetailPage({ session }: Props) {
  const { id = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const { query } = useGlobalSearch();
  const [profile, setProfile] = useState<ProfileDetail>();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reauth, setReauth] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [busy, setBusy] = useState('');
  const [direction, setDirection] = useState('');
  const [status, setStatus] = useState('');
  const [txPage, setTxPage] = useState(1);
  const [txPageSize, setTxPageSize] = useState(25);
  const [txTotal, setTxTotal] = useState(0);
  const [txLoading, setTxLoading] = useState(false);
  const [alertSearch, setAlertSearch] = useState('');
  const [alertCategory, setAlertCategory] = useState('');
  const [alertRead, setAlertRead] = useState<'all' | 'unread' | 'read'>('all');
  const [notifPage, setNotifPage] = useState(1);
  const [notifPageSize, setNotifPageSize] = useState(25);
  const [notifLoading, setNotifLoading] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showTransactionDetail, setShowTransactionDetail] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  const tab = tabFromPath(location.pathname, id);
  const tabTitle = tab === 'overview' ? 'Profile overview' : tab === 'transactions' ? 'Profile transactions' : tab === 'alerts' ? 'Profile alerts' : tab === 'account' ? 'Profile account' : 'Profile connection';
  usePageMeta({ title: tabTitle });

  const refreshProfile = useCallback(async () => {
    try {
      setProfile(await api.profile(id));
    } catch {
      // Keep the last known profile on transient failures.
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.profile(id)
      .then((nextProfile) => {
        if (cancelled) return;
        setProfile(nextProfile);
        setError('');
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load profile');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setTxPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const loadTransactions = useCallback(async () => {
    if (tab !== 'transactions' && tab !== 'overview') return;
    const table = tab === 'transactions';
    const limit = table ? txPageSize : 5;
    const offset = table ? (txPage - 1) * txPageSize : 0;
    setTxLoading(true);
    try {
      const page = await api.profileTransactions(id, {
        limit,
        offset,
        direction: table ? direction : '',
        status: table ? status : '',
        q: table ? debouncedQuery : '',
      });
      if (table) {
        setTransactions(page.transactions);
        setTxTotal(page.total);
      } else {
        setRecentTransactions(page.transactions);
      }
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load transactions');
    } finally {
      setTxLoading(false);
    }
  }, [id, tab, txPage, txPageSize, direction, status, debouncedQuery]);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  const loadNotifications = useCallback(async () => {
    if (tab !== 'overview' && tab !== 'alerts') return;
    setNotifLoading(true);
    try {
      setNotifications(await fetchAllNotifications(id));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load alerts');
    } finally {
      setNotifLoading(false);
    }
  }, [id, tab]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const txTotalPages = Math.max(1, Math.ceil(txTotal / txPageSize));
  useEffect(() => {
    if (txPage > txTotalPages) setTxPage(txTotalPages);
  }, [txPage, txTotalPages]);

  useEventStream(id ? `/api/v1/profiles/${id}/events/stream` : null, (event) => {
    if (event.profileId && event.profileId !== id) return;
    const data = event.data ?? {};
    if (event.type === 'notification') {
      // Shell owns stream-driven toasts: it already listens to the global stream
      // and is mounted for every page, so toasting here duplicated the same alert.
      // The side effects also live outside the state updater on purpose — React
      // StrictMode double-invokes updaters, which turned one alert into three.
      if (profile) {
        const notification = eventNotification(event, profile);
        if (notification) {
          setNotifications((items) => [notification, ...items.filter((item) => item.id !== notification.id)]);
        }
        setProfile((current) =>
          current ? { ...current, unreadNotifications: current.unreadNotifications + 1, notificationCount: current.notificationCount + 1 } : current,
        );
      }
    }
    if (event.type === 'notification.read') {
      const notificationId = typeof data.notificationId === 'string' ? data.notificationId : '';
      setNotifications((items) =>
        data.all ? items.map((item) => ({ ...item, readAt: new Date().toISOString() })) : items.map((item) => (item.id === notificationId ? { ...item, readAt: new Date().toISOString() } : item)),
      );
      setProfile((current) =>
        current
          ? { ...current, unreadNotifications: data.all ? 0 : Math.max(0, current.unreadNotifications - 1) }
          : current,
      );
    }
    if (event.type === 'transaction') {
      const transaction = data as unknown as Transaction;
      if (transaction?.id) {
        // New payments can be painted immediately on the first page. Updates and
        // filtered views re-read the active page so ordering and totals stay
        // authoritative.
        const filtered = Boolean(direction || status || debouncedQuery);
        if (transaction.created !== false && !filtered && (tab === 'overview' || (tab === 'transactions' && txPage === 1))) {
          if (tab === 'overview') {
            setRecentTransactions((items) => [transaction, ...items.filter((item) => item.id !== transaction.id)].slice(0, 5));
          } else {
            setTransactions((items) => [transaction, ...items.filter((item) => item.id !== transaction.id)].slice(0, txPageSize));
            setTxTotal((total) => total + 1);
          }
        } else {
          void loadTransactions();
        }
        // Alerts upsert by provider transaction id: only count a row when it is
        // genuinely new. Later syncs update the row in place. The toast for this
        // payment is raised once by Shell from the matching "notification" event.
        if (transaction.created !== false) {
          setProfile((current) => (current ? { ...current, transactionCount: current.transactionCount + 1 } : current));
        }
      }
    }
    if (event.type === 'transactions') {
      // A sync upserts missing rows; reload so the table reflects the merge
      // without duplicating rows that already arrived over SSE.
      void loadTransactions();
      void refreshProfile();
    }
    if (event.type === 'balance') {
      setProfile((current) => (current ? { ...current, balance: data as unknown as ProfileDetail['balance'], balanceObservedAt: event.at } : current));
    }
    if (event.type === 'sync') {
      const nextStatus = String(data.status ?? '');
      if (nextStatus === 'running') {
        setProfile((current) => (current ? { ...current, syncStatus: 'running' } : current));
      } else if (nextStatus === 'idle') {
        setProfile((current) => (current ? { ...current, syncStatus: 'idle' } : current));
        void refreshProfile();
        void loadTransactions();
        void loadNotifications();
      } else if (nextStatus === 'error') {
        // Auto-open reauth dialog on sync failure so the user can refresh
        // the provider session without having to click a separate button.
        setReauth(true);
        // Shell raises the failure toast from the global stream; toasting here as
        // well produced a second copy in a different colour (danger vs warning).
        setProfile((current) =>
          current ? { ...current, syncStatus: 'error', syncError: String(data.error ?? '') } : current,
        );
        void refreshProfile();
      }
    }
    if (event.type === 'fcm') {
      setProfile((current) =>
        current
          ? {
              ...current,
              fcmStatus: (data.status as ProfileDetail['fcmStatus']) ?? current.fcmStatus,
              fcmEnabled: typeof data.enabled === 'boolean' ? data.enabled : current.fcmEnabled,
            }
          : current,
      );
    }
  });

  const alertCategories = useMemo(
    () => Array.from(new Set(notifications.map((item) => item.category).filter((value): value is string => Boolean(value)))).sort(),
    [notifications],
  );

  const filteredNotifications = useMemo(() => {
    const global = query.trim().toLowerCase();
    const local = alertSearch.trim().toLowerCase();
    return notifications.filter((notification) => {
      const haystack = [notification.title, notification.body, notification.category, notification.routedTo, notification.phoneNumber]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());
      const matchesGlobal = !global || haystack.some((value) => value.includes(global));
      const matchesLocal = !local || haystack.some((value) => value.includes(local));
      const matchesCategory = !alertCategory || notification.category === alertCategory;
      const matchesRead = alertRead === 'all' || (alertRead === 'unread' ? !notification.readAt : Boolean(notification.readAt));
      return matchesGlobal && matchesLocal && matchesCategory && matchesRead;
    });
  }, [notifications, query, alertSearch, alertCategory, alertRead]);

  const notifTotalPages = Math.max(1, Math.ceil(filteredNotifications.length / notifPageSize));
  const pagedNotifications = useMemo(
    () => filteredNotifications.slice((notifPage - 1) * notifPageSize, notifPage * notifPageSize),
    [filteredNotifications, notifPage, notifPageSize],
  );

  useEffect(() => {
    if (notifPage > notifTotalPages) setNotifPage(notifTotalPages);
  }, [notifPage, notifTotalPages]);

  useEffect(() => {
    setNotifPage(1);
  }, [alertSearch, alertCategory, alertRead, query, notifPageSize]);

  const unread = notifications.filter((item) => !item.readAt).length;

  const pageActions = useMemo(() => {
    if (!profile) return null;
    return (
      <button
        className="icon-button"
        onClick={() => void sync()}
        disabled={busy === 'sync'}
        title={
          busy === 'sync'
            ? 'Syncing…'
            : profile.lastSyncedAt
              ? `Sync now · last synced ${relativeTime(profile.lastSyncedAt)}`
              : 'Sync now'
        }
        aria-label={busy === 'sync' ? 'Syncing' : 'Sync now'}
      >
        <RefreshCw size={18} />
      </button>
    );
  }, [profile, busy]);

  usePageActions(pageActions);

  async function sync() {
    setBusy('sync');
    try {
      await api.syncProfile(id);
      setProfile((current) => (current ? { ...current, syncStatus: 'running' } : current));
      pushToast({ title: 'Synchronization started', body: 'New balance, transactions since the last sync, and provider alerts are refreshing in the background.', tone: 'info' });
      window.setTimeout(() => void refreshProfile(), 2500);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409 && cause.message.toLowerCase().includes('session')) {
        setReauth(true);
      } else {
        pushToast({ title: 'Sync could not start', body: cause instanceof Error ? cause.message : 'Unable to synchronize profile', tone: 'danger' });
      }
    } finally {
      setBusy('');
    }
  }

  async function toggleFCM() {
    if (!profile) return;
    setBusy('fcm');
    try {
      const result = profile.fcmEnabled ? await api.disableFCM(id) : await api.enableFCM(id);
      setProfile((current) => (current ? { ...current, fcmEnabled: result.enabled, fcmStatus: result.status as ProfileDetail['fcmStatus'] } : current));
      pushToast({
        title: result.enabled ? 'FCM listener enabled' : 'FCM listener paused',
        body: result.enabled ? 'This profile now receives its own push notifications.' : 'Push notifications are paused for this profile.',
        tone: result.enabled ? 'success' : 'info',
      });
    } catch (cause) {
      pushToast({ title: 'FCM update failed', body: cause instanceof Error ? cause.message : 'Unable to update FCM', tone: 'danger' });
    } finally {
      setBusy('');
    }
  }

  async function disconnect() {
    setBusy('disconnect');
    try {
      await api.disconnectProfile(id);
      pushToast({ title: 'Profile disconnected', body: 'The session and push credentials were cleared. History was retained.', tone: 'success' });
      navigate('/profiles');
    } catch (cause) {
      pushToast({ title: 'Disconnect failed', body: cause instanceof Error ? cause.message : 'Unable to disconnect profile', tone: 'danger' });
    } finally {
      setBusy('');
    }
  }

  async function markRead(notification: Notification) {
    setNotifications((items) => items.map((item) => (item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item)));
    setProfile((current) => (current ? { ...current, unreadNotifications: Math.max(0, current.unreadNotifications - 1) } : current));
    await api.markNotificationRead(id, notification.id).catch(() => undefined);
  }

  async function markAllRead() {
    setNotifications((items) => items.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
    setProfile((current) => (current ? { ...current, unreadNotifications: 0 } : current));
    await api.markAllNotificationsRead(id).catch(() => undefined);
  }

  if (loading && !profile) {
    return (
      <div className="page">
        <div className="detail-loading">
          <span className="spinner" />
          <p>Loading profile workspace…</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page">
        <Link to="/profiles" className="back-link"><ArrowLeft size={18} /> All profiles</Link>
        <div className="empty-state">
          <h2>Profile unavailable</h2>
          <p>{error || 'This profile may have been removed or you no longer have access.'}</p>
        </div>
      </div>
    );
  }

  const fcmTone = statusTone(profile.fcmStatus);
  const authTone = statusTone(profile.authStatus);

  return (
    <div className="page">
      <header className="detail-head">
        <div className="detail-title">
          <Link to="/profiles" className="back-link"><ArrowLeft size={18} /> All profiles</Link>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      <section className="detail-main">
          {tab === 'overview' && (
            <>
              <section className="balance-hero">
                <div>
                  <span className="eyebrow">AVAILABLE BALANCE</span>
                  <strong>{profile.balance ? formatMoney(profile.balance.amount, profile.balance.currency) : 'Not synced'}</strong>
                  <p>{profile.balance ? `Last observed ${formatDate(profile.balanceObservedAt)}` : 'Run a synchronization to load the latest balance from MoMo.'}</p>
                </div>
                <div className="balance-hero-side">
                  <span className={cx('pill', fcmTone)}>{profile.fcmStatus === 'active' ? 'Live listener' : 'Listener paused'}</span>
                  <small>Synced {relativeTime(profile.lastSyncedAt)}</small>
                </div>
              </section>

              <section className="metric-grid">
                <article className="metric">
                  <span className="stat-icon"><ArrowLeftRight size={18} /></span>
                  <small>Transactions</small>
                  <strong>{profile.transactionCount}</strong>
                  <em>Persisted history</em>
                </article>
                <article className="metric">
                  <span className="stat-icon"><TriangleAlert size={18} /></span>
                  <small>Alerts</small>
                  <strong>{profile.notificationCount}</strong>
                  <em>{profile.unreadNotifications} unread</em>
                </article>
                <article className="metric">
                  <span className="stat-icon"><Clock size={18} /></span>
                  <small>Last alert</small>
                  <strong>{relativeTime(profile.fcmLastEventAt)}</strong>
                  <em>FCM delivery</em>
                </article>
                <article className="metric">
                  <span className="stat-icon"><Smartphone size={18} /></span>
                  <small>Device</small>
                  <strong>{profile.deviceModel || 'Saved'}</strong>
                  <em>{profile.deviceBrand || profile.deviceType}</em>
                </article>
              </section>

              <div className="two-column">
                <section className="card">
                  <div className="card-head">
                    <div>
                      <h2>Recent transactions</h2>
                      <p>Newest synchronized activity.</p>
                    </div>
                    <Link className="subtle" to={`/profiles/${id}/transactions`}>View all <ChevronRight size={18} /></Link>
                  </div>
                  <div className="list">
                    {recentTransactions.map((transaction) => {
                        const typeMap: Record<string, string> = {
                          CREDIT: 'Credit',
                          DEBIT: 'Debit',
                          PAYMENT: 'Payment',
                          CASH_IN: 'Cash In',
                          CASH_OUT: 'Cash Out',
                          TRANSFER: 'Transfer',
                          BILL_PAYMENT: 'Bill Payment',
                          PAYMENT_SEND: 'Payment Send',
                        };
                        const type = typeMap[transaction.direction] || transaction.direction;

                        // Extract sender/receiver from metadata or reference
                        const metadata = transaction.metadata;
                        const senderValue = metadata?.sender ?? transaction.reference;
                        const sender = typeof senderValue === 'string' && senderValue.trim() ? senderValue : 'N/A';
                        const receiverAmount =
                          typeof metadata?.receiverAmount === 'number'
                            ? formatMoney(metadata.receiverAmount, typeof metadata?.currency === 'string' ? metadata.currency : transaction.currency)
                            : 'N/A';

                        return (
                          <div
                            className="list-row clickable"
                            key={transaction.id}
                            onClick={() => {
                              setSelectedTransaction(transaction);
                              setShowTransactionDetail(true);
                            }}
                          >
                            <span className="list-mark">
                              {transaction.direction === 'CREDIT' ? <Download size={18} /> : <Send size={18} />}
                            </span>
                            <div className="main">
                              <strong>{type}</strong>
                              <small>{transaction.direction} · {transaction.status}</small>
                            </div>
                            <span className="amount">
                              {formatMoney(transaction.amount, transaction.currency)}
                            </span>
                            <span className="sender-receiver">
                              <strong>{sender}</strong>
                              <span>{receiverAmount}</span>
                            </span>
                          </div>
                        );
                      })}
                    {recentTransactions.length === 0 && <p className="muted empty-inline">No transactions have been synchronized yet.</p>}
                  </div>
                </section>

                <section className="card">
                  <div className="card-head">
                    <div>
                      <h2>Recent alerts</h2>
                      <p>Live MoMo notifications for this profile.</p>
                    </div>
                    <Link className="subtle" to={`/profiles/${id}/alerts`}>View all <ChevronRight size={18} /></Link>
                  </div>
                  <div className="list">
                    {notifications.slice(0, 5).map((notification) => (
                      <div className={cx('list-row alert-row', !notification.readAt && 'unread')} key={notification.id}>
                        <span className="list-mark alert"><TriangleAlert size={18} /></span>
                        <div className="main">
                          <strong>{notification.title}</strong>
                          <small>{notification.body || 'Incoming provider alert'}</small>
                        </div>
                        <span className="muted small-text">{relativeTime(notification.receivedAt)}</span>
                      </div>
                    ))}
                    {notifications.length === 0 && <p className="muted empty-inline">No alerts have arrived for this profile.</p>}
                  </div>
                </section>
              </div>
            </>
          )}

          {tab === 'transactions' && (
            <div className="stack-lg">
              <div className="page-toolbar">
                <div>
                  <h2>Transaction history</h2>
                  <p className="page-lede">Synchronized MoMo history. Filters are applied by the API before pagination.</p>
                  <div className="sync-meta">
                    <span className={cx('pill', statusTone(profile.syncStatus))}>
                      {profile.syncStatus === 'running' ? 'Syncing' : `Sync ${profile.syncStatus}`}
                    </span>
                    <span className="muted small-text">
                      {profile.syncStatus === 'running'
                        ? 'Pulling transactions since the last sync…'
                        : profile.lastSyncedAt
                          ? `Last synced ${relativeTime(profile.lastSyncedAt)} · ${formatDate(profile.lastSyncedAt)}`
                          : 'Never synced'}
                    </span>
                  </div>
                </div>
                <div className="page-actions">
                  <select
                    className="filter-select"
                    aria-label="Filter transactions by direction"
                    value={direction}
                    onChange={(event) => {
                      setTxPage(1);
                      setDirection(event.target.value);
                    }}
                  >
                    <option value="">All directions</option>
                    <option value="CREDIT">Credit</option>
                    <option value="DEBIT">Debit</option>
                    <option value="TRANSFER">Transfer</option>
                  </select>
                  <select
                    className="filter-select"
                    aria-label="Filter transactions by status"
                    value={status}
                    onChange={(event) => {
                      setTxPage(1);
                      setStatus(event.target.value);
                    }}
                  >
                    <option value="">All statuses</option>
                    <option value="SUCCESSFUL">Successful</option>
                    <option value="FAILED">Failed</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                  {(direction || status) && (
                    <button
                      className="ghost small"
                      onClick={() => {
                        setTxPage(1);
                        setDirection('');
                        setStatus('');
                      }}
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Direction</th>
                      <th>Reference</th>
                      <th>Transaction ID</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th className="right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((transaction) => (
                      <tr
                        key={transaction.id}
                        className="clickable"
                        onClick={() => {
                          setSelectedTransaction(transaction);
                          setShowTransactionDetail(true);
                        }}
                      >
                        <td>
                          <span className={cx('pill', transaction.direction === 'CREDIT' ? 'ok' : 'neutral')}>{transaction.direction}</span>
                        </td>
                        <td>
                          <strong>{transaction.reference || '—'}</strong>
                          <small className="cell-sub">{transaction.providerTransactionId || transaction.id.slice(0, 8)}</small>
                        </td>
                        <td><code className="mono">{transaction.id.slice(0, 8)}</code></td>
                        <td><span className={cx('pill', statusTone(transaction.status.toLowerCase()))}>{transaction.status}</span></td>
                        <td>{formatDate(transaction.occurredAt)}</td>
                        <td className={cx('right amount', transaction.direction === 'CREDIT' ? 'credit' : 'debit')}>
                          {transaction.direction === 'CREDIT' ? '+' : '−'}{formatMoney(transaction.amount, transaction.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {txLoading && transactions.length === 0 && <p className="muted empty-inline">Loading transactions…</p>}
                {!txLoading && transactions.length === 0 && <p className="muted empty-inline">No transactions match this view.</p>}
              </div>
              <div className="pagination">
                <span className="muted small-text">
                  {txTotal === 0
                    ? 'No transactions'
                    : `Showing ${(txPage - 1) * txPageSize + 1}–${Math.min(txPage * txPageSize, txTotal)} of ${txTotal}`}
                  {txLoading && txTotal > 0 ? ' · Updating…' : ''}
                </span>
                <div className="pagination-actions">
                  <label className="pagination-size">
                    Rows
                    <select value={txPageSize} onChange={(event) => setTxPageSize(Number(event.target.value))}>
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </label>
                  <button className="ghost small" disabled={txPage <= 1 || txLoading} onClick={() => setTxPage((page) => Math.max(1, page - 1))}>
                    <ChevronLeft size={16} /> Prev
                  </button>
                  <span className="pagination-page">Page {txPage} of {txTotalPages}</span>
                  <button className="ghost small" disabled={txPage >= txTotalPages || txLoading} onClick={() => setTxPage((page) => page + 1)}>
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'alerts' && (
            <div className="stack-lg">
              <div className="page-toolbar">
                <div>
                  <h2>Alerts</h2>
                  <p className="page-lede">Provider notifications stored for this profile. Filtering and pagination run locally.</p>
                  <div className="sync-meta">
                    <span className={cx('pill', statusTone(profile.syncStatus))}>
                      {profile.syncStatus === 'running' ? 'Syncing' : `Sync ${profile.syncStatus}`}
                    </span>
                    <span className="muted small-text">
                      {profile.lastSyncedAt
                        ? `Last synced ${relativeTime(profile.lastSyncedAt)} · ${formatDate(profile.lastSyncedAt)}`
                        : 'Never synced'}
                    </span>
                  </div>
                </div>
                <div className="page-actions">
                  <input
                    className="filter-input"
                    type="search"
                    placeholder="Filter alerts"
                    aria-label="Filter alerts"
                    value={alertSearch}
                    onChange={(event) => setAlertSearch(event.target.value)}
                  />
                  <select
                    className="filter-select"
                    aria-label="Filter alerts by category"
                    value={alertCategory}
                    onChange={(event) => setAlertCategory(event.target.value)}
                  >
                    <option value="">All categories</option>
                    {alertCategories.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                  <select
                    className="filter-select"
                    aria-label="Filter alerts by read state"
                    value={alertRead}
                    onChange={(event) => setAlertRead(event.target.value as 'all' | 'unread' | 'read')}
                  >
                    <option value="all">All alerts</option>
                    <option value="unread">Unread</option>
                    <option value="read">Read</option>
                  </select>
                  <button className="ghost small" onClick={() => void markAllRead()} disabled={unread === 0}>
                    <Check size={18} /> Mark all read
                  </button>
                </div>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Alert</th>
                      <th>Category</th>
                      <th>Notification ID</th>
                      <th>Routing</th>
                      <th>Received</th>
                      <th className="right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedNotifications.map((notification) => (
                      <tr key={notification.id} className={cx(!notification.readAt && 'unread-row')}>
                        <td>
                          <div className="alert-cell">
                            <strong>{notification.title}</strong>
                            <small>{notification.body || 'No message body was supplied by the provider.'}</small>
                            {notification.data && Object.keys(notification.data).length > 0 && (
                              <details className="payload">
                                <summary>Provider payload</summary>
                                <pre>{JSON.stringify(notification.data, null, 2)}</pre>
                              </details>
                            )}
                          </div>
                        </td>
                        <td>{notification.category ? <span className="tag">{notification.category}</span> : <span className="muted small-text">—</span>}</td>
                        <td><code className="mono">{notification.id.slice(0, 8)}</code></td>
                        <td>{notification.routedTo ? <span className="pill ok">Routed to {notification.routedTo}</span> : <span className="pill neutral">No callback match</span>}</td>
                        <td>{relativeTime(notification.receivedAt)}</td>
                        <td className="right">
                          {!notification.readAt ? (
                            <button className="ghost small" onClick={() => void markRead(notification)}>Mark read</button>
                          ) : (
                            <span className="muted small-text">Read</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {notifLoading && pagedNotifications.length === 0 && <p className="muted empty-inline">Loading alerts…</p>}
                {!notifLoading && filteredNotifications.length === 0 && <p className="muted empty-inline">No alerts match this view.</p>}
              </div>
              <div className="pagination">
                <span className="muted small-text">
                  {filteredNotifications.length === 0
                    ? 'No alerts'
                    : `Showing ${(notifPage - 1) * notifPageSize + 1}–${Math.min(notifPage * notifPageSize, filteredNotifications.length)} of ${filteredNotifications.length}`}
                  {notifications.length !== filteredNotifications.length ? ` · ${notifications.length} loaded` : ''}
                  {notifLoading ? ' · Updating…' : ''}
                </span>
                <div className="pagination-actions">
                  <label className="pagination-size">
                    Rows
                    <select value={notifPageSize} onChange={(event) => setNotifPageSize(Number(event.target.value))}>
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </label>
                  <button className="ghost small" disabled={notifPage <= 1 || notifLoading} onClick={() => setNotifPage((page) => Math.max(1, page - 1))}>
                    <ChevronLeft size={16} /> Prev
                  </button>
                  <span className="pagination-page">Page {notifPage} of {notifTotalPages}</span>
                  <button className="ghost small" disabled={notifPage >= notifTotalPages || notifLoading} onClick={() => setNotifPage((page) => page + 1)}>
                    Next <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'account' && (
            <div className="stack-lg">
              <div className="two-column">
                <section className="card">
                  <div className="card-head">
                    <div>
                      <h2>Profile</h2>
                      <p>Provider identity and session state.</p>
                    </div>
                  </div>
                  <dl className="details">
                    <div><dt>Phone number</dt><dd>{profile.phoneNumber}</dd></div>
                    <div><dt>Provider</dt><dd>{providerLabel(profile.provider)}</dd></div>
                    <div><dt>Auth status</dt><dd><span className={cx('pill', authTone)}>{profile.authStatus}</span></dd></div>
                    <div><dt>Session</dt><dd>{profile.hasSession ? 'Stored and encrypted' : 'Not established'}</dd></div>
                    <div><dt>Profile ID</dt><dd><code className="mono">{profile.id}</code></dd></div>
                    <div><dt>Created</dt><dd>{formatDate(profile.createdAt)}</dd></div>
                    <div><dt>Updated</dt><dd>{formatDate(profile.updatedAt)}</dd></div>
                    {profile.disconnectedAt && <div><dt>Disconnected</dt><dd>{formatDate(profile.disconnectedAt)}</dd></div>}
                  </dl>
                </section>
                <section className="card">
                  <div className="card-head">
                    <div>
                      <h2>Device</h2>
                      <p>The deterministic device allocation used for this profile.</p>
                    </div>
                  </div>
                  <dl className="details">
                    <div><dt>Device ID</dt><dd className="mono">{profile.deviceId || '—'}</dd></div>
                    <div><dt>Profile ID</dt><dd><code className="mono">{profile.id}</code></dd></div>
                    <div><dt>Model</dt><dd>{profile.deviceModel || '—'}</dd></div>
                    <div><dt>Brand</dt><dd>{profile.deviceBrand || '—'}</dd></div>
                    <div><dt>Name</dt><dd>{profile.deviceName || '—'}</dd></div>
                    <div><dt>Type</dt><dd>{profile.deviceType || '—'}</dd></div>
                    <div><dt>Location</dt><dd>{profile.deviceLocation || '—'}</dd></div>
                    <div><dt>IP address</dt><dd className="mono">{profile.deviceIP || '—'}</dd></div>
                    <div><dt>Free disk</dt><dd>{profile.deviceFreeDisk ? `${Math.round(profile.deviceFreeDisk / 1024 / 1024)} MB` : '—'}</dd></div>
                  </dl>
                </section>
              </div>

                <section className="card">
                  <div className="card-head">
                    <div>
                      <h2>Account actions</h2>
                      <p>Connection management is available in the Connection tab.</p>
                    </div>
                    <span className={cx('pill', statusTone(profile.syncStatus))}>Sync {profile.syncStatus}</span>
                  </div>
                </section>
            </div>
          )}

          {tab === 'connection' && (
            <div className="stack-lg">
              <section className="card">
                <div className="card-head">
                  <div>
                    <h2>FCM push listener</h2>
                    <p>Each profile keeps its own credentials and persistent ID history so listeners never clash.</p>
                  </div>
                  <span className={cx('pill', fcmTone)}>{profile.fcmStatus.replaceAll('_', ' ')}</span>
                </div>
                <div className="connection-grid">
                  <div><small>Enabled</small><strong>{profile.fcmEnabled ? 'Yes' : 'No'}</strong></div>
                  <div><small>Last event</small><strong>{relativeTime(profile.fcmLastEventAt)}</strong></div>
                  <div><small>Token synced</small><strong>{relativeTime(profile.fcmLastSyncAt)}</strong></div>
                  <div><small>Last error</small><strong className={profile.fcmLastError ? 'danger-text' : ''}>{profile.fcmLastError || 'None'}</strong></div>
                  <div><small>Profile ID</small><strong className="mono"><code>{profile.id}</code></strong></div>
                </div>
                <div className="card-actions">
                  <button className={profile.fcmEnabled ? 'ghost' : 'primary'} onClick={() => void toggleFCM()} disabled={busy === 'fcm'}>
                    <Wifi size={18} /> {profile.fcmEnabled ? 'Pause listener' : 'Enable listener'}
                  </button>
                  {profile.fcmStatus === 'reauthentication_required' && (
                    <button className="ghost" onClick={() => setReauth(true)}>
                      <KeyRound size={18} /> Reauthenticate
                    </button>
                  )}
                </div>
              </section>

              <section className="card">
                <div className="card-head">
                  <div>
                    <h2>Provider synchronization</h2>
                    <p>Balance, transaction history, and provider notification polling.</p>
                  </div>
                  <span className={cx('pill', statusTone(profile.syncStatus))}>{profile.syncStatus}</span>
                </div>
                <div className="connection-grid">
                  <div><small>Last synced</small><strong>{formatDate(profile.lastSyncedAt)}</strong></div>
                  <div><small>Last started</small><strong>{formatDate(profile.syncStartedAt)}</strong></div>
                  <div><small>Sync error</small><strong className={profile.syncError ? 'danger-text' : ''}>{profile.syncError || 'None'}</strong></div>
                  <div><small>Session</small><strong>{profile.hasSession ? 'Available' : 'Unavailable'}</strong></div>
                  <div><small>Profile ID</small><strong className="mono"><code>{profile.id}</code></strong></div>
                </div>
              </section>

                <section className="card danger-zone">
                  <div className="card-head">
                    <div>
                      <h2>Disconnect profile</h2>
                      <p>This stops the FCM listener and clears the provider session and push credentials. Balance, transactions, and alert history stay available.</p>
                    </div>
                    <div className="card-head-actions">
                      <button className="danger" onClick={() => setConfirmDisconnect(true)} disabled={busy === 'disconnect'}>
                        <Unplug size={18} /> Disconnect {profile.phoneNumber}
                      </button>
                    </div>
                  </div>
                </section>
            </div>
          )}
      </section>

      <div>
        {reauth && (
          <ReauthModal
            profile={profile}
            onClose={() => setReauth(false)}
            onComplete={() => {
              setReauth(false);
              void refreshProfile();
              pushToast({ title: 'Profile reauthenticated', body: 'The provider session has been refreshed.', tone: 'success' });
            }}
          />
        )}
        {confirmDisconnect && (
          <ConfirmDialog
            title={`Disconnect ${profile.phoneNumber}?`}
            description="This stops the FCM listener and clears the provider session and push credentials. Balance, transactions, and alert history stay available."
            confirmLabel="Disconnect profile"
            busy={busy === 'disconnect'}
            onCancel={() => setConfirmDisconnect(false)}
            onConfirm={() => void disconnect()}
          />
        )}
        <TransactionDetailDialog
          transaction={selectedTransaction}
          open={showTransactionDetail}
          onClose={() => {
            setShowTransactionDetail(false);
            setSelectedTransaction(null);
          }}
        />
      </div>
    </div>
  );
}
