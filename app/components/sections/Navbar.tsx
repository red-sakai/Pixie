import Container from "../ui/Container";
import ButtonLink from "../ui/ButtonLink";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50">
      <Container className="py-3">
        <div className="relative flex h-14 items-center justify-between rounded-full border border-foreground/10 bg-background/65 px-5 backdrop-blur">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full opacity-70 [background:linear-gradient(90deg,color-mix(in_oklab,var(--chart-4),transparent_75%),transparent_55%,color-mix(in_oklab,var(--chart-4),transparent_82%))]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-white/10"
          />

          <a
            href="#top"
            className="relative z-10 flex items-center gap-2 font-semibold opacity-0 [animation:fade-up_700ms_ease-out_80ms_both]"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-foreground/15 bg-foreground/5 transition-transform duration-300 hover:scale-105">
              P
            </span>
            <span>Pixie</span>
          </a>

          <nav className="relative z-10 hidden items-center gap-6 text-sm sm:flex opacity-0 [animation:fade-up_700ms_ease-out_160ms_both]">
            <a
              href="#top"
              className="text-foreground transition-colors hover:text-foreground/80"
            >
              Home
            </a>
            <a
              href="#how-it-works"
              className="text-foreground/80 transition-colors hover:text-foreground"
            >
              How It Works
            </a>
            <a
              href="#footer"
              className="text-foreground/80 transition-colors hover:text-foreground"
            >
              Contact
            </a>
          </nav>

          <div className="relative z-10 flex items-center gap-2 opacity-0 [animation:fade-up_700ms_ease-out_240ms_both]">
            <ButtonLink href="#how-it-works" variant="secondary">
              Learn more
            </ButtonLink>
            <ButtonLink href="#top">Start</ButtonLink>
          </div>
        </div>
      </Container>
    </header>
  );
}
