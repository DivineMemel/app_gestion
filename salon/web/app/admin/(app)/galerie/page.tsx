'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Trash2, ImagePlus } from 'lucide-react';
import { supabase, uniqueChannel } from '@/lib/admin-db';
import { PageHeader } from '@/components/admin/PageHeader';
import { ImageUpload } from '@/components/admin/ImageUpload';
import type { GalleryImage } from '@/lib/types';

export default function GaleriePage() {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ image_url: '' as string | null, caption: '', tag: '' });

  async function load() {
    const { data } = await supabase
      .from('gallery_images')
      .select('*')
      .order('display_order', { ascending: true });
    setImages((data as GalleryImage[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(uniqueChannel('gallery-admin'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gallery_images' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  async function addImage() {
    if (!draft.image_url) return;
    await supabase.from('gallery_images').insert({
      image_url: draft.image_url,
      caption: draft.caption.trim() || null,
      tag: draft.tag.trim() || null,
      display_order: images.length,
    });
    setDraft({ image_url: '', caption: '', tag: '' });
    setAdding(false);
  }

  async function toggleActive(g: GalleryImage) {
    await supabase.from('gallery_images').update({ active: !g.active }).eq('id', g.id);
  }

  async function remove(g: GalleryImage) {
    if (!confirm('Retirer cette photo de la galerie ?')) return;
    await supabase.from('gallery_images').delete().eq('id', g.id);
  }

  async function move(g: GalleryImage, dir: -1 | 1) {
    const idx = images.findIndex((x) => x.id === g.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= images.length) return;
    const other = images[swapIdx];
    await supabase.from('gallery_images').update({ display_order: other.display_order }).eq('id', g.id);
    await supabase.from('gallery_images').update({ display_order: g.display_order }).eq('id', other.id);
  }

  return (
    <div className="space-y-10 stagger">
      <PageHeader
        eyebrow="Vitrine"
        title="Galerie"
        italic="photo"
        description="Les photos qui s'affichent sur la page d'accueil. Réordonne par glisser les flèches, active/désactive à la volée."
        right={
          <button onClick={() => setAdding((a) => !a)} className="btn-primary">
            <ImagePlus className="h-3.5 w-3.5" />
            {adding ? 'Annuler' : 'Ajouter une photo'}
          </button>
        }
      />

      {adding && (
        <div className="surface p-6 md:p-8 space-y-5">
          <ImageUpload
            label="Photo"
            folder="gallery"
            aspect="aspect-[3/4]"
            value={draft.image_url}
            onChange={(url) => setDraft((d) => ({ ...d, image_url: url }))}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <div className="mb-1 text-[10px] uppercase tracking-[0.24em]" style={{ color: 'rgb(var(--muted))' }}>
                Légende (optionnel)
              </div>
              <input
                className="input"
                value={draft.caption}
                onChange={(e) => setDraft((d) => ({ ...d, caption: e.target.value }))}
                placeholder="ex. Box braids signature"
              />
            </label>
            <label className="block">
              <div className="mb-1 text-[10px] uppercase tracking-[0.24em]" style={{ color: 'rgb(var(--muted))' }}>
                Tag (optionnel)
              </div>
              <input
                className="input"
                value={draft.tag}
                onChange={(e) => setDraft((d) => ({ ...d, tag: e.target.value }))}
                placeholder="ex. Tresses"
              />
            </label>
          </div>
          <button onClick={addImage} disabled={!draft.image_url} className="btn-primary">
            Ajouter à la galerie
          </button>
        </div>
      )}

      {loading && <div className="text-sm text-muted">Chargement…</div>}

      {!loading && images.length === 0 && (
        <div className="surface px-6 py-12 text-center text-sm text-muted">
          Galerie vide. Ajoute tes plus belles réalisations.
        </div>
      )}

      <div className="grid grid-cols-2 gap-1 md:grid-cols-4">
        {images.map((g, i) => (
          <figure
            key={g.id}
            className={`relative aspect-[3/4] overflow-hidden border ${g.active ? '' : 'opacity-40'}`}
            style={{ borderColor: 'rgb(var(--line))' }}
          >
            <Image src={g.image_url} alt={g.caption ?? ''} fill sizes="(max-width:768px) 50vw, 25vw" className="object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
              <div className="flex items-center justify-between gap-1">
                <div className="flex gap-1">
                  <button
                    onClick={() => move(g, -1)}
                    disabled={i === 0}
                    className="grid h-6 w-6 place-items-center bg-white/90 text-black text-[12px] disabled:opacity-30"
                    aria-label="Monter"
                  >
                    ←
                  </button>
                  <button
                    onClick={() => move(g, 1)}
                    disabled={i === images.length - 1}
                    className="grid h-6 w-6 place-items-center bg-white/90 text-black text-[12px] disabled:opacity-30"
                    aria-label="Descendre"
                  >
                    →
                  </button>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => toggleActive(g)}
                    className="grid h-6 px-2 place-items-center bg-white/90 text-black text-[9px] uppercase tracking-wide"
                  >
                    {g.active ? 'On' : 'Off'}
                  </button>
                  <button
                    onClick={() => remove(g)}
                    className="grid h-6 w-6 place-items-center bg-white/90 text-red-700"
                    aria-label="Supprimer"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
              {(g.caption || g.tag) && (
                <div className="mt-1 truncate text-[10px] text-white">
                  {g.tag && <span className="uppercase tracking-[0.18em] opacity-80">{g.tag} · </span>}
                  {g.caption}
                </div>
              )}
            </div>
          </figure>
        ))}
      </div>
    </div>
  );
}
