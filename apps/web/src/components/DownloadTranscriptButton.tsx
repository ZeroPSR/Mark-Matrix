import { useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { supabase } from "../lib/supabase.js";

interface Props {
  url: string;
  label: string;
  disabled?: boolean;
}

export function DownloadTranscriptButton({ url, label, disabled = false }: Props): JSX.Element {
  const { userId } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async (): Promise<void> => {
    if (disabled) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? "";
      const res = await fetch(url, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      void userId;
      if (!res.ok) {
        setError(`Download failed (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = label.replace(/[^A-Za-z0-9._-]+/g, "_");
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="download-transcript">
      <button type="button" onClick={onClick} disabled={disabled || busy}>
        {busy ? "Downloading…" : label}
      </button>
      {error && <span className="download-transcript__error">{error}</span>}
    </span>
  );
}