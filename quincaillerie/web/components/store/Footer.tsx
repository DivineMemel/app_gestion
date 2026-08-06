import Link from 'next/link';

export function Footer({
  shop,
}: {
  shop: {
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
  };
}) {
  return (
    <footer className="border-t py-10" style={{ borderColor: 'rgb(var(--line))' }}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 text-[13px]">
        <div>
          <div className="font-display text-lg font-semibold uppercase tracking-industrial">
            {shop.name}
          </div>
          <div style={{ color: 'rgb(var(--muted))' }}>
            {[shop.address, shop.phone, shop.email].filter(Boolean).join(' · ')}
          </div>
        </div>
        <Link href="/admin" className="btn-ghost">
          Espace gestion
        </Link>
      </div>
    </footer>
  );
}
