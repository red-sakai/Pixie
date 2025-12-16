import Link from "next/link";
import { cn } from "./cn";

type ButtonVariant = "primary" | "secondary";

type ButtonLinkProps = {
  href: string;
  children: React.ReactNode;
  className?: string;
  variant?: ButtonVariant;
};

const base =
  "inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-foreground text-background hover:bg-foreground/90 border border-foreground/10",
  secondary:
    "bg-background text-foreground hover:bg-foreground/5 border border-foreground/15",
};

export default function ButtonLink({
  href,
  children,
  className,
  variant = "primary",
}: ButtonLinkProps) {
  return (
    <Link href={href} className={cn(base, variants[variant], className)}>
      {children}
    </Link>
  );
}
