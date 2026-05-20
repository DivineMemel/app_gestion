'use client';
import { useRef, useState } from 'react';
import Image from 'next/image';
import { ImagePlus, Loader2, X } from 'lucide-react';

type Folder = 'logo' | 'sectors' | 'services' | 'products' | 'staff' | 'gallery';

export function ImageUpload({
  value,
  onChange,
  folder,
  label,
  aspect = 'aspect-[4/3]',
  rounded = false,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  folder: Folder;
  label?: string;
  aspect?: string;
  rounded?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', folder);
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.url) {
        setError(json?.error ?? `Erreur ${res.status}`);
        return;
      }
      onChange(json.url as string);
    } catch {
      setError('Échec réseau');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {label && (
        <div
          className="mb-2 text-[10px] uppercase tracking-[0.24em]"
          style={{ color: 'rgb(var(--muted))' }}
        >
          {label}
        </div>
      )}

      <div className="flex items-start gap-4">
        <div
          className={`relative ${aspect} w-28 shrink-0 overflow-hidden border ${
            rounded ? 'rounded-full' : ''
          }`}
          style={{ borderColor: 'rgb(var(--line))', background: 'rgb(var(--surface-2))' }}
        >
          {value ? (
            <Image src={value} alt="" fill sizes="112px" className="object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center">
              <ImagePlus
                className="h-5 w-5"
                strokeWidth={1.5}
                style={{ color: 'rgb(var(--muted))' }}
              />
            </div>
          )}
          {busy && (
            <div className="absolute inset-0 grid place-items-center bg-black/30">
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="btn-outline text-[11px]"
          >
            <ImagePlus className="h-3.5 w-3.5" strokeWidth={1.5} />
            {value ? 'Remplacer' : 'Choisir une image'}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              disabled={busy}
              className="btn-ghost text-[11px]"
              style={{ color: '#a52a2a' }}
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.5} />
              Retirer
            </button>
          )}
          {error && (
            <span className="text-[11px]" style={{ color: '#a52a2a' }}>
              {error}
            </span>
          )}
          <span className="text-[10px]" style={{ color: 'rgb(var(--muted))' }}>
            JPG, PNG, WebP · 10 Mo max
          </span>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
