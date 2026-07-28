"use client";

import { useEffect, useState } from "react";

/**
 * A tiered countdown to an ISO datetime — granularity steps up as the
 * deadline gets closer instead of always ticking seconds: days+hours while
 * there's more than a day left ("12d 4h"), hours+minutes once under a day
 * ("18h 32m"), then minutes+seconds only in the final hour ("42m 15s").
 */
function formatRemaining(targetMs: number): string | null {
  const diff = targetMs - Date.now();
  if (diff <= 0) return null;
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days >= 1) return `${days}d ${hours}h`;
  if (hours >= 1) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

export function CountdownTimer({
  target,
  label,
  expiredLabel,
  size = "default",
  className,
}: {
  target: string;
  label: string;
  expiredLabel: string;
  /** "hero" is a much larger, eye-catching treatment for a page's main
   * countdown banner; "default" is the compact card/inline size. */
  size?: "default" | "hero";
  className?: string;
}) {
  const targetMs = new Date(target).getTime();
  const [display, setDisplay] = useState<string | null>(() => formatRemaining(targetMs));

  useEffect(() => {
    const tick = () => setDisplay(formatRemaining(targetMs));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [targetMs]);

  const labelClass =
    size === "hero"
      ? "text-sm font-semibold uppercase tracking-wide text-brand-blue dark:text-blue-300"
      : "text-xs font-medium uppercase tracking-wide text-gray-400";
  const valueClass =
    size === "hero"
      ? "text-4xl font-extrabold tabular-nums text-brand-navy dark:text-white sm:text-5xl"
      : "text-lg font-semibold tabular-nums text-brand-navy dark:text-white";

  if (!display) {
    return <p className={`font-medium text-gray-500 dark:text-gray-400 ${className ?? ""}`}>{expiredLabel}</p>;
  }

  return (
    <div className={className}>
      <p className={labelClass}>{label}</p>
      <p className={valueClass}>{display}</p>
    </div>
  );
}
