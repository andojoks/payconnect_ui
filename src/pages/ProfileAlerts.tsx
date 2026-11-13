import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, Notification } from '../api';
import { useGlobalSearch, usePageMeta } from '../components/Shell';
import { cx, formatDate, relativeTime, statusTone } from '../lib/format';
import { eventNotification, fetchAllNotifications, mergeById } from './profileData';
import { useProfileContext, useProfileEvent } from './ProfileLayout';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';

export function ProfileAlertsPage() {
  usePageMeta({ title: 'Profile alerts' });
  const { id = '' } = useParams();
  const { profile, updateProfile, setError } = useProfileContext();
  const { query } = useGlobalSearch();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [alertSearch, setAlertSearch] = useState('');
  const [alertCategory, setAlertCategory] = useState('');
  const [alertRead, setAlertRead] = useState<'all' | 'unread' | 'read'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(false);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const fresh = await fetchAllNotifications(id);
      setNotifications((current) => mergeById(fresh, current));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load alerts');
    } finally {
      setLoading(false);
    }
  }, [id, setError]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useProfileEvent((event) => {
    const data = event.data ?? {};
    if (event.type === 'notification') {
      const notification = eventNotification(event, profile);
      if (notification) {
        setNotifications((items) => [notification, ...items.filter((item) => item.id !== notification.id)]);
      }
    }
    if (event.type === 'notification.read') {
      const notificationId = typeof data.notificationId === 'string' ? data.notificationId : '';
      setNotifications((items) =>
        data.all
          ? items.map((item) => ({ ...item, readAt: new Date().toISOString() }))
          : items.map((item) => (item.id === notificationId ? { ...item, readAt: new Date().toISOString() } : item)),
      );
    }
    if (event.type === 'sync' && data.status === 'idle') {
      void loadNotifications();
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

  const totalPages = Math.max(1, Math.ceil(filteredNotifications.length / pageSize));
  const pagedNotifications = useMemo(
    () => filteredNotifications.slice((page - 1) * pageSize, page * pageSize),
    [filteredNotifications, page, pageSize],
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [alertSearch, alertCategory, alertRead, query, pageSize]);

  const unread = notifications.filter((item) => !item.readAt).length;

  async function markRead(notification: Notification) {
    setNotifications((items) => items.map((item) => (item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item)));
    updateProfile((current) => ({ ...current, unreadNotifications: Math.max(0, current.unreadNotifications - 1) }));
    await api.markNotificationRead(id, notification.id).catch(() => undefined);
  }

  async function markAllRead() {
    setNotifications((items) => items.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
    updateProfile((current) => ({ ...current, unreadNotifications: 0 }));
    await api.markAllNotificationsRead(id).catch(() => undefined);
  }

  return (
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
        {loading && pagedNotifications.length === 0 && <p className="muted empty-inline">Loading alerts…</p>}
        {!loading && filteredNotifications.length === 0 && <p className="muted empty-inline">No alerts match this view.</p>}
      </div>
      <div className="pagination">
        <span className="muted small-text">
          {filteredNotifications.length === 0
            ? 'No alerts'
            : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filteredNotifications.length)} of ${filteredNotifications.length}`}
          {notifications.length !== filteredNotifications.length ? ` · ${notifications.length} loaded` : ''}
          {loading ? ' · Updating…' : ''}
        </span>
        <div className="pagination-actions">
          <label className="pagination-size">
            Rows
            <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </label>
          <button className="ghost small" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>
            <ChevronLeft size={16} /> Prev
          </button>
          <span className="pagination-page">Page {page} of {totalPages}</span>
          <button className="ghost small" disabled={page >= totalPages || loading} onClick={() => setPage((current) => current + 1)}>
            Next <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
