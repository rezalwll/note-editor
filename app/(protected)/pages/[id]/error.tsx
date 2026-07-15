"use client";

import { RouteErrorState } from "@/components/route-error-state";

export default function EditorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorState error={error} reset={reset} scope="editor" />;
}
