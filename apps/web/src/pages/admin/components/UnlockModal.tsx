import { useState } from "react";

interface UnlockModalProps {
  title: string;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void> | void;
}

export function UnlockModal({ title, onCancel, onConfirm }: UnlockModalProps): JSX.Element {
  const [reason, setReason] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const trimmed = reason.trim();

  const submit = async (): Promise<void> => {
    if (trimmed.length === 0) return;
    setSubmitting(true);
    try {
      await onConfirm(trimmed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="unlock-modal__backdrop" role="dialog" aria-modal="true">
      <div className="unlock-modal">
        <h2>{title}</h2>
        <p>This will reopen the record for edits. Please provide a reason (required, will be audited).</p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          maxLength={2000}
          aria-label="unlock reason"
          placeholder="e.g. faculty typo in midterm marks"
        />
        <div className="unlock-modal__actions">
          <button onClick={onCancel} disabled={submitting}>Cancel</button>
          <button onClick={() => void submit()} disabled={trimmed.length === 0 || submitting}>
            Unlock
          </button>
        </div>
      </div>
    </div>
  );
}