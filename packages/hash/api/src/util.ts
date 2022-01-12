import { Uuid4 } from "id128";
import { uniq } from "lodash";

/**
 * Generate a new ID.
 * @todo make ULID. Replace the implementation in datastore/postgres
 * */
export const genId = () => Uuid4.generate().toCanonical().toLowerCase();

/** Get a required environment variable. Throws an error if it's not set. */
export const getRequiredEnv = (name: string) => {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value;
};

/** Returns true if exactly one of items is not null or undefined. */
export const exactlyOne = (...items: any[]): boolean =>
  items
    .map((val) => val !== null && val !== undefined)
    .reduce((acc, val) => (val ? 1 : 0) + acc, 0) === 1;

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

export const isRecord = (thing: unknown): thing is Record<string, any> => {
  if (typeof thing !== "object") {
    return false;
  }
  if (thing == null) {
    return false;
  }
  if (thing instanceof Array) {
    return false;
  }
  return true;
};

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
    for (const child of nodeOutgoing.values()) {
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
  for (const [_, children] of outgoingEdges.entries()) {
    if (children.size !== 0) {
      throw new Error("graph is not acyclic");
    }
  }

  return sort;
};

/** Returns the set intersection of `left` and `right`. */
export const intersection = <T>(left: Set<T>, right: Set<T>): Set<T> => {
  const result = new Set<T>();
  for (const item of left) {
    if (right.has(item)) {
      result.add(item);
    }
  }
  return result;
};

export class Queue<T> {
  private readonly queue: T[];
  private start: number;
  private end: number;

  constructor(array: T[] = []) {
    this.queue = array;

    // pointers
    this.start = 0;
    this.end = array.length;
  }

  isEmpty() {
    return this.end === this.start;
  }

  dequeue(): T | null {
    if (this.isEmpty()) {
      return null;
    } else {
      return this.queue[this.start++];
    }
  }

  enqueue(...value: T[]) {
    this.queue.push(...value);
    this.end += value.length;
  }

  toString() {
    return `Queue (${this.end - this.start})`;
  }

  get length() {
    return this.end - this.start;
  }

  [Symbol.iterator]() {
    let index = this.start;
    return {
      next: () =>
        index < this.end
          ? {
              value: this.queue[index++],
            }
          : { done: true },
    };
  }
}

/**
 * Given a tree structure that has links, flatten into an array with indices pointing to parent.
 * Note, this _will_ behave badly with circular structures!
 * This uses BFS.
 * @param graph The graph structure containing `key` for links
 * @param key The key that allows recursive sub-graphs.
 * @param depthLimit The maximum depth a tree may have before bailing.
 * @returns A flattened list of all nodes with an index referring to where in the list the parent is. Index = 0 means root.
 */
export const linkedTreeFlatten = <
  Outer extends { [_ in K]?: Inner[] | null },
  Inner extends { [_ in K2]: Outer },
  K extends string,
  K2 extends string,
>(
  graph: Outer,
  outerKey: K,
  innerKey: K2,
  depthLimit: number = 50,
) => {
  type AugmentedOuter = Outer & {
    meta?: Omit<Inner, K2>;
    parentIndex: number;
    currentIndex: number;
  };
  type ResultWithMeta = Omit<AugmentedOuter, K | "currentIndex">;

  const queue: Queue<AugmentedOuter[]> = new Queue([
    [{ parentIndex: -1, currentIndex: 0, ...graph }],
  ]);
  const result: ResultWithMeta[] = [];

  let index = 1;
  let depth = 0;
  while (!queue.isEmpty()) {
    let currentIndex = index;

    const toInsert = queue.dequeue();
    if (!toInsert) {
      continue;
    }

    result.push(
      ...toInsert.map((entry) => {
        const { [outerKey]: _1, currentIndex: _2, ...values } = entry;
        return values;
      }),
    );

    depth++;

    const descendantsToQueue = toInsert.reduce((acc, current) => {
      const outer = current[outerKey];
      if (outer) {
        const extractedFromInner = outer.map((entry) => {
          const { [innerKey]: _omitted, ...innerValues } = entry;
          return {
            parentIndex: current.currentIndex,
            currentIndex: currentIndex++,
            meta: innerValues,
            ...entry[innerKey],
          };
        });

        acc.push(extractedFromInner);
      }
      return acc;
    }, [] as AugmentedOuter[][]);
    index = currentIndex;
    if (descendantsToQueue.length > 0) {
      queue.enqueue(...descendantsToQueue);
    }

    if (depth >= depthLimit && !queue.isEmpty()) {
      throw new Error("Depth limit reached!");
    }
  }

  return result;
};
