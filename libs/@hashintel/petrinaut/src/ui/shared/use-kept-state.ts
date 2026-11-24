import {
  createContext,
  use,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";

import type { Dispatch, RefObject, SetStateAction } from "react";

/**
 * What the components below keep while they are unmounted, by key. A panel
 * unmounts its content when it closes: `KeptState` around the panel holds
 * what the content finds again when the panel opens.
 */
export const KeptStateContext = createContext<Map<string, unknown> | null>(
  null,
);

/**
 * Whether the scroll container around a component mounted at an offset past
 * its top. What is below the first screen of the content is then in sight at
 * once, and must not wait for a later render.
 */
export const MountsScrolledContext = createContext(false);

/**
 * `useState` for a value that outlives its component: it starts from the
 * value kept under `key`, and every change is kept. A key belongs to one
 * caller, which gives the value its type. Outside a `KeptState` this is plain
 * state.
 */
export const useKeptState = <Value>(
  key: string,
  initial: Value,
): [Value, Dispatch<SetStateAction<Value>>] => {
  const kept = use(KeptStateContext);
  const state = useState(() =>
    kept?.has(key) ? (kept.get(key) as Value) : initial,
  );
  const [value] = state;
  useEffect(() => {
    kept?.set(key, value);
  }, [kept, key, value]);
  return state;
};

const keptOffset = (kept: Map<string, unknown> | null, key: string): number =>
  (kept?.get(key) as number | undefined) ?? 0;

/**
 * Keeps the scroll offset of the element in `ref` under `key`: the element
 * mounts at the offset it was last scrolled to. Returns whether it mounted
 * past its top, for {@link MountsScrolledContext}.
 */
export const useKeptScroll = (
  ref: RefObject<HTMLElement | null>,
  key: string,
): boolean => {
  const kept = use(KeptStateContext);
  const [mountsScrolled] = useState(() => keptOffset(kept, key) > 0);
  // Before the first paint, so that the content is never seen at its top.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!kept || !element) {
      return;
    }
    // Only where there is an offset to return to: writing one makes the
    // browser lay the element out at once.
    const offset = keptOffset(kept, key);
    if (offset > 0) {
      element.scrollTop = offset;
    }
    const keepOffset = () => kept.set(key, element.scrollTop);
    element.addEventListener("scroll", keepOffset, { passive: true });
    return () => element.removeEventListener("scroll", keepOffset);
  }, [kept, key, ref]);
  return mountsScrolled;
};
