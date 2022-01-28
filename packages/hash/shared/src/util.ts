// @todo this should be defined elsewhere

import { uniq } from "lodash";
import { FileProperties } from "./graphql/apiTypes.gen";

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

type Entries<T> = {
  [K in keyof T]: [K, T[K]];
}[keyof T][];

/**
 * @see https://stackoverflow.com/a/60142095
 */
export const typeSafeEntries = <T>(obj: T): Entries<T> =>
  Object.entries(obj) as any;

export const isFileProperties = (props: {}): props is FileProperties => {
  return (
    "key" in props &&
    "size" in props &&
    "url" in props &&
    "storageType" in props
  );
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
      .filter((element) => element[reference] != null)
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

    if (existingParent[recursive]) {
      existingParent[recursive].push(current);
    } else {
      (existingParent[recursive] as Element[]) = [current];
    }
  }

  return Array.from(mapping.values()).filter(
    (element) => element[reference] == null,
  );
};
