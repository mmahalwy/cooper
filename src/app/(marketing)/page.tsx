import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { TheShift } from "@/components/TheShift";
import { WhyCooper } from "@/components/WhyCooper";
import { Features } from "@/components/Features";
import { CTA } from "@/components/CTA";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <TheShift />
        <WhyCooper />
        <Features />
        <CTA />
      </main>
      <Footer />
    </>
  );
}
