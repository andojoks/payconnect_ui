import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, Notification, Transaction } from '../api';
import { TransactionDetailDialog } from '../components/Transaction/TransactionDetailDialog';
import { usePageMeta } from '../components/layout/Shell';
import { cx, formatDate, formatMoney, relativeTime, statusTone } from '../lib/format';
import { eventNotification, mergeById } from './profileData';
import { useProfileContext, useProfileEvent } from '../components/layout/ProfileLayout';
import { ArrowLeftRight, ChevronRight, Clock, Download, Send, Smartphone, TriangleAlert } from 'lucide-react';

export function ProfileOverviewPage() {
  usePageMeta({ title: 'Profile overview' });
  const { id = '' } = useParams();
  const { profile, setError } = useProfileContext();
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [showTransactionDetail, setShowTransactionDetail] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  const loadRecent = useCallback(async () => {
    setActivityLoading(true);
    try {
      const [page, alerts] = await Promise.all([
        api.profileTransactions(id, { limit: 5 }),
        api.profileNotifications(id, { limit: 5 }),
      ]);
      setRecentTransactions((current) => mergeById(page.transactions, current, 5));
      setNotifications((current) => mergeById(alerts, current, 5));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load profile activity');
    } finally {
      setActivityLoading(false);
    }
  }, [id, setError]);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  useProfileEvent((event) => {
    const data = event.data ?? {};
    if (event.type === 'notification') {
      const notification = eventNotification(event, profile);
      if (notification) {
        setNotifications((items) => [notification, ...items.filter((item) => item.id !== notification.id)].slice(0, 5));
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
    if (event.type === 'transaction') {
      const transaction = data as unknown as Transaction;
      if (transaction?.id) {
        // New payments can be painted immediately on the recent list. Updates
        // and sync merges re-read the list so ordering stays authoritative.
        if (transaction.created !== false) {
          setRecentTransactions((items) => [transaction, ...items.filter((item) => item.id !== transaction.id)].slice(0, 5));
        } else {
          void loadRecent();
        }
      }
    }
    if (event.type === 'transactions' || (event.type === 'sync' && data.status === 'idle')) {
      void loadRecent();
    }
  });

  const fcmTone = statusTone(profile.fcmStatus);

  return (
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
            {activityLoading && recentTransactions.length === 0 && <p className="muted empty-inline">Loading transactions…</p>}
            {!activityLoading && recentTransactions.length === 0 && <p className="muted empty-inline">No transactions have been synchronized yet.</p>}
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
            {notifications.map((notification) => (
              <div className={cx('list-row alert-row', !notification.readAt && 'unread')} key={notification.id}>
                <span className="list-mark alert"><TriangleAlert size={18} /></span>
                <div className="main">
                  <strong>{notification.title}</strong>
                  <small>{notification.body || 'Incoming provider alert'}</small>
                </div>
                <span className="muted small-text">{relativeTime(notification.receivedAt)}</span>
              </div>
            ))}
            {activityLoading && notifications.length === 0 && <p className="muted empty-inline">Loading alerts…</p>}
            {!activityLoading && notifications.length === 0 && <p className="muted empty-inline">No alerts have arrived for this profile.</p>}
          </div>
        </section>
      </div>

      <TransactionDetailDialog
        transaction={selectedTransaction}
        open={showTransactionDetail}
        onClose={() => {
          setShowTransactionDetail(false);
          setSelectedTransaction(null);
        }}
      />
    </>
  );
}
