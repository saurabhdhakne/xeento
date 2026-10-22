"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A boolean persisted to localStorage, read back after mount. Starts at
 * `defaultValue` on first paint (server and client render identically, no
 * hydration mismatch) and swaps in the stored value in a mount effect.
 */
export function useLocalStorageFlag(key: string, defaultValue: boolean) {
  const [value, setValue] = useState(defaultValue);
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const stored = window.localStorage.getItem(key);
    if (stored !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from an external store (localStorage), not a value React owns
      setValue(stored === "1");
    }
  }, [key]);

  useEffect(() => {
    window.localStorage.setItem(key, value ? "1" : "0");
  }, [key, value]);

  return [value, setValue] as const;
}
