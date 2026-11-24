/**
 * Counts the reads of the elements of the lists it wraps. One pass over a
 * list reads each element once, so the count tells a pass from a search per
 * item on any machine, where a time bound fails on a busy one.
 */
export const countReads = () => {
  let reads = 0;
  return {
    reads: () => reads,
    of: <Item>(items: Item[]): Item[] =>
      new Proxy(items, {
        get: (target, key, receiver) => {
          if (typeof key === "string" && /^\d+$/.test(key)) {
            reads += 1;
          }
          return Reflect.get(target, key, receiver) as unknown;
        },
      }),
  };
};
