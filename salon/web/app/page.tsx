import { Navbar } from '@/components/Navbar';
import { Hero } from '@/components/Hero';
import { Sectors } from '@/components/Sectors';
import { Services } from '@/components/Services';
import { Gallery } from '@/components/Gallery';
import { Stylists } from '@/components/Stylists';
import { CtaBooking } from '@/components/CtaBooking';
import { Footer } from '@/components/Footer';
import { getStorefrontData } from '@/lib/storefront-data';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const { settings, sectors, services, staff, gallery } = await getStorefrontData();

  return (
    <>
      <Navbar settings={settings} />
      <main>
        <Hero settings={settings} />
        <Sectors sectors={sectors} />
        <Services sectors={sectors} services={services} />
        <Gallery images={gallery} />
        <Stylists staff={staff} />
        <CtaBooking settings={settings} />
      </main>
      <Footer settings={settings} />
    </>
  );
}
