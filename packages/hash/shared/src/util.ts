// @todo this should be defined elsewhere
import { uniq } from "lodash";

/**
 * This behaves differently from the type `{}`, and will error if you set more properties on it.
 */
export type EmptyObject = Record<any, never>;

export type DistributiveOmit<T, K extends keyof any> = T extends any
  ? Omit<T, K>
  : never;

export type DistributivePick<T, K extends keyof T> = T extends unknown
  ? Pick<T, K>
  : never;

/**
 * @see https://github.com/microsoft/TypeScript/issues/25720#issuecomment-533438205
 */
export const isUnknownObject = (
  x: unknown,
): x is { [key in PropertyKey]: unknown } =>
  x !== null && typeof x === "object";

/**
 * This allows you to collect calls to a function to run at the end of a tick
 */
export const collect = <P extends Array<any>>(
  handler: (calls: P[]) => void,
): ((...args: P) => void) => {
  let id: ReturnType<typeof setImmediate> | null = null;
  let calls: P[] = [];

  return (...args: P) => {
    if (id !== null) {
      clearImmediate(id);
      id = null;
    }

    calls.push(args);

    id = setImmediate(() => {
      const thisCalls = calls;
      calls = [];
      handler(thisCalls);
    });
  };
};

/** A `Map` which creates a default value if the value for a key is not set. */
export class DefaultMap<K, V> extends Map<K, V> {
  private makeDefault: () => V;

  constructor(makeDefault: () => V) {
    super();
    this.makeDefault = makeDefault;
  }

  get = (key: K) => {
    let value = super.get(key);
    if (value) {
      return value;
    }
    value = this.makeDefault();
    super.set(key, value);
    return value;
  };
}

/**
 * Perform a topological sort [1] on an array of `edges` forming a directed acyclic graph.
 * [1] https://en.wikipedia.org/wiki/Topological_sorting
 * @returns a topological ordering of the nodes represented by the graph in `edges`.
 * @throws an error if the graph has a cycle.
 * */
export const topologicalSort = <T>(edges: [T, T][]) => {
  // Implementation based on Kahn's algorithm. See:
  // https://en.wikipedia.org/wiki/Topological_sorting#Kahn's_algorithm)

  // Find nodes with no incoming edge, i.e. the root node(s)
  const nonRootNodes = new Set(edges.map(([_, node]) => node));
  const rootNodes = uniq(
    edges.map(([node, _]) => node).filter((node) => !nonRootNodes.has(node)),
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

  const sort = [];
  const stack = [...rootNodes];

  while (stack.length > 0) {
    const node = stack.pop()!;
    sort.push(node);
    const nodeOutgoing = outgoingEdges.get(node);
    for (const child of Array.from(nodeOutgoing.values())) {
      const childIncoming = incomingEdges.get(child)!;
      // Remove the (node, child) edge from the graph
      nodeOutgoing.delete(child);
      childIncoming.delete(node);
      if (childIncoming.size === 0) {
        stack.push(child);
      }
    }
  }

  // If there are any edges left, then the graph is not acyclic
  for (const [_, children] of Array.from(outgoingEdges.entries())) {
    if (children.size !== 0) {
      throw new Error("graph is not acyclic");
    }
  }

  return sort;
};

/**
 * Restructure a list of elements with parent references into a tree
 * This will ignore elements with missing parent entities and add them at the root level
 * This can be used for recreating a page tree structure from the list of an account's pages
 * @param elements is the list of elements that should contain an id and optionally reference to a parent and a list of children
 * @param key is the name of the id property on the element, used to strongly type the code
 * @param reference is the name of the parent reference property on the element
 * @param recursive is the name of the property that deals with children of an element. This will be populated with the tree structure.
 */
export const treeFromParentReferences = <
  Element extends {
    [_ in Key]: string;
  } & { [_ in Ref]?: string } & { [_ in Rec]?: Element[] },
  Key extends string,
  Ref extends string,
  Rec extends string,
>(
  elements: Element[],
  key: Key,
  reference: Ref,
  recursive: Rec,
) => {
  const topologicallySorted = topologicalSort(
    elements
      .filter(
        (element) =>
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
          element[reference] != null,
      )
      .map((element) => [element[key] as string, element[reference]]),
  );

  const mapping = new Map<string, Element>();

  for (const element of elements) {
    mapping.set(element[key], element);
  }

  for (const currentId of topologicallySorted) {
    const current = mapping.get(currentId);
    if (!current) {
      continue;
    }
    const existingParent = mapping.get(current[reference]);
    if (!existingParent) {
      (current[reference] as string | undefined) = undefined;
      continue;
    }

    /**
     * Topological sorting handles the case of cyclic references.
     * Otherwise a check like the following could be relevant.
     * if ((current[key] as string) === existingParent[reference]) {
     *    throw new Error(
     *      `Circular references given. Unable to reconstruct tree at ${current[key]}`,
     *    );
     *  }
     * */

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
    if (existingParent[recursive]) {
      existingParent[recursive].push(current);
    } else {
      (existingParent[recursive] as Element[]) = [current];
    }
  }

  return Array.from(mapping.values()).filter(
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
    (element) => element[reference] == null,
  );
};

/**
 * Try to traverse a Graph and flatMap each node.
 * @param graph any object which may contain object values
 * @param fn mapping function for each node
 * @returns List of mapped nodes
 */
export const flatMapTree = <T>(graph: object, fn: (a: unknown) => T[]) => {
  const queue = [graph];
  const result: T[] = [];

  // BFS traversal using FIFO queue
  while (queue.length !== 0) {
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

/**
 * Use to check if current browser is Safari or not
 */
export const isSafariBrowser = () =>
  navigator.userAgent.indexOf("Safari") > -1 &&
  navigator.userAgent.indexOf("Chrome") <= -1;

export const typedKeys = <T extends keyof any>(
  record: Record<T, unknown>,
): T[] => Object.keys(record) as any;

type TupleEntry<
  T extends readonly unknown[],
  I extends unknown[] = [],
  R = never,
> = T extends readonly [infer Head, ...infer Tail]
  ? TupleEntry<Tail, [...I, unknown], R | [`${I["length"]}`, Head]>
  : R;

type ObjectEntry<T extends {}> = T extends object
  ? { [K in keyof T]: [K, Required<T>[K]] }[keyof T] extends infer E
    ? E extends [infer K, infer V]
      ? K extends string | number
        ? [`${K}`, V]
        : never
      : never
    : never
  : never;

// Source: https://dev.to/harry0000/a-bit-convenient-typescript-type-definitions-for-objectentries-d6g
export type Entry<T extends {}> = T extends readonly [unknown, ...unknown[]]
  ? TupleEntry<T>
  : T extends ReadonlyArray<infer U>
  ? [`${number}`, U]
  : ObjectEntry<T>;

/** `Object.entries` analogue which returns a well-typed array */
export function typedEntries<T extends {}>(object: T): ReadonlyArray<Entry<T>> {
  return Object.entries(object) as unknown as ReadonlyArray<Entry<T>>;
}
