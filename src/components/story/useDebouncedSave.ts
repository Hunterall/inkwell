import { useEffect, useRef } from "react";

/** Merges patches and flushes them after a pause in typing. */
export function useDebouncedSave<T extends object>(
  fn: (patch: Partial<T>) => Promise<void>,
  delay = 700,
) {
  const pending = useRef<Partial<T>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        if (Object.keys(pending.current).length) void fnRef.current(pending.current);
      }
    },
    [],
  );

  return (patch: Partial<T>) => {
    pending.current = { ...pending.current, ...patch };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const p = pending.current;
      pending.current = {};
      timer.current = null;
      void fnRef.current(p);
    }, delay);
  };
}
