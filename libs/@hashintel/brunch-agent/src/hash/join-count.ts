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
  hashEntityCountMaxJoinLinkTypes,
  hashEntityCountMaxJoinRequests,
  hashEntityCountWhereConditions,
  hashEntityReadMaxLimit,
} from "./graph-reads";

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

/**
 * The entity an id names, whichever edition: a HASH entity id is
 * `webId~entityUuid`, or `webId~entityUuid~draftId` for a draft edition, and
 * links name the entity by its live id. Any other id is returned as is.
 */
const baseEntityId = (entityId: string) => {
  const parts = entityId.split("~");
  return parts.length === 3 ? `${parts[0]}~${parts[1]}` : entityId;
};

const isDraftEdition = (entityId: string) =>
  baseEntityId(entityId) !== entityId;

/**
 * One edition per entity, in first-seen order: with `includeDrafts`, an
 * entity can be read as its live edition and one or more drafts. A draft is
 * preferred over the live edition, and among drafts the least id, so an entity
 * counts once and shows as its draft.
 */
const dedupeByBaseEntityId = (
  entities: readonly HashJoinEntity[],
): HashJoinEntity[] => {
  const byBase = new Map<string, HashJoinEntity>();
  for (const entity of entities) {
    const base = baseEntityId(entity.entityId);
    const kept = byBase.get(base);
    if (
      kept === undefined ||
      (isDraftEdition(entity.entityId) &&
        (!isDraftEdition(kept.entityId) || entity.entityId < kept.entityId))
    ) {
      byBase.set(base, entity);
    }
  }
  return [...byBase.values()];
};

/**
 * For each entity, by `baseEntityId`, the entities one step of `links` reaches
 * from it, also by `baseEntityId`, so editions join as one entity.
 */
const stepIndex = (links: readonly HashJoinEntity[]) => {
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const { linkData } of dedupeByBaseEntityId(links)) {
    if (linkData === undefined) {
      continue;
    }
    const left = baseEntityId(linkData.leftEntityId);
    const right = baseEntityId(linkData.rightEntityId);
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

type StepIndex = ReturnType<typeof stepIndex>;

/**
 * Maximum expansion steps allowed while grouping across multi-hop links before
 * settling `incomplete` instead of stalling the editor's main thread. All
 * `where` conditions, 1-step `groupBy`, and hub graphs with single-node
 * intermediate frontiers run in linear time and stay far below this cap.
 */
export const hashEntityCountMaxGroupExpansionSteps = 2_000_000;

/**
 * Exact set of entity IDs from which `path` reaches at least one entity,
 * computed by backward reachability from the final step to step 0 in
 * O(sum(|V| + |E|)) time — avoiding O(N*M) hub blow-ups.
 */
const reachableSourcesForPath = (
  path: readonly HashEntityCountStep[],
  indexes: ReadonlyMap<string, StepIndex>,
): ReadonlySet<string> => {
  const lastStep = path.at(-1);
  if (lastStep === undefined) {
    return new Set();
  }
  const lastEdges = indexes.get(lastStep.linkType)?.[lastStep.direction];
  let reachable = new Set<string>(
    lastEdges === undefined ? [] : lastEdges.keys(),
  );
  for (
    let hopIndex = path.length - 2;
    hopIndex >= 0 && reachable.size > 0;
    hopIndex--
  ) {
    const step = path[hopIndex];
    if (step === undefined) {
      continue;
    }
    const reverseDirection =
      step.direction === "outgoing" ? "incoming" : "outgoing";
    const reverseEdges = indexes.get(step.linkType)?.[reverseDirection];
    if (reverseEdges === undefined) {
      return new Set();
    }
    const previous = new Set<string>();
    for (const target of reachable) {
      const sources = reverseEdges.get(target);
      if (sources !== undefined) {
        for (const source of sources) {
          previous.add(source);
        }
      }
    }
    reachable = previous;
  }
  return reachable;
};

/** Options controlling CPU work bounds and cancellation for `hashEntityJoinCount`. */
export type HashEntityJoinCountOptions = {
  readonly maxExpansionSteps?: number;
  readonly signal?: AbortSignal;
};

export type HashEntityJoinCountOutcome =
  | {
      readonly ofType: number;
      readonly count: number;
      readonly examples: HashJoinEntity[];
      readonly groups?: Map<string | null, number>;
    }
  | ReadStop;

const abortErrorFrom = (signal: AbortSignal): Error =>
  signal.reason instanceof Error
    ? signal.reason
    : new Error("The HASH count was cancelled.");

/**
 * Groups `qualifying` entities along `groupSteps` using iterative per-step
 * frontier collapse: any entities sharing a single intermediate node at a hop
 * merge their weights so hub graphs expand in O(|Q| + |E|) time, while genuine
 * overlapping multi-branch frontiers stay bounded by `maxExpansionSteps`.
 */
const groupQualifyingByPath = (
  qualifying: readonly HashJoinEntity[],
  groupSteps: readonly HashEntityCountStep[],
  indexes: ReadonlyMap<string, StepIndex>,
  options?: HashEntityJoinCountOptions,
): Map<string | null, number> | ReadStop => {
  const groups = new Map<string | null, number>();
  const stepLimit =
    options?.maxExpansionSteps ?? hashEntityCountMaxGroupExpansionSteps;
  const signal = options?.signal;
  let workSteps = 0;

  const consumeWork = (delta: number): ReadStop | undefined => {
    workSteps += delta;
    if (signal?.aborted) {
      throw abortErrorFrom(signal);
    }
    if (workSteps > stepLimit) {
      return {
        reason: `Grouping across links exceeded the ${stepLimit.toLocaleString("en-US")}-step expansion limit on the page: narrow the counted set, shorten the groupBy path, or group on one hop.`,
      };
    }
    return undefined;
  };

  let singleWeights = new Map<string, number>();
  for (const entity of qualifying) {
    const id = baseEntityId(entity.entityId);
    singleWeights.set(id, (singleWeights.get(id) ?? 0) + 1);
  }
  let multiBranches: {
    readonly frontier: readonly string[];
    readonly weight: number;
  }[] = [];
  let ungroupedCount = 0;

  for (let hopIndex = 0; hopIndex < groupSteps.length; hopIndex++) {
    const step = groupSteps[hopIndex];
    if (step === undefined) {
      continue;
    }
    const endsMap = indexes.get(step.linkType)?.[step.direction];
    const isLast = hopIndex === groupSteps.length - 1;
    const nextSingle = new Map<string, number>();
    const nextMulti: {
      readonly frontier: readonly string[];
      readonly weight: number;
    }[] = [];

    for (const [nodeId, weight] of singleWeights) {
      const raw = endsMap?.get(nodeId);
      if (raw === undefined || raw.length === 0) {
        ungroupedCount += weight;
        continue;
      }
      const stop = consumeWork(raw.length);
      if (stop !== undefined) {
        return stop;
      }
      const unique = raw.length === 1 ? raw : [...new Set(raw)];
      if (isLast) {
        for (const target of unique) {
          groups.set(target, (groups.get(target) ?? 0) + weight);
        }
      } else if (unique.length === 1) {
        const [only] = unique;
        if (only !== undefined) {
          nextSingle.set(only, (nextSingle.get(only) ?? 0) + weight);
        }
      } else {
        nextMulti.push({ frontier: unique, weight });
      }
    }

    for (const { frontier, weight } of multiBranches) {
      const nextSet = new Set<string>();
      for (const nodeId of frontier) {
        const raw = endsMap?.get(nodeId);
        const stop = consumeWork(
          raw === undefined || raw.length === 0 ? 1 : raw.length,
        );
        if (stop !== undefined) {
          return stop;
        }
        if (raw !== undefined) {
          for (const target of raw) {
            nextSet.add(target);
          }
        }
      }
      if (nextSet.size === 0) {
        ungroupedCount += weight;
      } else if (isLast) {
        for (const target of nextSet) {
          groups.set(target, (groups.get(target) ?? 0) + weight);
        }
      } else if (nextSet.size === 1) {
        const [only] = nextSet;
        if (only !== undefined) {
          nextSingle.set(only, (nextSingle.get(only) ?? 0) + weight);
        }
      } else {
        nextMulti.push({ frontier: [...nextSet], weight });
      }
    }

    singleWeights = nextSingle;
    multiBranches = nextMulti;
  }

  if (ungroupedCount > 0) {
    groups.set(null, ungroupedCount);
  }
  return groups;
};

/**
 * The join, pure: the counted entities that qualify under every `where`
 * condition, up to `maxExamples` of them as examples, and with `groupBy` their
 * count under each entity reached along the `groupBy` path (`null` for those
 * reaching none). A step follows `linkData` literally: outgoing from left to
 * right, incoming from right to left. A link reaches its other end whether or
 * not that entity was read: the link's existence is what `exists` tests.
 * Entities and links read in several editions (with `includeDrafts`) count
 * once, as their draft, and match by `baseEntityId`; group keys are base ids.
 * Returns a `ReadStop` if multi-hop grouping exceeds `maxExpansionSteps`.
 */
export const hashEntityJoinCount = (
  { where, groupBy, maxExamples }: JoinInput,
  countedEditions: readonly HashJoinEntity[],
  linksByType: ReadonlyMap<string, readonly HashJoinEntity[]>,
  options?: HashEntityJoinCountOptions,
): HashEntityJoinCountOutcome => {
  if (options?.signal?.aborted) {
    throw abortErrorFrom(options.signal);
  }
  const counted = dedupeByBaseEntityId(countedEditions);
  const indexes = new Map(
    [...linksByType].map(([linkType, links]) => [linkType, stepIndex(links)]),
  );
  const conditions = hashEntityCountWhereConditions(where).map((condition) => ({
    exists: condition.exists,
    reachable: reachableSourcesForPath(condition.path, indexes),
  }));
  const qualifying =
    conditions.length === 0
      ? counted
      : counted.filter((entity) =>
          conditions.every(
            ({ exists, reachable }) =>
              reachable.has(baseEntityId(entity.entityId)) === exists,
          ),
        );

  let groups: Map<string | null, number> | undefined;
  const groupSteps = hashEntityCountGroupByPath(groupBy);
  if (groupSteps.length > 0) {
    const grouped = groupQualifyingByPath(
      qualifying,
      groupSteps,
      indexes,
      options,
    );
    if ("reason" in grouped) {
      return grouped;
    }
    groups = grouped;
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

/** Most graph requests a count by links has in flight at once. */
export const hashEntityCountJoinConcurrency = 4;

/**
 * `run` over each of `items`, at most `limit` at a time, results in order.
 * Workers share one iterator, so each item runs exactly once; on the first
 * rejection, other workers stop pulling further items and `Promise.all` rejects.
 */
const mapWithConcurrency = async <Item, Result>(
  items: readonly Item[],
  limit: number,
  run: (item: Item) => Promise<Result>,
): Promise<Result[]> => {
  const results: Result[] = [];
  const entries = items.entries();
  let failed = false;
  const worker = async () => {
    for (const [index, item] of entries) {
      if (failed) {
        return;
      }
      try {
        // Sequential within a worker by design: `limit` workers run in parallel.
        // eslint-disable-next-line no-await-in-loop
        results[index] = await run(item);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
};

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
      : role === "labelled"
        ? "the labelled entities"
        : "the grouped entities";

const ensureSentence = (text: string) =>
  /[.!?]$/u.test(text) ? text : `${text}.`;

/**
 * Every page of one read, until a page gives no cursor. Stops at a failed
 * page, when another parallel read has already stopped, when `onPage` has no
 * request left for the next page, or once `budget` (when provided) is exceeded.
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
  /** Claims one request for the next page; false when none are left. */
  onPage: () => boolean;
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
    if (!onPage()) {
      return {
        reason: `Reading ${readName(name)} would take the count past the ${hashEntityCountMaxJoinRequests.toLocaleString("en-US")} graph requests a count by links may make: narrow the counted set or follow fewer link types.`,
        entities: [...read.values()],
      };
    }
    let result: Awaited<ReturnType<HashJoinGraph<Cursor>["page"]>>;
    try {
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
 * Brunch's count by links, run in the page: it plans what to read, settling
 * `incomplete` before any request when that follows more than
 * `hashEntityCountMaxJoinLinkTypes` link types; counts the counted and link
 * entities, and refuses before reading when that exceeds `maxJoinEntities`
 * (default 20,000); else reads every page, joins them, and with `groupBy` slices to the top `maxGroups`
 * (default 25, max 500) before reading labels for those displayed groups only.
 * Sizes and reads run at most `hashEntityCountJoinConcurrency` at a time, and
 * the call makes at most `hashEntityCountMaxJoinRequests` requests. A failed
 * page, or the entity or request budget spent part-way, settles `incomplete`
 * with no count. A failed size count throws; a cancelled call rejects.
 */
export const runHashEntityJoinCount = async <Cursor>(
  input: HashEntityCountInput,
  webScope: HashWebScope,
  graph: HashJoinGraph<Cursor>,
  signal: AbortSignal,
  options?: Pick<HashEntityJoinCountOptions, "maxExpansionSteps">,
): Promise<HashEntityCountJoinResult> => {
  const maxJoinEntities =
    input.maxJoinEntities ?? hashEntityCountDefaultJoinEntities;
  const maxGroups = input.maxGroups ?? hashEntityCountDefaultGroups;

  const plan = hashEntityJoinCountPlan(input);
  if (plan.links.length > hashEntityCountMaxJoinLinkTypes) {
    return {
      outcome: "incomplete",
      reason: `The count follows ${plan.links.length} link types, more than the ${hashEntityCountMaxJoinLinkTypes} a count by links may follow: drop or merge where conditions, or shorten the groupBy path.`,
      reads: [],
      requests: 0,
    };
  }
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

  const countedSize = await graph.size(plan.counted, signal);
  requests += 1;
  if (countedSize === 0) {
    return {
      outcome: "counted",
      webScope,
      ofType: 0,
      count: 0,
      ...(input.groupBy === undefined ? {} : { groups: [] }),
      examples: [],
      reads: [{ ...countedName, entities: 0 }],
      requests,
    };
  }

  // At most 1 + hashEntityCountMaxJoinLinkTypes sizes: well under the ceiling.
  const linkSizes = await mapWithConcurrency(
    linkPlans,
    hashEntityCountJoinConcurrency,
    ({ selector }) => graph.size(selector, signal),
  );
  requests += linkSizes.length;
  const linkSizeByType = new Map(
    linkPlans.map(({ name }, index) => [
      name.entityTypes[0] ?? "",
      linkSizes[index] ?? 0,
    ]),
  );

  // Every `where` condition is ANDed: if any `exists: true` step has 0 links
  // at the pinned snapshot, no counted entity can qualify. Skip this shortcut
  // under `includeDrafts: true` so `ofType` still reports deduplicated entities
  // rather than raw edition rows from `graph.size`.
  const impossibleExists =
    input.includeDrafts !== true &&
    hashEntityCountWhereConditions(input.where).some(
      (condition) =>
        condition.exists &&
        condition.path.some(
          (step) => (linkSizeByType.get(step.linkType) ?? 0) === 0,
        ),
    );
  if (impossibleExists) {
    return {
      outcome: "counted",
      webScope,
      ofType: countedSize,
      count: 0,
      ...(input.groupBy === undefined ? {} : { groups: [] }),
      examples: [],
      reads: [
        { ...countedName, entities: 0 },
        ...linkPlans.map(({ name }) => ({ ...name, entities: 0 })),
      ],
      requests,
    };
  }

  const toRead: JoinRead[] = [
    { ...countedName, entities: countedSize },
    ...linkPlans.map(({ name }, index) => ({
      ...name,
      entities: linkSizes[index] ?? 0,
    })),
  ];
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
        if (requests >= hashEntityCountMaxJoinRequests) {
          return false;
        }
        requests += 1;
        return true;
      },
      signal,
    });
    if ("reason" in read && stop === undefined) {
      stop = read;
    }
    return { ...name, read: read.entities };
  };
  // The pool returns one result per read, so the default never applies.
  const [counted = { ...countedName, read: [] }, ...links] =
    await mapWithConcurrency(
      [
        () => readAll(plan.counted, countedName, budget),
        ...linkPlans.map(
          ({ selector, name }, index) =>
            () =>
              (linkSizes[index] ?? 0) === 0
                ? Promise.resolve({ ...name, read: [] as HashJoinEntity[] })
                : readAll(selector, name, budget),
        ),
      ],
      hashEntityCountJoinConcurrency,
      (read) => read(),
    );
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
    {
      ...(options?.maxExpansionSteps === undefined
        ? {}
        : { maxExpansionSteps: options.maxExpansionSteps }),
      signal,
    },
  );
  if ("reason" in joined) {
    return incomplete(joined.reason);
  }

  // Labels come from entities already read where they already have one, else
  // one combined by-id lookup for the <= maxGroups (<= 500) displayed groups
  // and <= maxExamples (<= 100) displayed examples that still lack a label.
  // Lookups use base ids so drafts and live editions resolve consistently.
  const knownByBase = (entities: readonly HashJoinEntity[]) =>
    dedupeByBaseEntityId(entities).map(
      (entity) => [baseEntityId(entity.entityId), entity] as const,
    );
  const known = new Map(
    knownByBase([counted, ...links].flatMap(({ read }) => read)),
  );

  let topGroups: readonly (readonly [string | null, number])[] | undefined;
  let otherGroups: CountedResult["otherGroups"];
  if (joined.groups !== undefined) {
    const sorted = [...joined.groups.entries()].sort(rawGroupOrder);
    topGroups = sorted.slice(0, maxGroups);
    const rest = sorted.slice(maxGroups);
    if (rest.length > 0) {
      otherGroups = {
        groups: rest.length,
        count: rest.reduce((sum, [, count]) => sum + count, 0),
      };
    }
  }

  const unlabelledIds: string[] = [];
  const seenUnlabelled = new Set<string>();
  const addUnlabelled = (id: string) => {
    if (!seenUnlabelled.has(id)) {
      seenUnlabelled.add(id);
      unlabelledIds.push(id);
    }
  };
  let needsExampleLabels = false;
  if (topGroups !== undefined) {
    for (const [id] of topGroups) {
      if (id !== null && known.get(id)?.label === undefined) {
        addUnlabelled(id);
      }
    }
  }
  for (const example of joined.examples) {
    if (example.label === undefined) {
      const base = baseEntityId(example.entityId);
      if (known.get(base)?.label === undefined) {
        needsExampleLabels = true;
        addUnlabelled(base);
      }
    }
  }

  if (unlabelledIds.length > 0) {
    const labelName = {
      role: needsExampleLabels ? ("labelled" as const) : ("grouped" as const),
      entityTypes: [] as string[],
    };
    const labelled = await readAll({ entityIds: unlabelledIds }, labelName);
    reads.push({ ...labelName, entities: labelled.read.length });
    const labelStop = stopped();
    if (labelStop !== undefined) {
      return incomplete(labelStop.reason);
    }
    for (const [id, entity] of knownByBase(labelled.read)) {
      known.set(id, entity);
    }
  }

  const groups: CountedResult["groups"] =
    topGroups === undefined
      ? undefined
      : topGroups
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

  const examples = joined.examples.map((example) => {
    const hydrated = known.get(baseEntityId(example.entityId));
    return entityRef(hydrated ?? example);
  });

  return {
    outcome: "counted",
    webScope,
    ofType: joined.ofType,
    count: joined.count,
    ...(groups === undefined ? {} : { groups }),
    ...(otherGroups === undefined ? {} : { otherGroups }),
    examples,
    reads,
    requests,
  };
};
