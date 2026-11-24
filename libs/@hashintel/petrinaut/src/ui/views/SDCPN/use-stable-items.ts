/**
 * Keeps each item of a rebuilt list at the object identity it had last time,
 * for as long as its content is unchanged, and the list itself for as long as
 * none of its items changed.
 *
 * The scene is rebuilt for every hover, selection and drag frame. React Flow
 * renders a node or an edge for a new object and walks every node and edge
 * for a new array, so both are held steady where nothing changed.
 */

import { useRef } from "react";

/**
 * Structural equality over the plain data a scene item carries: primitives,
 * nested plain objects such as a position, and arrays of those. Deliberately
 * not a general deep-equal — a scene item holds no cycles, class instances or
 * functions, and the comparison runs for every item on every render.
 */
const isSameContent = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) {
    return true;
  }
  if (
    typeof left !== "object" ||
    typeof right !== "object" ||
    left === null ||
    right === null
  ) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return false;
    }
    return (
      left.length === right.length &&
      left.every((value, index) => isSameContent(value, right[index]))
    );
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every(
    (key) =>
      Object.hasOwn(right, key) &&
      isSameContent(
        (left as Record<string, unknown>)[key],
        (right as Record<string, unknown>)[key],
      ),
  );
};

/** Whether two lists hold the same objects in the same order. */
export const sameItems = <Item>(
  left: readonly Item[],
  right: readonly Item[],
): boolean =>
  left.length === right.length &&
  left.every((item, index) => item === right[index]);

/**
 * The same list, with unchanged items carried over from the previous render,
 * and the previous list itself when every item was.
 *
 * This is a render-time cache, like the one `useMemo` keeps internally: the
 * previous render's objects are exactly what it has to compare against, so
 * the read cannot move to an effect. It opts out of two things, and both are
 * load-bearing:
 *   - the React Compiler, via `"use no memo"`, which cannot model the cache
 *   - the `react/refs` lint rule, which forbids ref reads in render
 *
 * It is idempotent: every object it returns is content-equal to the one it
 * replaces, so a discarded or repeated render changes nothing a consumer can
 * observe.
 */
export const useStableItems = <Item extends { id: string }>(
  items: Item[],
): Item[] => {
  "use no memo";

  const previous = useRef<{
    given: Item[];
    stable: Item[];
    byId: Map<string, Item>;
  }>({ given: [], stable: [], byId: new Map() });

  /* eslint-disable react/refs -- see the function-level comment. */
  const before = previous.current;
  if (before.given === items) {
    return before.stable;
  }

  const byId = new Map<string, Item>();
  const stable = items.map((item) => {
    const was = before.byId.get(item.id);
    const kept = was !== undefined && isSameContent(was, item) ? was : item;
    byId.set(item.id, kept);
    return kept;
  });
  const allKept = sameItems(stable, before.stable);

  previous.current = {
    given: items,
    stable: allKept ? before.stable : stable,
    byId,
  };
  return previous.current.stable;
  /* eslint-enable react/refs */
};
