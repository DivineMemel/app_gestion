'use client';
import { useRef, useState } from 'react';
import Image from 'next/image';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { MODE_DEMO } from '@/lib/admin-db';
import { FOLDER_MODULE } from '@/lib/permissions';

type Dossier = keyof typeof FOLDER_MODULE;

/** Côté le plus long après redimensionnement. Suffisant pour du plein écran. */
const COTE_MAX = 1600;
/** En dessous, compresser ne gagnerait rien de significatif. */
const SEUIL_COMPRESSION = 300 * 1024;

/**
 * Réduit une photo avant envoi.
 *
 * Une photo de téléphone fait 3 à 5 Mo pour 4000 px de large. Servie telle
 * quelle dans un catalogue consulté au mobile à Abidjan, elle coûte cher en
 * data au client et remplit le gigaoctet gratuit en une centaine d'articles.
 * On la ramène à 1600 px et ~200 Ko, invisible à l'œil sur une fiche produit.
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

export function ImageUpload({
  value,
  onChange,
  folder,
  label,
  aide,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  folder: Dossier;
  label?: string;
  aide?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [poids, setPoids] = useState<string | null>(null);

  /**
   * Retire l'objet du bucket. Appelé au remplacement comme au retrait : sans
   * ça, chaque correction de fiche laisserait un fichier orphelin derrière
   * elle, facturé et jamais servi.
   */
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

  async function envoyer(file: File) {
    setErreur(null);

    if (MODE_DEMO) {
      setErreur('Upload indisponible en démonstration — il faut le stockage Supabase.');
      return;
    }

    setBusy(true);
    const ancienne = value;
    try {
      const reduite = await compresser(file);
      setPoids(
        reduite.size < file.size
          ? `${Math.round(file.size / 1024)} Ko → ${Math.round(reduite.size / 1024)} Ko`
          : `${Math.round(reduite.size / 1024)} Ko`,
      );

      const fd = new FormData();
      fd.append('file', reduite);
      fd.append('folder', folder);

      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.url) {
        setErreur(json?.error ?? `Erreur ${res.status}`);
        return;
      }

      onChange(json.url as string);
      if (ancienne) await supprimerDuBucket(ancienne);
    } catch {
      setErreur('Échec réseau.');
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
      {label && <div className="label">{label}</div>}

      <div className="flex items-start gap-3">
        <div
          className="relative aspect-square w-24 shrink-0 overflow-hidden border"
          style={{
            borderColor: 'rgb(var(--line-strong))',
            background: 'rgb(var(--surface-2))',
          }}
        >
          {value ? (
            <Image src={value} alt="" fill sizes="96px" className="object-cover" />
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
            <div className="absolute inset-0 grid place-items-center bg-black/40">
              <Loader2 className="h-5 w-5 animate-spin text-white" />
            </div>
          )}
        </div>

        <div className="flex flex-col items-start gap-1.5">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="btn-outline px-3 py-1.5 text-[12px]"
          >
            <ImagePlus className="h-3.5 w-3.5" strokeWidth={1.75} />
            {value ? 'Remplacer' : 'Choisir une photo'}
          </button>

          {value && (
            <button
              type="button"
              onClick={retirer}
              disabled={busy}
              className="btn-ghost px-2 py-1 text-[12px]"
              style={{ color: 'rgb(var(--danger))' }}
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.75} />
              Retirer
            </button>
          )}

          {erreur && (
            <span className="text-[12px]" style={{ color: 'rgb(var(--danger))' }}>
              {erreur}
            </span>
          )}
          {poids && !erreur && (
            <span className="text-[11px]" style={{ color: 'rgb(var(--ok))' }}>
              {poids}
            </span>
          )}
          <span className="text-[11px]" style={{ color: 'rgb(var(--muted))' }}>
            {aide ?? 'JPG, PNG ou WebP. Réduite automatiquement avant envoi.'}
          </span>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) envoyer(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
