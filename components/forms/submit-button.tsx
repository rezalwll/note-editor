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
        "inline-flex items-center justify-center rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-stone-50 transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      {pending ? pendingText : children}
    </button>
  );
}
