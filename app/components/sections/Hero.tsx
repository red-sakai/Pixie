import Container from "../ui/Container";
import Section from "../ui/Section";
import DarkVeil from "./DarkVeil";

export default function Hero() {
  return (
    <Section className="relative min-h-screen -mt-16 overflow-hidden py-0 sm:py-0">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <DarkVeil
          hueShift={290}
          noiseIntensity={0.06}
          scanlineIntensity={0.15}
          scanlineFrequency={2.0}
          warpAmount={0.25}
          speed={0.25}
          resolutionScale={1}
        />
        <div className="absolute inset-0 bg-background/55" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />
      </div>
      <Container className="flex min-h-screen items-center justify-center">
        <div className="mx-auto w-full max-w-3xl -translate-y-10 text-center sm:-translate-y-14">
          <h1 className="text-balance text-5xl font-semibold tracking-tight opacity-0 [animation:fade-up_800ms_ease-out_80ms_both] sm:text-6xl">
            Pixie.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-pretty text-lg text-foreground/80 opacity-0 [animation:fade-up_800ms_ease-out_180ms_both] sm:text-xl">
            An AI interviewer for software engineering students—built to help
            you practice, improve, and show up confident.
          </p>
          <p className="mx-auto mt-6 text-xs text-foreground/60 opacity-0 [animation:fade-up_800ms_ease-out_280ms_both]">
            Official AI interviewer of ICPEP.SE — PUP Manila
          </p>
        </div>
      </Container>
    </Section>
  );
}
