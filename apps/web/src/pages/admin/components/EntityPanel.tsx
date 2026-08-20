import { useState, type FormEvent } from "react";

export interface Column<T> { key: keyof T & string; label: string; }
export interface EntityPanelProps<T extends { id: string }> {
  title: string;
  rows: T[] | null;
  columns: Column<T>[];
  emptyForm: Record<string, string>;
  onCreate: (input: Record<string, string>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

export function EntityPanel<T extends { id: string }>({
  title, rows, columns, emptyForm, onCreate, onDelete,
}: EntityPanelProps<T>) {
  const [form, setForm] = useState<Record<string, string>>(emptyForm);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onCreate(form);
      setForm(emptyForm);
    } catch (err) {
      setError((err as { body?: { error?: string } }).body?.error ?? "create_failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="entity-panel">
      <h2 className="entity-panel__title">{title}</h2>
      {error !== null && <p className="entity-panel__error">{error}</p>}
      <form className="entity-panel__form" onSubmit={submit}>
        {Object.keys(emptyForm).map((k) => (
          <label className="entity-panel__field" key={k}>
            <span>{k}</span>
            <input
              value={form[k] ?? ""}
              onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              disabled={busy}
            />
          </label>
        ))}
        <button type="submit" disabled={busy}>Create</button>
      </form>
      <table className="entity-panel__table">
        <thead>
          <tr>
            {columns.map((c) => <th key={c.key}>{c.label}</th>)}
            {onDelete && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {(rows ?? []).map((r) => (
            <tr key={r.id}>
              {columns.map((c) => <td key={c.key}>{String(r[c.key])}</td>)}
              {onDelete && (
                <td>
                  <button onClick={() => onDelete(r.id)} disabled={busy}>Delete</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}