import { ImageResponse } from 'next/og';
import { getStorefrontData } from '@/lib/storefront-data';

// Image de partage, générée depuis les réglages du salon plutôt que maintenue
// en fichier binaire : elle suit le nom et l'accroche définis en admin.
//
// C'est ce que voient les clientes quand on leur envoie le lien sur WhatsApp
// ou Instagram. Sans elle, le message n'affiche qu'une URL nue.

export const runtime = 'nodejs';
export const alt = 'MUSE l’atelier — Coiffure, onglerie et soins à Abidjan';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  const { settings } = await getStorefrontData();
  const nom = settings?.name ?? 'MUSE l’atelier';
  const accroche = settings?.tagline ?? 'Coiffure · Onglerie · Soins';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: '#0a0807',
          color: '#f7f5ef',
          fontFamily: 'Georgia, serif',
          padding: 80,
        }}
      >
        {/* Filet fin : la signature graphique de la maison. */}
        <div style={{ width: 70, height: 1, background: '#8a7f6d' }} />

        <div
          style={{
            fontSize: 92,
            letterSpacing: 2,
            marginTop: 40,
            textAlign: 'center',
          }}
        >
          {nom}
        </div>

        <div
          style={{
            fontSize: 30,
            color: '#a89c8a',
            marginTop: 28,
            letterSpacing: 6,
            textTransform: 'uppercase',
            textAlign: 'center',
          }}
        >
          {accroche}
        </div>

        <div style={{ width: 70, height: 1, background: '#8a7f6d', marginTop: 44 }} />

        <div style={{ fontSize: 24, color: '#8a7f6d', marginTop: 44 }}>
          {settings?.address ?? 'Abidjan'}
        </div>
      </div>
    ),
    size,
  );
}
