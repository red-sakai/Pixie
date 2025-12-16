"use client";

import { useEffect } from "react";

import { cn } from "./cn";

type ModalProps = {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
};

export default function Modal({
  open,
  title,
  children,
  onClose,
  className,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default bg-black/60"
        onClick={onClose}
      />

      <div
        className={cn(
          "relative w-full max-w-2xl overflow-hidden rounded-3xl border border-foreground/10 bg-background/90 backdrop-blur",
          className
        )}
      >
        <div className="flex items-center justify-between gap-4 border-b border-foreground/10 px-6 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-foreground/15 bg-foreground/5 px-3 py-1 text-sm transition hover:bg-foreground/10"
          >
            Close
          </button>
        </div>

        <div className="max-h-[70vh] overflow-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
