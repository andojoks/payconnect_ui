import { X } from 'lucide-react';

type Props = {
  title: string;
  description: string;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({ title, description, confirmLabel = 'Confirm', tone = 'danger', busy, onCancel, onConfirm }: Props) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal compact" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div className="modal-header">
          <div>
            <span className="eyebrow">PLEASE CONFIRM</span>
            <h2 id="confirm-title">{title}</h2>
          </div>
          <button className="icon-button" onClick={onCancel} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="modal-copy">{description}</p>
        <div className="modal-actions">
          <button className="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
