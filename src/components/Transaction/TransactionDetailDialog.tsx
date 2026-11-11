import { X } from 'lucide-react';
import { Transaction } from '../../api';
import { cx, formatDate, formatMoney, relativeTime, statusTone } from '../../lib/format';

type Props = {
  transaction: Transaction | null;
  open: boolean;
  onClose: () => void;
};

const TYPE_LABELS: Record<string, string> = {
  CREDIT: 'Credit',
  DEBIT: 'Debit',
  PAYMENT: 'Payment',
  CASH_IN: 'Cash In',
  CASH_OUT: 'Cash Out',
  TRANSFER: 'Transfer',
  BILL_PAYMENT: 'Bill Payment',
  PAYMENT_SEND: 'Payment Send',
};

function typeLabel(direction: string) {
  return TYPE_LABELS[direction] ?? direction;
}

/** Reads the first non-empty string/number field from transaction metadata. */
function metadataValue(metadata: Record<string, unknown> | undefined, ...keys: string[]) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number') return String(value);
  }
  return '';
}

/**
 * Full transaction detail, opened by clicking a row in either the overview
 * "Recent transactions" list or the transactions table.
 */
export function TransactionDetailDialog({ transaction, open, onClose }: Props) {
  if (!open || !transaction) return null;

  const metadata = transaction.metadata;
  const sender = metadataValue(metadata, 'sender', 'senderName', 'payer') || transaction.reference || '—';
  const receiver = metadataValue(metadata, 'receiver', 'receiverName', 'payee') || '—';
  const receiverAmount = typeof metadata?.receiverAmount === 'number' ? metadata.receiverAmount : undefined;
  const receiverCurrency = typeof metadata?.currency === 'string' ? metadata.currency : transaction.currency;
  const metadataEntries = metadata ? Object.entries(metadata) : [];

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="transaction-detail-title">
        <div className="modal-header">
          <div>
            <span className="eyebrow">TRANSACTION DETAIL</span>
            <h2 id="transaction-detail-title">{typeLabel(transaction.direction)}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close transaction detail">
            <X size={18} />
          </button>
        </div>

        <p className="modal-copy">
          {formatMoney(transaction.amount, transaction.currency)} · {relativeTime(transaction.occurredAt)}
        </p>

        <dl className="details">
          <div><dt>Transaction ID</dt><dd><code className="mono">{transaction.id}</code></dd></div>
          <div><dt>Provider transaction ID</dt><dd><code className="mono">{transaction.providerTransactionId || '—'}</code></dd></div>
          <div><dt>Type</dt><dd>{typeLabel(transaction.direction)}</dd></div>
          <div><dt>Direction</dt><dd>{transaction.direction}</dd></div>
          <div><dt>Amount</dt><dd>{formatMoney(transaction.amount, transaction.currency)}</dd></div>
          <div><dt>Currency</dt><dd>{transaction.currency || '—'}</dd></div>
          <div>
            <dt>Status</dt>
            <dd><span className={cx('pill', statusTone(transaction.status.toLowerCase()))}>{transaction.status}</span></dd>
          </div>
          <div><dt>Reference</dt><dd>{transaction.reference || '—'}</dd></div>
          <div><dt>Sender</dt><dd>{sender}</dd></div>
          <div><dt>Receiver</dt><dd>{receiver}</dd></div>
          <div><dt>Receiver amount</dt><dd>{receiverAmount === undefined ? '—' : formatMoney(receiverAmount, receiverCurrency)}</dd></div>
          <div><dt>Occurred at</dt><dd>{formatDate(transaction.occurredAt)}</dd></div>
          <div><dt>Created at</dt><dd>{formatDate(transaction.createdAt)}</dd></div>
          <div><dt>Source</dt><dd>{transaction.source || '—'}</dd></div>
        </dl>

        {metadataEntries.length > 0 && (
          <details className="payload">
            <summary>Provider metadata</summary>
            <pre>{JSON.stringify(metadata, null, 2)}</pre>
          </details>
        )}

        <div className="modal-actions">
          <button className="ghost" onClick={onClose}>Close</button>
        </div>
      </section>
    </div>
  );
}
