import { Navbar } from '@/components/Navbar';
import { Hero } from '@/components/Hero';
import { Sectors } from '@/components/Sectors';
import { Services } from '@/components/Services';
import { Gallery } from '@/components/Gallery';
import { Stylists } from '@/components/Stylists';
import { CtaBooking } from '@/components/CtaBooking';
import { Footer } from '@/components/Footer';
import { DonneesStructurees } from '@/components/DonneesStructurees';
import { getStorefrontData } from '@/lib/storefront-data';

// Régénérée toutes les 5 minutes plutôt qu'à chaque visite : la page est
// alors servie par le CDN, ce qui compte pour les Core Web Vitals. L'agenda
// admin, lui, continue de lire en direct.
export const revalidate = 300;

export default async function Home() {
  const { settings, sectors, services, staff, gallery } = await getStorefrontData();

  return (
    <>
      <DonneesStructurees settings={settings} services={services} />
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
