import Container from "../ui/Container";
import Section from "../ui/Section";
import Reveal from "../ui/Reveal";

const steps = [
  {
    title: "Choose your focus",
    description:
      "Pick the interview style and topic (fundamentals, projects, behavioral).",
  },
  {
    title: "Answer with clarity",
    description:
      "Pixie asks questions and follow-ups to simulate a real interview flow.",
  },
  {
    title: "Review and improve",
    description:
      "Get structured feedback and concrete suggestions for your next attempt.",
  },
];

export default function HowItWorks() {
  return (
    <Section id="how-it-works">
      <Container>
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            How it works
          </h2>
          <p className="mt-3 text-base text-foreground/80">
            A simple flow designed for ICPEP.SE — PUP Manila members and
            applicants.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map((step, idx) => (
            <Reveal
              key={step.title}
              delayMs={idx * 90}
              className="rounded-3xl border border-foreground/10 bg-foreground/5 p-6 transition-transform duration-300 hover:-translate-y-1"
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-foreground/15 bg-background text-sm font-medium">
                  {idx + 1}
                </span>
                <h3 className="text-lg font-semibold">{step.title}</h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-foreground/80">
                {step.description}
              </p>
            </Reveal>
          ))}
        </div>
      </Container>
    </Section>
  );
}
