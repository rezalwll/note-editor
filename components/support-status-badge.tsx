import {
  getSupportStatusClasses,
  getSupportStatusLabel,
} from "@/lib/support";
import { cn } from "@/lib/utils";

export function SupportStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        getSupportStatusClasses(status),
        className,
      )}
    >
      {getSupportStatusLabel(status)}
    </span>
  );
}
