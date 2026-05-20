import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { resolveMember } from '@/lib/auth-server';
import { canWriteModule, FOLDER_MODULE } from '@/lib/permissions';

const BUCKET = 'media';
const ALLOWED = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/avif',
  'image/gif',
]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 Mo
// Dossiers autorisés dans le bucket (évite des chemins arbitraires).
const FOLDERS = new Set([
  'logo',
  'sectors',
  'services',
  'products',
  'staff',
  'gallery',
]);

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

export async function POST(req: NextRequest) {
  const member = await resolveMember(
    req.cookies.get('muse_admin')?.value,
    req.cookies.get('muse_session')?.value,
  );
  if (!member) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const file = form.get('file');
  const folderRaw = String(form.get('folder') ?? 'gallery');
  const folder = FOLDERS.has(folderRaw) ? folderRaw : 'gallery';

  // Le rôle doit pouvoir écrire le module correspondant au dossier.
  const mod = FOLDER_MODULE[folder];
  if (!mod || !canWriteModule(member.role, mod)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'no_file' }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: `type_not_allowed:${file.type}` }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 413 });
  }

  const ext = EXT[file.type] ?? 'bin';
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const admin = supabaseAdmin();
  const { error } = await admin.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type,
    upsert: false,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl, path });
}
