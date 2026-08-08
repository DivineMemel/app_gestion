'use client';
import { useRef, useState } from 'react';
import Image from 'next/image';
import { ImagePlus, Loader2, X } from 'lucide-react';

type Folder = 'logo' | 'sectors' | 'services' | 'products' | 'staff' | 'gallery';

/** Côté le plus long après redimensionnement. Suffisant pour du plein écran. */
const COTE_MAX = 1600;
/** En dessous, compresser ne gagnerait rien de significatif. */
const SEUIL_COMPRESSION = 300 * 1024;

/**
 * Réduit une photo avant envoi.
 *
 * Une photo de téléphone fait 3 à 5 Mo pour 4000 px de large. Servie telle
 * quelle dans une galerie consultée au mobile, elle coûte cher en data à la
 * cliente et remplit le quota de stockage en une centaine d'images.
 * On la ramène à 1600 px et ~200 Ko, invisible à l'œil sur une fiche.
 */
async function compresser(file: File): Promise<File> {
  if (file.size <= SEUIL_COMPRESSION) return file;
  if (!file.type.startsWith('image/')) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const ratio = Math.min(COTE_MAX / bitmap.width, COTE_MAX / bitmap.height, 1);
    const w = Math.round(bitmap.width * ratio);
    const h = Math.round(bitmap.height * ratio);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.82),
    );
    // Si la conversion échoue ou n'apporte rien, on garde l'original.
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', {
      type: 'image/webp',
    });
  } catch {
    return file;
  }
}

/** Retire l'objet du bucket : appelé au remplacement comme au retrait. */
async function supprimerDuBucket(url: string) {
  try {
    await fetch('/api/admin/upload', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    });
  } catch {
    /* le nettoyage est du confort, pas une opération critique */
  }
}

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
  const [poids, setPoids] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setBusy(true);
    const ancienne = value;
    try {
      const reduite = await compresser(file);
      setPoids(
        reduite.size < file.size
          ? `${Math.round(file.size / 1024)} Ko → ${Math.round(reduite.size / 1024)} Ko`
          : null,
      );

      const fd = new FormData();
      fd.append('file', reduite);
      fd.append('folder', folder);
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.url) {
        setError(json?.error ?? `Erreur ${res.status}`);
        return;
      }
      onChange(json.url as string);
      if (ancienne) await supprimerDuBucket(ancienne);
    } catch {
      setError('Échec réseau');
    } finally {
      setBusy(false);
    }
  }

  async function retirer() {
    const ancienne = value;
    onChange(null);
    setPoids(null);
    if (ancienne) await supprimerDuBucket(ancienne);
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
              onClick={retirer}
              disabled={busy}
              className="btn-ghost text-[11px]"
              style={{ color: 'rgb(var(--danger, 165 42 42))' }}
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.5} />
              Retirer
            </button>
          )}
          {error && (
            <span className="text-[11px]" style={{ color: 'rgb(var(--danger, 165 42 42))' }}>
              {error}
            </span>
          )}
          {poids && !error && (
            <span className="text-[11px]" style={{ color: 'rgb(var(--muted))' }}>
              {poids}
            </span>
          )}
          <span className="text-[10px]" style={{ color: 'rgb(var(--muted))' }}>
            JPG, PNG, WebP · réduite automatiquement
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
