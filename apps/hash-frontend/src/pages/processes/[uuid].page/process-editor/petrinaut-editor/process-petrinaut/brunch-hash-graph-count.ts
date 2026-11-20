/**
 * Brunch's HASH count by links: a count with `where` or `groupBy`, which the
 * graph's filter can't express (a `not` over a link path compiles to a join
 * and overcounts), so the page reads the counted entities and the links it
 * follows page by page and joins them itself.
 *
 * Plain functions in order: what to read (`hashEntityJoinCountPlan`), how
 * much that is (`HashJoinGraph.size`, checked against the budget before any
 * page is read), the paged reads (`readAllPages`), the join, pure
 * (`hashEntityJoinCount`), and the result (`runHashEntityJoinCount`). The
 * graph is reached only through `HashJoinGraph`, which the page binds to its
 * queries and the tests fake.
 */

import {
  type HashEntityCountInput,
  type HashEntityCountJoinResult,
  type HashEntityCountStep,
  hashEntityCountMaxExamples,
  hashEntityCountMaxGroups,
  hashEntityCountMaxJoinEntities,
} from "@hashintel/brunch-agent";

/** An entity as the join needs it: its id, label and, for a link, its ends. */
export type HashJoinEntity = {
  readonly entityId: string;
  readonly label?: string;
  readonly external?: true;
  readonly linkData?: {
    readonly leftEntityId: string;
    readonly rightEntityId: string;
  };
};

/** Which entities one paged read matches, in the count's web scope. */
export type HashJoinSelector =
  | {
      readonly entityTypes: readonly string[];
      readonly propertyEquals?: HashEntityCountInput["propertyEquals"];
    }
  | { readonly entityIds: readonly string[] };

/**
 * The graph as a count by links reaches it, in the count's web scope, as the
 * signed-in user, with no drafts, archived entities or traversal. A failed
 * call throws.
 */
export type HashJoinGraph = {
  /** How many entities a read by types would match: one exact count. */
  readonly size: (
    selector: Extract<HashJoinSelector, { entityTypes: readonly string[] }>,
    signal: AbortSignal,
  ) => Promise<number>;
  /**
   * One page of at most `limit` matches, from `cursor` (one an earlier page
   * gave) or the first; a `cursor` back means more may match.
   */
  readonly page: (
    selector: HashJoinSelector,
    limit: number,
    cursor: string | undefined,
    signal: AbortSignal,
  ) => Promise<{
    readonly entities: readonly HashJoinEntity[];
    readonly cursor?: string;
  }>;
};

/** The most entities one internal page holds: the graph's default limit. */
export const hashJoinPageSize = 1000;

type JoinInput = Pick<HashEntityCountInput, "where" | "groupBy">;

type JoinRead = HashEntityCountJoinResult["reads"][number];

type CountedResult = Extract<HashEntityCountJoinResult, { outcome: "counted" }>;

/**
 * What a count by links reads: the counted types, filtered by
 * `propertyEquals`, and every link of each distinct type its steps follow,
 * once each, whichever steps share it.
 */
export const hashEntityJoinCountPlan = (
  input: HashEntityCountInput & { entityTypes: readonly string[] },
) => ({
  counted: {
    entityTypes: input.entityTypes,
    ...(input.propertyEquals === undefined
      ? {}
      : { propertyEquals: input.propertyEquals }),
  },
  linkTypes: [
    ...new Set(
      [
        ...(input.where?.path ?? []),
        ...(input.groupBy ? [input.groupBy] : []),
      ].map(({ linkType }) => linkType),
    ),
  ],
});

/** For each entity id, the ids one step of `links` reaches from it. */
const stepIndex = (links: readonly HashJoinEntity[]) => {
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const { linkData } of links) {
    if (linkData === undefined) {
      continue;
    }
    const { leftEntityId: left, rightEntityId: right } = linkData;
    outgoing.set(left, [...(outgoing.get(left) ?? []), right]);
    incoming.set(right, [...(incoming.get(right) ?? []), left]);
  }
  return { outgoing, incoming };
};

/**
 * The join, pure: the counted entities that qualify under `where`, a few of
 * them as examples, and with `groupBy` their count under each entity one step
 * away (`null` for those linked to none). A step follows `linkData` literally:
 * outgoing from a link's left entity to its right, incoming from its right to
 * its left. A link reaches its other end whether or not that entity was read:
 * the link's existence is what `exists` tests.
 */
export const hashEntityJoinCount = (
  { where, groupBy }: JoinInput,
  counted: readonly HashJoinEntity[],
  linksByType: ReadonlyMap<string, readonly HashJoinEntity[]>,
) => {
  const indexes = new Map(
    [...linksByType].map(([linkType, links]) => [linkType, stepIndex(links)]),
  );
  const follow = (from: readonly string[], step: HashEntityCountStep) => {
    const ends = indexes.get(step.linkType)?.[step.direction];
    return [...new Set(from.flatMap((id) => ends?.get(id) ?? []))];
  };
  const qualifying = counted.filter((entity) => {
    if (where === undefined) {
      return true;
    }
    const reached = where.path.reduce<string[]>(
      (ids, step) => follow(ids, step),
      [entity.entityId],
    );
    return reached.length > 0 === where.exists;
  });
  let groups: Map<string | null, number> | undefined;
  if (groupBy !== undefined) {
    groups = new Map();
    for (const entity of qualifying) {
      const ends = follow([entity.entityId], groupBy);
      for (const end of ends.length === 0 ? [null] : ends) {
        groups.set(end, (groups.get(end) ?? 0) + 1);
      }
    }
  }
  return {
    ofType: counted.length,
    count: qualifying.length,
    examples: qualifying.slice(0, hashEntityCountMaxExamples),
    groups,
  };
};

/**
 * The page budget shared by a count's reads: each page reserves what it may
 * hold, up to what is left of `hashEntityCountMaxJoinEntities`, and gives back
 * what it didn't use, so the reads together never read past it.
 */
const joinBudget = () => {
  let reserved = 0;
  return {
    reserve: (wanted: number) => {
      const granted = Math.max(
        0,
        Math.min(wanted, hashEntityCountMaxJoinEntities - reserved),
      );
      reserved += granted;
      return granted;
    },
    release: (unused: number) => {
      reserved -= unused;
    },
  };
};

type JoinBudget = ReturnType<typeof joinBudget>;

/** Why a read stopped before its last page. */
type ReadStop = { readonly reason: string };

const entityCount = (count: number) =>
  `${count.toLocaleString("en-US")} ${count === 1 ? "entity" : "entities"}`;

/** How a read is named in a reason: its role and types. */
const readName = ({ role, entityTypes }: Omit<JoinRead, "entities">) =>
  role === "counted"
    ? `the ${entityTypes.join(", ")} entities`
    : role === "link"
      ? `the ${entityTypes.join(", ")} links`
      : "the grouped entities";

/**
 * Every page of one read, until a page gives no cursor, each holding what the
 * budget grants. It stops at a failed page or once the budget is spent with
 * more to read, saying why; `onPage` counts each request made.
 */
const readAllPages = async ({
  graph,
  selector,
  name,
  budget,
  stopped,
  onPage,
  signal,
}: {
  graph: HashJoinGraph;
  selector: HashJoinSelector;
  name: Omit<JoinRead, "entities">;
  budget: JoinBudget;
  /** Whether another read has stopped, so this one need read no further. */
  stopped: () => boolean;
  onPage: () => void;
  signal: AbortSignal;
}): Promise<
  | { readonly entities: HashJoinEntity[] }
  | (ReadStop & { readonly entities: HashJoinEntity[] })
> => {
  const read = new Map<string, HashJoinEntity>();
  let cursor: string | undefined;
  for (let page = 1; ; page++) {
    if (stopped()) {
      return {
        reason: "another read stopped first",
        entities: [...read.values()],
      };
    }
    const limit = budget.reserve(hashJoinPageSize);
    if (limit === 0) {
      return {
        reason: `${readName(name)} would have read past the ${entityCount(hashEntityCountMaxJoinEntities)} one count may read: HASH holds more than it did when the count began`,
        entities: [...read.values()],
      };
    }
    let result: Awaited<ReturnType<HashJoinGraph["page"]>>;
    try {
      onPage();
      result = await graph.page(selector, limit, cursor, signal);
    } catch (error) {
      budget.release(limit);
      if (signal.aborted) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : "The HASH query failed.";
      return {
        reason: `reading ${readName(name)} failed on page ${page}: ${message}`,
        entities: [...read.values()],
      };
    }
    budget.release(limit - Math.min(limit, result.entities.length));
    for (const entity of result.entities) {
      read.set(entity.entityId, entity);
    }
    if (result.cursor === undefined) {
      return { entities: [...read.values()] };
    }
    cursor = result.cursor;
  }
};

/** An entity as a count by links names it. */
const entityRef = ({ entityId, label, external }: HashJoinEntity) => ({
  entityId,
  ...(label === undefined ? {} : { label }),
  ...(external === undefined ? {} : { external }),
});

type CountedGroup = NonNullable<CountedResult["groups"]>[number];

/** Larger groups first; groups of one size by label, then id, with (none) last. */
const groupOrder = (left: CountedGroup, right: CountedGroup) => {
  if (left.count !== right.count) {
    return right.count - left.count;
  }
  if (left.entity === undefined || right.entity === undefined) {
    return (
      Number(left.entity === undefined) - Number(right.entity === undefined)
    );
  }
  return (
    (left.entity.label ?? "").localeCompare(right.entity.label ?? "") ||
    left.entity.entityId.localeCompare(right.entity.entityId)
  );
};

/**
 * Brunch's count by links, run in the page: it plans what to read, counts it
 * in parallel, and refuses before reading when that exceeds
 * `hashEntityCountMaxJoinEntities`; else reads every page of the counted
 * types and each link type in parallel, joins them, and with `groupBy` reads
 * the grouped entities it has no label for, by id. A failed page, or the
 * budget spent part-way, settles `incomplete` with no count. A failed size
 * count throws, as the plain count's failure does; a cancelled call rejects.
 */
export const runHashEntityJoinCount = async (
  input: HashEntityCountInput & { entityTypes: readonly string[] },
  webScope: "default" | "named",
  graph: HashJoinGraph,
  signal: AbortSignal,
): Promise<HashEntityCountJoinResult> => {
  const plan = hashEntityJoinCountPlan(input);
  const countedName = {
    role: "counted" as const,
    entityTypes: [...plan.counted.entityTypes],
  };
  const linkNames = plan.linkTypes.map((linkType) => ({
    role: "link" as const,
    entityTypes: [linkType],
  }));
  let requests = 0;

  const sizes = await Promise.all([
    graph.size(plan.counted, signal),
    ...plan.linkTypes.map((linkType) =>
      graph.size({ entityTypes: [linkType] }, signal),
    ),
  ]);
  requests += sizes.length;
  const toRead = [countedName, ...linkNames].map((name, index) => ({
    ...name,
    entities: sizes[index] ?? 0,
  }));
  if (
    toRead.reduce((sum, { entities }) => sum + entities, 0) >
    hashEntityCountMaxJoinEntities
  ) {
    return { outcome: "refused", webScope, reads: toRead, requests };
  }

  const budget = joinBudget();
  let stop: ReadStop | undefined;
  // Read through a call: the reads set `stop` while this function awaits them.
  const stopped = (): ReadStop | undefined => stop;
  const readAll = async (
    selector: HashJoinSelector,
    name: Omit<JoinRead, "entities">,
  ) => {
    const read = await readAllPages({
      graph,
      selector,
      name,
      budget,
      stopped: () => stopped() !== undefined,
      onPage: () => {
        requests += 1;
      },
      signal,
    });
    if ("reason" in read && stop === undefined) {
      stop = read;
    }
    return { ...name, read: read.entities };
  };
  const [counted, ...links] = await Promise.all([
    readAll(plan.counted, countedName),
    ...plan.linkTypes.map((linkType, index) =>
      readAll({ entityTypes: [linkType] }, linkNames[index]!),
    ),
  ]);
  const reads: JoinRead[] = [counted, ...links].map(
    ({ role, entityTypes, read }) => ({
      role,
      entityTypes,
      entities: read.length,
    }),
  );
  const incomplete = (reason: string): HashEntityCountJoinResult => ({
    outcome: "incomplete",
    webScope,
    reason: `${reason.charAt(0).toUpperCase()}${reason.slice(1)}${/[.!?]$/u.test(reason) ? "" : "."}`,
    reads,
    requests,
  });
  const readStop = stopped();
  if (readStop !== undefined) {
    return incomplete(readStop.reason);
  }

  const joined = hashEntityJoinCount(
    input,
    counted.read,
    new Map(
      links.flatMap(({ entityTypes, read }) =>
        entityTypes.map((linkType) => [linkType, read] as const),
      ),
    ),
  );

  let groups: CountedResult["groups"];
  let otherGroups: CountedResult["otherGroups"];
  if (joined.groups !== undefined) {
    // Labels come from entities already read where they can, else one read by id.
    const known = new Map(
      [counted, ...links].flatMap(({ read }) =>
        read.map((entity) => [entity.entityId, entity] as const),
      ),
    );
    const unlabelled = [...joined.groups.keys()].filter(
      (id): id is string => id !== null && !known.has(id),
    );
    if (unlabelled.length > 0) {
      const chunks: string[][] = [];
      for (
        let start = 0;
        start < unlabelled.length;
        start += hashJoinPageSize
      ) {
        chunks.push(unlabelled.slice(start, start + hashJoinPageSize));
      }
      const groupedName = { role: "grouped" as const, entityTypes: [] };
      const grouped = await Promise.all(
        chunks.map((entityIds) => readAll({ entityIds }, groupedName)),
      );
      const groupedEntities = grouped.flatMap(({ read }) => read);
      reads.push({ ...groupedName, entities: groupedEntities.length });
      const groupedStop = stopped();
      if (groupedStop !== undefined) {
        return incomplete(groupedStop.reason);
      }
      for (const entity of groupedEntities) {
        known.set(entity.entityId, entity);
      }
    }
    const all = [...joined.groups]
      .map(([id, count]) => {
        if (id === null) {
          return { count };
        }
        const entity = known.get(id);
        return entity === undefined
          ? { entity: { entityId: id }, unread: true as const, count }
          : { entity: entityRef(entity), count };
      })
      .sort(groupOrder);
    groups = all.slice(0, hashEntityCountMaxGroups);
    const rest = all.slice(hashEntityCountMaxGroups);
    if (rest.length > 0) {
      otherGroups = {
        groups: rest.length,
        count: rest.reduce((sum, { count }) => sum + count, 0),
      };
    }
  }

  return {
    outcome: "counted",
    webScope,
    ofType: joined.ofType,
    count: joined.count,
    ...(groups === undefined ? {} : { groups }),
    ...(otherGroups === undefined ? {} : { otherGroups }),
    examples: joined.examples.map(entityRef),
    reads,
    requests,
  };
};
