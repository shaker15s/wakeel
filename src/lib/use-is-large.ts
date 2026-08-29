"use client";

import { useEffect, useState } from "react";

/**
 * Track the lg breakpoint (1024px). The agent dock renders as an inline
 * panel at ≥lg and as an overlay sheet below it — both need the same
 * signal so only ONE chat surface ever mounts.
 */
export function useIsLarge() {
  const [isLarge, setIsLarge] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsLarge(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  return isLarge;
}
