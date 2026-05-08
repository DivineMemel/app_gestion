import { Navbar } from '@/components/Navbar';
import { Hero } from '@/components/Hero';
import { Sectors } from '@/components/Sectors';
import { Services } from '@/components/Services';
import { Gallery } from '@/components/Gallery';
import { Stylists } from '@/components/Stylists';
import { CtaBooking } from '@/components/CtaBooking';
import { Footer } from '@/components/Footer';

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Sectors />
        <Services />
        <Gallery />
        <Stylists />
        <CtaBooking />
      </main>
      <Footer />
    </>
  );
}
