import Container from "../ui/Container";
import Section from "../ui/Section";
import Reveal from "../ui/Reveal";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <Section id="footer" className="border-t border-foreground/10 py-10">
      <Container>
        <Reveal>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="font-semibold">Pixie</p>
              <p className="text-sm text-foreground/70">
                Official AI interviewer of ICPEP.SE — PUP Manila.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <a href="#top" className="hover:underline">
                Back to top
              </a>
              <a href="#how-it-works" className="hover:underline">
                How it works
              </a>
            </div>
          </div>

          <p className="mt-8 text-xs text-foreground/60">
            © {year} Pixie. All rights reserved.
          </p>
        </Reveal>
      </Container>
    </Section>
  );
}
