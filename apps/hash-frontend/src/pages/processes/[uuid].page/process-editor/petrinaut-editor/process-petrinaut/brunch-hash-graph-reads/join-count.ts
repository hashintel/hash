/**
 * Brunch's HASH count by links: a count with `where` or `groupBy`, which the
 * graph's filter can't express (a `not` over a link path compiles to a join
 * and overcounts), so the page reads the counted entities and the links it
 * follows page by page and joins them itself.
 *
 * Plain functions in order: what to read (`hashEntityJoinCountPlan`), how
 * much that is (`HashJoinGraph.size`, checked against the effective
 * `maxJoinEntities` limit before any page is read), the paged reads
 * (`readAllPages`), the join, pure (`hashEntityJoinCount`), and the result
 * (`runHashEntityJoinCount`). The graph is reached only through
 * `HashJoinGraph`, which the page binds to its queries and the tests fake.
 */

import {
  type HashEntityCountInput,
  type HashEntityCountJoinResult,
  type HashEntityCountStep,
  type HashEntityReadResult,
  type HashWebScope,
  hashEntityCountDefaultExamples,
  hashEntityCountDefaultGroups,
  hashEntityCountDefaultJoinEntities,
  hashEntityCountGroupByPath,
  hashEntityCountWhereConditions,
  hashEntityReadMaxLimit,
} from "@hashintel/brunch-agent";

/** An entity as the join needs it: projected from the canonical read entity. */
export type HashJoinEntity = Pick<
  HashEntityReadResult["entities"][number],
  "entityId" | "label" | "external" | "linkData"
>;

/**
 * Anchors a step-0 link read to the counted entity types at the link's
 * starting endpoint (`leftEntity` for outgoing, `rightEntity` for incoming).
 */
export type HashJoinEndpointAnchor = {
  readonly endpoint: "leftEntity" | "rightEntity";
  readonly entityTypes: readonly string[];
};

/**
 * Which entities one paged read matches: by optional types/properties/anchor
 * in the count's web scope, or by ids in whichever web each id names.
 */
export type HashJoinSelector =
  | {
      readonly entityTypes?: readonly string[];
      readonly propertyEquals?: HashEntityCountInput["propertyEquals"];
      readonly endpointAnchor?: HashJoinEndpointAnchor;
    }
  | { readonly entityIds: readonly string[] };

export type HashJoinTypeSelector = Exclude<
  HashJoinSelector,
  { readonly entityIds: readonly string[] }
>;

/**
 * The graph as a count by links reaches it, as the signed-in user, honoring
 * the count's `includeDrafts`/`includeArchived` flags with no traversal; a
 * non-id read stays in the count's web scope. Cursor is opaque to the join.
 */
export type HashJoinGraph<Cursor = unknown> = {
  /** How many entities a non-id read would match: one exact count. */
  readonly size: (
    selector: HashJoinTypeSelector,
    signal: AbortSignal,
  ) => Promise<number>;
  /**
   * One page of at most `limit` matches, from `cursor` (one an earlier page
   * gave) or the first; a `cursor` back means more may match.
   */
  readonly page: (
    selector: HashJoinSelector,
    limit: number,
    cursor: Cursor | undefined,
    signal: AbortSignal,
  ) => Promise<{
    readonly entities: readonly HashJoinEntity[];
    readonly cursor?: Cursor;
  }>;
};

type JoinInput = Pick<
  HashEntityCountInput,
  "where" | "groupBy" | "maxExamples"
>;

type JoinRead = HashEntityCountJoinResult["reads"][number];

type CountedResult = Extract<HashEntityCountJoinResult, { outcome: "counted" }>;

/**
 * What a count by links reads: the counted selector (optionally narrowed by
 * `entityTypes` and `propertyEquals`) and each distinct link type followed by
 * `where` or `groupBy`. A link type is anchored to the counted `entityTypes`
 * only when every step using it sits at step 0 in a single direction, so
 * multi-hop or bidirectional link reads never miss deeper hops.
 */
export const hashEntityJoinCountPlan = (input: HashEntityCountInput) => {
  const stepPaths: readonly (readonly HashEntityCountStep[])[] = [
    ...hashEntityCountWhereConditions(input.where).map(({ path }) => path),
    ...(input.groupBy === undefined
      ? []
      : [hashEntityCountGroupByPath(input.groupBy)]),
  ];

  // Track where and in which directions each distinct linkType is used.
  const linkUsage = new Map<
    string,
    { onlyStepZero: boolean; directions: Set<HashEntityCountStep["direction"]> }
  >();
  for (const path of stepPaths) {
    for (let stepIndex = 0; stepIndex < path.length; stepIndex++) {
      const step = path[stepIndex];
      if (step === undefined) {
        continue;
      }
      const existing = linkUsage.get(step.linkType);
      if (existing === undefined) {
        linkUsage.set(step.linkType, {
          onlyStepZero: stepIndex === 0,
          directions: new Set([step.direction]),
        });
      } else {
        if (stepIndex !== 0) {
          existing.onlyStepZero = false;
        }
        existing.directions.add(step.direction);
      }
    }
  }

  const countedTypes = input.entityTypes;
  const links = [...linkUsage.entries()].map(([linkType, usage]) => {
    let endpointAnchor: HashJoinEndpointAnchor | undefined;
    if (
      countedTypes !== undefined &&
      usage.onlyStepZero &&
      usage.directions.size === 1
    ) {
      const [direction] = usage.directions;
      endpointAnchor = {
        endpoint: direction === "outgoing" ? "leftEntity" : "rightEntity",
        entityTypes: countedTypes,
      };
    }
    return {
      linkType,
      ...(endpointAnchor === undefined ? {} : { endpointAnchor }),
    };
  });

  return {
    counted: {
      ...(countedTypes === undefined ? {} : { entityTypes: countedTypes }),
      ...(input.propertyEquals === undefined
        ? {}
        : { propertyEquals: input.propertyEquals }),
    } satisfies HashJoinTypeSelector,
    links,
  };
};

/** For each entity id, the ids one step of `links` reaches from it. */
const stepIndex = (links: readonly HashJoinEntity[]) => {
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const { linkData } of links) {
    if (linkData === undefined) {
      continue;
    }
    const { leftEntityId: left, rightEntityId: right } = linkData;
    const ends = outgoing.get(left);
    if (ends === undefined) {
      outgoing.set(left, [right]);
    } else {
      ends.push(right);
    }
    const starts = incoming.get(right);
    if (starts === undefined) {
      incoming.set(right, [left]);
    } else {
      starts.push(left);
    }
  }
  return { outgoing, incoming };
};

/**
 * The join, pure: the counted entities that qualify under every `where`
 * condition, up to `maxExamples` of them as examples, and with `groupBy` their
 * count under each entity reached along the `groupBy` path (`null` for those
 * reaching none). A step follows `linkData` literally: outgoing from left to
 * right, incoming from right to left. A link reaches its other end whether or
 * not that entity was read: the link's existence is what `exists` tests.
 */
export const hashEntityJoinCount = (
  { where, groupBy, maxExamples }: JoinInput,
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
  const conditions = hashEntityCountWhereConditions(where);
  const qualifying = counted.filter((entity) =>
    conditions.every((condition) => {
      const reached = condition.path.reduce<string[]>(
        (ids, step) => follow(ids, step),
        [entity.entityId],
      );
      return reached.length > 0 === condition.exists;
    }),
  );
  let groups: Map<string | null, number> | undefined;
  const groupSteps = hashEntityCountGroupByPath(groupBy);
  if (groupSteps.length > 0) {
    groups = new Map();
    for (const entity of qualifying) {
      const ends = groupSteps.reduce<string[]>(
        (ids, step) => follow(ids, step),
        [entity.entityId],
      );
      for (const end of ends.length === 0 ? [null] : ends) {
        groups.set(end, (groups.get(end) ?? 0) + 1);
      }
    }
  }
  const exampleLimit = maxExamples ?? hashEntityCountDefaultExamples;
  return {
    ofType: counted.length,
    count: qualifying.length,
    examples: qualifying.slice(0, exampleLimit),
    groups,
  };
};

/**
 * Tracks entities read across counted and link pages against `limit`. Sizes
 * are checked before any page is read, so the total passes `limit` only if
 * HASH grew during the count, stopping each read within one page past.
 */
const joinBudget = (limit: number) => {
  let read = 0;
  return {
    limit,
    /** Adds a page's entities; whether the reads are now past `limit`. */
    add: (entities: number) => {
      read += entities;
      return read > limit;
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
    ? entityTypes.length === 0
      ? "all entities"
      : `the ${entityTypes.join(", ")} entities`
    : role === "link"
      ? `the ${entityTypes.join(", ")} links`
      : "the grouped entities";

const ensureSentence = (text: string) =>
  /[.!?]$/u.test(text) ? text : `${text}.`;

/**
 * Every page of one read, until a page gives no cursor. Stops at a failed
 * page, when another parallel read has already stopped, or once `budget` (when
 * provided) is exceeded.
 */
const readAllPages = async <Cursor>({
  graph,
  selector,
  name,
  budget,
  stopped,
  onPage,
  signal,
}: {
  graph: HashJoinGraph<Cursor>;
  selector: HashJoinSelector;
  name: Omit<JoinRead, "entities">;
  budget?: JoinBudget;
  /** Whether another read has stopped, so this one need read no further. */
  stopped: () => boolean;
  onPage: () => void;
  signal: AbortSignal;
}): Promise<
  | { readonly entities: HashJoinEntity[] }
  | (ReadStop & { readonly entities: HashJoinEntity[] })
> => {
  const read = new Map<string, HashJoinEntity>();
  let cursor: Cursor | undefined;
  for (let page = 1; ; page++) {
    if (stopped()) {
      return { entities: [...read.values()] };
    }
    let result: Awaited<ReturnType<HashJoinGraph<Cursor>["page"]>>;
    try {
      onPage();
      result = await graph.page(
        selector,
        hashEntityReadMaxLimit,
        cursor,
        signal,
      );
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : "The HASH query failed.";
      return {
        reason: ensureSentence(
          `Reading ${readName(name)} failed on page ${page}: ${message}`,
        ),
        entities: [...read.values()],
      };
    }
    for (const entity of result.entities) {
      read.set(entity.entityId, entity);
    }
    if (budget !== undefined && budget.add(result.entities.length)) {
      return {
        reason: `Reading ${readName(name)} took the reads past the ${entityCount(budget.limit)} limit: HASH holds more than it did when the count began.`,
        entities: [...read.values()],
      };
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

/**
 * Deterministic pre-label group ranking: largest count first, `(none)` last,
 * equal-count ties broken by `entityId`. Slicing top `maxGroups` on this order
 * bounds label lookups to at most `maxGroups` (<= 500) IDs in one graph page.
 */
const rawGroupOrder = (
  [leftId, leftCount]: readonly [string | null, number],
  [rightId, rightCount]: readonly [string | null, number],
) => {
  if (leftCount !== rightCount) {
    return rightCount - leftCount;
  }
  if (leftId === null || rightId === null) {
    return Number(leftId === null) - Number(rightId === null);
  }
  return leftId.localeCompare(rightId);
};

type CountedGroup = NonNullable<CountedResult["groups"]>[number];

/** Display order for the top-N labelled groups: count DESC, label ASC, id ASC, `(none)` last. */
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
 * Brunch's count by links, run in the page: it plans what to read, counts the
 * counted and link entities in parallel, and refuses before reading when that
 * exceeds `maxJoinEntities` (default 20,000); else reads every page in
 * parallel, joins them, and with `groupBy` slices to the top `maxGroups`
 * (default 25, max 500) before reading labels for those displayed groups only.
 * A failed page, or the budget spent part-way, settles `incomplete` with no
 * count. A failed size count throws; a cancelled call rejects.
 */
export const runHashEntityJoinCount = async <Cursor>(
  input: HashEntityCountInput,
  webScope: HashWebScope,
  graph: HashJoinGraph<Cursor>,
  signal: AbortSignal,
): Promise<HashEntityCountJoinResult> => {
  const maxJoinEntities =
    input.maxJoinEntities ?? hashEntityCountDefaultJoinEntities;
  const maxGroups = input.maxGroups ?? hashEntityCountDefaultGroups;

  const plan = hashEntityJoinCountPlan(input);
  const countedName = {
    role: "counted" as const,
    entityTypes: [...(plan.counted.entityTypes ?? [])],
  };
  const linkPlans = plan.links.map(({ linkType, endpointAnchor }) => ({
    name: {
      role: "link" as const,
      entityTypes: [linkType],
    },
    selector: {
      entityTypes: [linkType],
      ...(endpointAnchor === undefined ? {} : { endpointAnchor }),
    } satisfies HashJoinTypeSelector,
  }));
  let requests = 0;

  const sizes = await Promise.all([
    graph.size(plan.counted, signal),
    ...linkPlans.map(({ selector }) => graph.size(selector, signal)),
  ]);
  requests += sizes.length;
  const toRead = [countedName, ...linkPlans.map(({ name }) => name)].map(
    (name, index) => ({
      ...name,
      entities: sizes[index] ?? 0,
    }),
  );
  if (
    toRead.reduce((sum, { entities }) => sum + entities, 0) > maxJoinEntities
  ) {
    return { outcome: "refused", reads: toRead, requests };
  }

  const budget = joinBudget(maxJoinEntities);
  let stop: ReadStop | undefined;
  // Read through a call: the reads set `stop` while this function awaits them.
  const stopped = (): ReadStop | undefined => stop;
  const readAll = async (
    selector: HashJoinSelector,
    name: Omit<JoinRead, "entities">,
    readBudget?: JoinBudget,
  ) => {
    const read = await readAllPages({
      graph,
      selector,
      name,
      budget: readBudget,
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
    readAll(plan.counted, countedName, budget),
    ...linkPlans.map(({ selector, name }) => readAll(selector, name, budget)),
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
    reason,
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
    const sorted = [...joined.groups.entries()].sort(rawGroupOrder);
    const top = sorted.slice(0, maxGroups);
    const rest = sorted.slice(maxGroups);
    if (rest.length > 0) {
      otherGroups = {
        groups: rest.length,
        count: rest.reduce((sum, [, count]) => sum + count, 0),
      };
    }

    // Labels come from entities already read where they can, else one id lookup
    // for the <= maxGroups (<= 500) unlabelled displayed groups only.
    const known = new Map(
      [counted, ...links].flatMap(({ read }) =>
        read.map((entity) => [entity.entityId, entity] as const),
      ),
    );
    const unlabelled = top.flatMap(([id]) =>
      id !== null && !known.has(id) ? [id] : [],
    );
    if (unlabelled.length > 0) {
      const groupedName = { role: "grouped" as const, entityTypes: [] };
      const grouped = await readAll({ entityIds: unlabelled }, groupedName);
      reads.push({ ...groupedName, entities: grouped.read.length });
      const groupedStop = stopped();
      if (groupedStop !== undefined) {
        return incomplete(groupedStop.reason);
      }
      for (const entity of grouped.read) {
        known.set(entity.entityId, entity);
      }
    }
    groups = top
      .map(([id, count]): CountedGroup => {
        if (id === null) {
          return { count };
        }
        const entity = known.get(id);
        return entity === undefined
          ? { entity: { entityId: id }, unread: true as const, count }
          : { entity: entityRef(entity), count };
      })
      .sort(groupOrder);
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
