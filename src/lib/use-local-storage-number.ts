"use client";

import { useEffect, useRef, useState } from "react";

/** Same hydration-safe mount-effect pattern as useLocalStorageFlag, for a numeric value. */
export function useLocalStorageNumber(key: string, defaultValue: number) {
  const [value, setValue] = useState(defaultValue);
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const stored = window.localStorage.getItem(key);
    const parsed = stored !== null ? Number(stored) : NaN;
    if (!Number.isNaN(parsed)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from an external store (localStorage), not a value React owns
      setValue(parsed);
    }
  }, [key]);

  useEffect(() => {
    window.localStorage.setItem(key, String(value));
  }, [key, value]);

  return [value, setValue] as const;
}
