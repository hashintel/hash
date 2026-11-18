/**
 * A viewer's choice kept in `localStorage`, read through
 * `useSyncExternalStore` so every deck component and every open tab sees the
 * same value. Without storage the choice lasts until the page reloads.
 */

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const memory = new Map<string, string>();

const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
};

const read = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
};

const write = (key: string, value: string) => {
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // `memory` keeps the choice for this page.
  }
  for (const listener of listeners) {
    listener();
  }
};

/** The stored value under `key` when `parse` accepts it, else `fallback`. */
export const useStoredPreference = <Value extends string>(
  key: string,
  parse: (stored: string | null) => Value | undefined,
  fallback: Value,
): [Value, (value: Value) => void] => {
  const value = useSyncExternalStore(
    subscribe,
    () => parse(read(key)) ?? fallback,
    // The prerender has no storage; a deck renders on the client anyway.
    () => fallback,
  );
  return [value, (next: Value) => write(key, next)];
};
