/**
 * Folds a tree from its leaves up through an explicit stack, so a fold handles any nesting depth that fits in memory.
 *
 * @internal
 */

interface Frame<N, A> {
  readonly node: N;
  readonly children: readonly N[];
  readonly results: A[];
}

/**
 * Combines each node with the results of its children, in the order `children` returns them, and returns the root's result.
 *
 * A node waiting for the results of its children waits on an array instead of the call stack, so memory rather than the stack limits how deep the tree can nest.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- folds one tree with its two operations
export const fold = <N, A>(
  root: N,
  children: (node: N) => readonly N[],
  combine: (node: N, results: readonly A[]) => A,
): A => {
  const enter = (node: N): Frame<N, A> => ({
    node,
    children: children(node),
    results: [],
  });

  const pending: Frame<N, A>[] = [];
  let frame = enter(root);

  for (;;) {
    const child = frame.children[frame.results.length];

    if (child === undefined) {
      const result = combine(frame.node, frame.results);
      const parent = pending.pop();

      if (parent === undefined) {
        return result;
      }

      parent.results.push(result);
      frame = parent;
    } else {
      pending.push(frame);
      frame = enter(child);
    }
  }
};
