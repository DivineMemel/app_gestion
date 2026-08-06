import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { resolveMember } from '@/lib/auth-server';
import { canWriteModule, FOLDER_MODULE } from '@/lib/permissions';

const BUCKET = 'media';
const MAX_BYTES = 8 * 1024 * 1024; // 8 Mo

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
  if (!mod || !canWriteModule(member.role, mod)) {
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
