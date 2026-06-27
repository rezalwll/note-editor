"use client";

import { useFormStatus } from "react-dom";

import { cn } from "@/lib/utils";

type SubmitButtonProps = {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
};

export function SubmitButton({
  children,
  pendingText = "Saving...",
  className,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-[#7682ff] px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(118,130,255,0.28)] transition hover:bg-[#5d6bff] disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      {pending ? pendingText : children}
    </button>
  );
}
