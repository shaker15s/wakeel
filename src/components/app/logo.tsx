import { cn } from "@/lib/utils";

/**
 * WAKEEL logo mark — a sharp, angular "و" (waw) inspired glyph:
 * an angular loop (the head) with a kinked descending tail and a
 * single gold square "blip" inside the loop, like a radar contact.
 * Drawn on a 24px grid.
 */
export function WakeelMark({
  className,
  strokeWidth = 1.7,
}: {
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("size-6 text-gold", className)}
    >
      <path
        d="M7.8 3.4 L16.4 3.4 L19.4 8 L15.6 12.6 L7.8 12.6 L4.6 8 Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="miter"
      />
      <path
        d="M11.2 12.6 L9.4 16.4 L6.2 20.4"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="square"
      />
      <rect
        x="12.75"
        y="6.75"
        width="1.7"
        height="1.7"
        transform="rotate(45 13.6 7.6)"
        fill="currentColor"
      />
    </svg>
  );
}

export function WakeelLogo({
  className,
  markClassName,
  compact = false,
}: {
  className?: string;
  markClassName?: string;
  compact?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <WakeelMark className={cn("size-6", markClassName)} />
      {!compact && (
        <span className="flex items-baseline gap-1.5">
          <span className="font-display text-[15px] font-bold leading-none tracking-[0.12em] text-foreground">
            WAKEEL
          </span>
          <span className="font-arabic text-[13px] leading-none text-gold">
            وكيل
          </span>
        </span>
      )}
    </span>
  );
}
