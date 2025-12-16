import Footer from "./components/sections/Footer";
import Hero from "./components/sections/Hero";
import HowItWorks from "./components/sections/HowItWorks";
import Navbar from "./components/sections/Navbar";

export default function Home() {
  return (
    <main id="top" className="min-h-screen bg-background text-foreground">
      <Navbar />
      <Hero />
      <HowItWorks />
      <Footer />
    </main>
  );
}
