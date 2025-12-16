import { cn } from "./cn";

import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

type ContainerProps<C extends ElementType> = {
  as?: C;
  children: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<C>, "as" | "children" | "className">;

export default function Container<C extends ElementType = "div">({
  children,
  className,
  as,
  ...props
}: ContainerProps<C>) {
  const Component = (as ?? "div") as ElementType;
  return (
    <Component
      {...props}
      className={cn("mx-auto w-full max-w-6xl px-4", className)}
    >
      {children}
    </Component>
  );
}
