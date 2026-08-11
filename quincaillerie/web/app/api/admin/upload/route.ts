import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { resolveMember } from '@/lib/auth-server';
import { canWriteModule, FOLDER_MODULE } from '@/lib/permissions';

const BUCKET = 'media';
// Le navigateur compresse avant d'envoyer ; cette limite n'est qu'un garde-fou
// contre un client qui contournerait la compression.
const MAX_BYTES = 8 * 1024 * 1024; // 8 Mo

/** Extrait le chemin objet d'une URL publique du bucket, ou null. */
function cheminDepuisUrl(url: string): string | null {
  const marqueur = `/storage/v1/object/public/${BUCKET}/`;
  const i = url.indexOf(marqueur);
  if (i === -1) return null;
  const chemin = url.slice(i + marqueur.length).split('?')[0];
  // Un chemin remontant (..) sortirait du bucket : on refuse.
  return chemin && !chemin.includes('..') ? decodeURIComponent(chemin) : null;
}

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/avif': 'avif',
};
// Dossiers autorisés : évite qu'un chemin arbitraire soit écrit dans le bucket.
const FOLDERS = new Set(Object.keys(FOLDER_MODULE));

export async function POST(req: NextRequest) {
  const member = await resolveMember(
    req.cookies.get('qc_admin')?.value,
    req.cookies.get('qc_session')?.value,
  );
  if (!member) return NextResponse.json({ error: 'Session expirée.' }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  const file = form.get('file');
  const folderRaw = String(form.get('folder') ?? 'products');
  const folder = FOLDERS.has(folderRaw) ? folderRaw : 'products';

  const mod = FOLDER_MODULE[folder];
  if (!mod || !canWriteModule(member.roles, mod)) {
    return NextResponse.json({ error: 'Droits insuffisants.' }, { status: 403 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Aucun fichier.' }, { status: 400 });
  }
  if (!EXT[file.type]) {
    return NextResponse.json(
      { error: `Format non accepté : ${file.type}` },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Fichier trop lourd (max 8 Mo).' }, { status: 413 });
  }

  const path = `${folder}/${crypto.randomUUID()}.${EXT[file.type]}`;
  const admin = supabaseAdmin();
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: false,
    });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl, path });
}

/**
 * Supprime un fichier du bucket.
 *
 * Sans cette route, remplacer ou retirer une image laisserait l'ancien objet
 * dans le bucket pour toujours : au fil des corrections de fiches produit, le
 * gigaoctet gratuit se remplirait de fichiers que plus rien ne référence.
 */
export async function DELETE(req: NextRequest) {
  const member = await resolveMember(
    req.cookies.get('qc_admin')?.value,
    req.cookies.get('qc_session')?.value,
  );
  if (!member) return NextResponse.json({ error: 'Session expirée.' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { url?: string } | null;
  const chemin = body?.url ? cheminDepuisUrl(body.url) : null;
  if (!chemin) {
    return NextResponse.json({ error: 'URL hors du bucket.' }, { status: 400 });
  }

  // Le dossier détermine le module, donc le droit d'écriture.
  const dossier = chemin.split('/')[0];
  const mod = FOLDER_MODULE[dossier];
  if (!mod || !canWriteModule(member.roles, mod)) {
    return NextResponse.json({ error: 'Droits insuffisants.' }, { status: 403 });
  }

  const { error } = await supabaseAdmin().storage.from(BUCKET).remove([chemin]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
