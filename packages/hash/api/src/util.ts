import { JSONObject } from "blockprotocol";
import { Uuid4 } from "id128";
import { uniq } from "lodash";
import { CreateEntityArgs } from "./model";
import { isSystemType } from "./types/entityTypes";

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
 * Builds the argument object for the createEntity function. It checks that exactly
 * one of entityTypeId, entityTypeVersionId or systemTypeName is set, and returns
 * the correct variant of CreateEntityArgs.
 */
export const createEntityArgsBuilder = (params: {
  accountId: string;
  createdByAccountId: string;
  properties: JSONObject;
  versioned: boolean;
  entityTypeId?: string | null;
  entityTypeVersionId?: string | null;
  entityId?: string;
  entityVersionId?: string;
  systemTypeName?: string | null;
}): CreateEntityArgs => {
  if (
    !exactlyOne(
      params.entityTypeId,
      params.entityTypeVersionId,
      params.systemTypeName,
    )
  ) {
    throw new Error(
      "exactly one of entityTypeId, entityTypeVersionId or systemTypeName must be provided",
    );
  }

  let args: CreateEntityArgs;
  const _args = {
    accountId: params.accountId,
    createdByAccountId: params.createdByAccountId,
    versioned: params.versioned,
    properties: params.properties,
  };
  if (params.entityTypeId) {
    args = { ..._args, entityTypeId: params.entityTypeId };
  } else if (params.entityTypeVersionId) {
    args = { ..._args, entityTypeVersionId: params.entityTypeVersionId };
  } else if (params.systemTypeName) {
    if (!isSystemType(params.systemTypeName)) {
      throw new Error(`Invalid systemTypeName "${params.systemTypeName}"`);
    }
    args = { ..._args, systemTypeName: params.systemTypeName };
  } else {
    throw new Error("unreachable");
  }
  if (params.entityId) {
    args.entityId = params.entityId;
  }
  if (params.entityVersionId) {
    args.entityVersionId = params.entityVersionId;
  }

  return args;
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

/**
 * @todo this assumption of the slug might be brittle,
 */
export const capitalizeComponentName = (cId: string) => {
  let componentId = cId;

  // If there's a trailing slash, remove it
  const indexLastSlash = componentId.lastIndexOf("/");
  if (indexLastSlash === componentId.length - 1) {
    componentId = componentId.slice(0, -1);
  }

  //                      *
  // "https://example.org/value"
  const indexAfterLastSlash = componentId.lastIndexOf("/") + 1;
  return (
    //                      * and uppercase it
    // "https://example.org/value"
    componentId.charAt(indexAfterLastSlash).toUpperCase() +
    //                       ****
    // "https://example.org/value"
    componentId.substring(indexAfterLastSlash + 1)
  );
};

/**
 * Given a tree structure that has links, flatten into an array with indices pointing to parent.
 * Note, this _will_ behave badly with circular structures!
 * This uses BFS.
 * @param graph The graph structure containing `key` for links
 * @param outerKey The key that allows recursive sub-graphs.
 * @param innerKey The key on the object, that contains metadata about the node, which contains the outer type.
 * @param depthLimit The maximum depth a tree may have before bailing.
 * @returns A flattened list of all nodes with an index referring to where in the list the parent is. parentIndex = -1 means root.
 */
export const linkedTreeFlatten = <
  // Example: type Entity = { name: string; linkedGraphs?: LinkedEntity[]; };
  Outer extends { [_ in K]?: Inner[] | null },
  // Example: type LinkedEntity = { entity: Entity; };
  Inner extends { [_ in K2]: Outer },
  // Given example above: "linkedGraphs"
  K extends string,
  // Given example above: "entity"
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
  // The return value will be a list of the Outer type optionally augmented with metadata and a parentid
  type ResultWithMeta = Omit<AugmentedOuter, K | "currentIndex">;

  const queue: AugmentedOuter[][] = [
    [{ parentIndex: -1, currentIndex: 0, ...graph }],
  ];
  const result: ResultWithMeta[] = [];

  let index = 1;
  let depth = 0;

  // BFS traversal using FIFO queue
  while (queue.length !== 0) {
    let currentIndex = index;

    const toInsert = queue.shift();
    if (!toInsert) {
      continue;
    }

    // Add current nodes to result array
    result.push(
      ...toInsert.map((entry) => {
        const { [outerKey]: _1, currentIndex: _2, ...values } = entry;
        return values;
      }),
    );

    depth++;
    // Traverse direct descendants of all nodes in the current depth
    const descendantsToQueue = toInsert.reduce((acc, current) => {
      const outer = current[outerKey];
      if (outer) {
        const extractedFromInner = outer.map((entry) => {
          // The direct descendants' structures get flattened
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
    // all descendants of all of the nodes in this depth layer
    // added to queue to explore.
    if (descendantsToQueue.length > 0) {
      queue.push(...descendantsToQueue);
    }

    // To prevent infinite loops, a depth is given to limit traversal.
    if (depth >= depthLimit && queue.length !== 0) {
      throw new Error("Depth limit reached!");
    }
  }

  return result;
};

/**
 * Opposite of linkedTreeFlatten
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
  // eslint-disable-next-line no-console
  console.log(elements);
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

    if (existingParent[recursive]) {
      existingParent[recursive].push(current);
    } else {
      (existingParent[recursive] as Element[]) = [current];
    }
  }

  return [...mapping.values()].filter((element) => element[reference] == null);
};
