/**
 * Keeps each item of a rebuilt list at the object identity it had last time,
 * for as long as its content is unchanged.
 *
 * The scene is rebuilt on every render, so a hover that re-roles ten nodes
 * hands React Flow a thousand new objects and it re-renders all of them.
 * Holding identity steady lets everything the hover did not touch bail out.
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

/**
 * The same list, with unchanged items carried over from the previous render.
 * A new array is still returned: the list itself changes whenever any item
 * does, and callers pass it straight on.
 *
 * This is a render-time cache, like the one `useMemo` keeps internally: the
 * previous render's objects are exactly what it has to compare against, so
 * the read cannot move to an effect. It opts out of two things, and both are
 * load-bearing:
 *   - the React Compiler, via `"use no memo"`, which cannot model the cache
 *   - the `react-hooks-js/refs` lint rule, which forbids ref reads in render
 *
 * It is idempotent: every object it returns is content-equal to the one it
 * replaces, so a discarded or repeated render changes nothing a consumer can
 * observe.
 */
export const useStableItems = <Item extends { id: string }>(
  items: Item[],
): Item[] => {
  "use no memo";

  const previous = useRef(new Map<string, Item>());
  const next = new Map<string, Item>();

  /* eslint-disable react-hooks-js/refs -- see the function-level comment. */
  const stable = items.map((item) => {
    const before = previous.current.get(item.id);
    const kept =
      before !== undefined && isSameContent(before, item) ? before : item;
    next.set(item.id, kept);
    return kept;
  });

  previous.current = next;
  /* eslint-enable react-hooks-js/refs */

  return stable;
};
