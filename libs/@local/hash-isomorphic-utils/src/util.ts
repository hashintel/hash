import { isNil, uniq } from "lodash-es";

/**
 * This behaves differently from the type `{}`, and will error if you set more properties on it.
 */
export type EmptyObject = Record<string, never>;

/**
 * @see https://github.com/microsoft/TypeScript/issues/25720#issuecomment-533438205
 */
export const isUnknownObject = (
  // oxlint-disable-next-line typescript/no-restricted-types -- a type guard takes arbitrary input by definition
  value: unknown,
  // oxlint-disable-next-line typescript/no-restricted-types -- the guarded object's values are not known
): value is Record<PropertyKey, unknown> =>
  value !== null && typeof value === "object";

/**
 * This allows you to collect calls to a function to run at the end of a tick
 */
export const collect = <
  // oxlint-disable-next-line typescript/no-restricted-types -- the constraint accepts any argument list of the collected function
  P extends unknown[],
>(
  handler: (calls: P[]) => void,
): ((...args: P) => void) => {
  let id: ReturnType<typeof globalThis.setImmediate> | null = null;
  let calls: P[] = [];

  return (...args: P) => {
    if (id !== null) {
      globalThis.clearImmediate(id);
      id = null;
    }

    calls.push(args);

    id = globalThis.setImmediate(() => {
      const thisCalls = calls;
      calls = [];
      handler(thisCalls);
    });
  };
};

/** A `Map` which creates a default value if the value for a key is not set. */
export class DefaultMap<K, V> extends Map<K, V> {
  readonly #makeDefault: () => V;

  constructor(makeDefault: () => V) {
    super();
    this.#makeDefault = makeDefault;
  }

  get = (key: K): V => {
    let value = super.get(key);
    if (value !== undefined) {
      return value;
    }
    value = this.#makeDefault();
    super.set(key, value);
    return value;
  };
}

/**
 * Perform a topological sort [1] on an array of `edges` forming a directed acyclic graph.
 * [1] https://en.wikipedia.org/wiki/Topological_sorting
 * @returns a topological ordering of the nodes represented by the graph in `edges`.
 * @throws {Error} if the graph has a cycle.
 * */
export const topologicalSort = <T>(edges: [T, T][]): T[] => {
  // Implementation based on Kahn's algorithm. See:
  // https://en.wikipedia.org/wiki/Topological_sorting#Kahn's_algorithm)

  // Find nodes with no incoming edge, i.e. the root node(s)
  const nonRootNodes = new Set(edges.map(([, node]) => node));
  const rootNodes = uniq(
    edges.map(([node]) => node).filter((node) => !nonRootNodes.has(node)),
  );

  // Pre-compute the incoming and outgoing edges for each node as an optimization
  const outgoingEdges = new DefaultMap<T, Set<T>>(() => new Set());
  for (const [n1, n2] of edges) {
    outgoingEdges.get(n1).add(n2);
  }
  const incomingEdges = new DefaultMap<T, Set<T>>(() => new Set());
  for (const [n1, n2] of edges) {
    incomingEdges.get(n2).add(n1);
  }

  const sort: T[] = [];
  const stack = [...rootNodes];

  while (stack.length > 0) {
    // SAFETY: the loop condition guarantees the stack is non-empty.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `pop` returns `T | undefined`, and `T` itself may include `undefined`, so the length check cannot be replaced by an `undefined` check
    const node = stack.pop() as T;
    sort.push(node);
    const nodeOutgoing = outgoingEdges.get(node);
    for (const child of nodeOutgoing.values()) {
      const childIncoming = incomingEdges.get(child);
      // Remove the (node, child) edge from the graph
      nodeOutgoing.delete(child);
      childIncoming.delete(node);
      if (childIncoming.size === 0) {
        stack.push(child);
      }
    }
  }

  // If there are any edges left, then the graph is not acyclic
  for (const children of outgoingEdges.values()) {
    if (children.size > 0) {
      throw new Error("graph is not acyclic");
    }
  }

  return sort;
};

/**
 * Restructure a list of elements with parent references into a tree
 * This will ignore elements with missing parent entities and add them at the root level
 * This can be used for recreating a page tree structure from the list of an account's pages
 * @param elements is the list of elements that should contain an id and optionally reference to a parent and a list of
 *   children
 * @param key is the name of the id property on the element, used to strongly type the code
 * @param reference is the name of the parent reference property on the element
 * @param recursive is the name of the property that deals with children of an element. This will be populated with the
 *   tree structure.
 */
export const treeFromParentReferences = <
  Element extends Record<Key, string> &
    Partial<Record<Ref, string>> &
    Partial<Record<Rec, Element[]>>,
  Key extends string,
  Ref extends string,
  Rec extends string,
  // oxlint-disable-next-line max-params -- the positional signature is part of the public API, used by `@apps/hash-api`
>(
  elements: Element[],
  key: Key,
  reference: Ref,
  recursive: Rec,
): Element[] => {
  const topologicallySorted = topologicalSort(
    elements
      .filter(
        (element) =>
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
          element[reference] !== undefined && element[reference] !== null,
      )
      .map((element) => {
        // SAFETY: `key` names a property declared as a string by the `Element` constraint.
        const id = element[key] as string;
        return [id, element[reference]];
      }),
  );

  const mapping = new Map<string, Element>();

  for (const element of elements) {
    mapping.set(element[key], element);
  }

  for (const currentId of topologicallySorted) {
    const current = mapping.get(currentId);
    if (current !== undefined) {
      const existingParent = mapping.get(current[reference]);

      /**
       * Topological sorting handles the case of cyclic references.
       * Otherwise a check like the following could be relevant.
       * if ((current[key] as string) === existingParent[reference]) {
       *    throw new Error(
       *      `Circular references given. Unable to reconstruct tree at ${current[key]}`,
       *    );
       *  }
       * */

      if (existingParent === undefined) {
        // SAFETY: `reference` names an optional string property by the `Element` constraint.
        (current[reference] as string | undefined) = undefined;
      } else if (existingParent[recursive] === undefined) {
        // SAFETY: `recursive` names an optional `Element[]` property by the `Element` constraint.
        (existingParent[recursive] as Element[]) = [current];
      } else {
        existingParent[recursive].push(current);
      }
    }
  }

  return [...mapping.values()].filter(
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
    (element) =>
      element[reference] === undefined || element[reference] === null,
  );
};

/**
 * Try to traverse a Graph and flatMap each node.
 * @param graph any object which may contain object values
 * @param fn mapping function for each node
 * @returns List of mapped nodes
 */
export const flatMapTree = <T>(
  // oxlint-disable-next-line typescript/no-restricted-types -- the graph is any object whose values may be objects
  graph: object,
  // oxlint-disable-next-line typescript/no-restricted-types -- the mapping function receives nodes of arbitrary shape
  fn: (node: unknown) => T[],
): T[] => {
  // oxlint-disable-next-line typescript/no-restricted-types -- nodes of the graph are of arbitrary shape
  const queue: unknown[] = [graph];
  const result: T[] = [];

  // BFS traversal using FIFO queue
  while (queue.length > 0) {
    const currentNode = queue.shift();

    // Add current nodes to result array
    result.push(...fn(currentNode));

    // Traverse direct descendants of all nodes in the current depth
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
    if (typeof currentNode === "object" && currentNode !== null) {
      for (const current of Object.values(currentNode)) {
        queue.push(current);
      }
    }
  }

  return result;
};
