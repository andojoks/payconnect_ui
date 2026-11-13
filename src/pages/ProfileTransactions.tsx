import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, Transaction } from '../api';
import { TransactionDetailDialog } from '../components/Transaction/TransactionDetailDialog';
import { useGlobalSearch, usePageMeta } from '../components/Shell';
import { cx, formatDate, formatMoney, relativeTime, statusTone } from '../lib/format';
import { useProfileContext, useProfileEvent } from './ProfileLayout';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function ProfileTransactionsPage() {
  usePageMeta({ title: 'Profile transactions' });
  const { id = '' } = useParams();
  const { profile, setError } = useProfileContext();
  const { query } = useGlobalSearch();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [direction, setDirection] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showTransactionDetail, setShowTransactionDetail] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.profileTransactions(id, {
        limit: pageSize,
        offset: (page - 1) * pageSize,
        direction,
        status,
        q: debouncedQuery,
      });
      const firstPage = page === 1 && !direction && !status && !debouncedQuery;
      setTransactions((current) => {
        if (!firstPage) return result.transactions;
        // Keep a live transaction that arrived while this page was being fetched.
        const freshIds = new Set(result.transactions.map((item) => item.id));
        const live = current.filter((item) => item.created === true && !freshIds.has(item.id));
        return [...live, ...result.transactions].slice(0, pageSize);
      });
      setTotal(result.total);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load transactions');
    } finally {
      setLoading(false);
    }
  }, [id, page, pageSize, direction, status, debouncedQuery, setError]);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  useProfileEvent((event) => {
    const data = event.data ?? {};
    if (event.type === 'transaction') {
      const transaction = data as unknown as Transaction;
      if (transaction?.id) {
        // New payments can be painted immediately on the first page. Updates and
        // filtered views re-read the active page so ordering and totals stay
        // authoritative.
        const filtered = Boolean(direction || status || debouncedQuery);
        if (transaction.created !== false && !filtered && page === 1) {
          setTransactions((items) => [transaction, ...items.filter((item) => item.id !== transaction.id)].slice(0, pageSize));
          setTotal((current) => current + 1);
        } else {
          void loadTransactions();
        }
      }
    }
    if (event.type === 'transactions' || (event.type === 'sync' && data.status === 'idle')) {
      void loadTransactions();
    }
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
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
              setPage(1);
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
              setPage(1);
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
                setPage(1);
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
        {loading && transactions.length === 0 && <p className="muted empty-inline">Loading transactions…</p>}
        {!loading && transactions.length === 0 && <p className="muted empty-inline">No transactions match this view.</p>}
      </div>
      <div className="pagination">
        <span className="muted small-text">
          {total === 0
            ? 'No transactions'
            : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
          {loading && total > 0 ? ' · Updating…' : ''}
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

      <TransactionDetailDialog
        transaction={selectedTransaction}
        open={showTransactionDetail}
        onClose={() => {
          setShowTransactionDetail(false);
          setSelectedTransaction(null);
        }}
      />
    </div>
  );
}
