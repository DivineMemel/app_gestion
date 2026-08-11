import { ImageResponse } from 'next/og';
import { getShop } from '@/lib/storefront';

// Image de partage, générée à la volée plutôt que maintenue en fichier binaire :
// elle suit le nom de la boutique défini dans Paramètres.
//
// C'est ce que voient les clientes quand on leur envoie le lien sur WhatsApp —
// le premier canal ici. Sans elle, le message n'affiche qu'une URL nue.

export const runtime = 'nodejs';
export const alt = 'NADAL MULTISERVICES — Matériaux, décoration & prestations';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  const shop = await getShop();

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#f5f4f2',
          padding: 72,
          fontFamily: 'sans-serif',
        }}
      >
        {/* Bandeau de chantier, les deux couleurs de la charte */}
        <div style={{ display: 'flex', height: 14 }}>
          {Array.from({ length: 40 }).map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                background: i % 2 === 0 ? '#ef9a1a' : '#1d4e9b',
              }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: 86,
              fontWeight: 700,
              letterSpacing: -1,
              display: 'flex',
              gap: 18,
            }}
          >
            <span style={{ color: '#1d4e9b' }}>NADAL</span>
            <span style={{ color: '#ef9a1a' }}>SERVICES</span>
          </div>
          <div style={{ fontSize: 38, color: '#3e3c38', marginTop: 18 }}>
            {shop.tagline ?? 'Matériaux, décoration & prestations'}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 28,
            color: '#747069',
          }}
        >
          <span>{shop.address ?? 'Bingerville, Abidjan'}</span>
          <span>{shop.phone ?? ''}</span>
        </div>
      </div>
    ),
    size,
  );
}
