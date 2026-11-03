import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "../../../components/Modal/Modal.js";
import { Button } from "../../../components/Button/Button.js";
import { Field } from "../../../components/Field/Field.js";
import { Input } from "../../../components/Input/Input.js";

export interface UnlockModalProps {
  /** Whether the dialog is shown. The dialog renders nothing while false. */
  open: boolean;
  /** Dismiss handler — Cancel, the close button, Escape and the backdrop all call it. */
  onClose: () => void;
  /** Called with the trimmed reason once the admin confirms the unlock. */
  onConfirm: (reason: string) => Promise<void> | void;
  /** Human-readable name of the record being unlocked, shown in the dialog body. */
  title: string;
}

export function UnlockModal({ open, onClose, onConfirm, title }: UnlockModalProps): JSX.Element {
  const [reason, setReason] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const trimmed = reason.trim();

  // The dialog stays mounted between openings, so reset the reason once it closes.
  // A failed unlock keeps the dialog open, and with it the reason already typed.
  useEffect(() => {
    if (!open) {
      setReason("");
    }
  }, [open]);

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
    <Modal
      open={open}
      onClose={onClose}
      title="Unlock record"
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => void submit()}
            disabled={trimmed.length === 0 || submitting}
          >
            Unlock
          </Button>
        </>
      }
    >
      <p>
        You are about to unlock <strong>{title}</strong>. This will reopen the record for edits and will be
        recorded in the audit log.
      </p>
      <form
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Reason" htmlFor="unlock-reason">
          <Input
            id="unlock-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={2000}
            placeholder="e.g. faculty typo in midterm marks"
          />
        </Field>
      </form>
    </Modal>
  );
}
