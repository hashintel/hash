import { Uuid4 } from "id128";

export {
  DefaultMap,
  topologicalSort,
  treeFromParentReferences,
} from "@local/hash-isomorphic-utils/util";

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
