import { Navbar } from '@/components/Navbar';
import { Hero } from '@/components/Hero';
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
        <Services />
        <Gallery />
        <Stylists />
        <CtaBooking />
      </main>
      <Footer />
    </>
  );
}
