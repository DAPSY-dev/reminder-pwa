import { useEffect, useRef } from 'react';
import { Icon } from './Icon';

export function ConfirmDialog({
  title,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  title: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onCancel();
      }}
      aria-labelledby="delete-title"
    >
      <div className="dialog-symbol">
        <Icon name="trash" size={24} />
      </div>
      <h2 id="delete-title">Delete this reminder?</h2>
      <p>“{title}” will be permanently removed. This can’t be undone.</p>
      {error && (
        <p role="alert" className="text-error">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button className="button secondary" onClick={onCancel} disabled={busy} autoFocus>
          Keep reminder
        </button>
        <button className="button danger" onClick={onConfirm} disabled={busy}>
          {busy ? 'Deleting…' : 'Delete reminder'}
        </button>
      </div>
    </dialog>
  );
}
