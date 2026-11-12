import { extractBaseUrl } from "@blockprotocol/type-system";

import type {
  BaseUrl,
  Conversions,
  DataTypeWithMetadata,
} from "@blockprotocol/type-system";

/**
 * The numeric factor a conversion's `to` expression multiplies `self` by,
 * or null for expressions beyond a single multiply/divide — those are
 * formulas this editor displays but does not edit.
 */
export const parseConversionFactor = (
  conversions: Conversions,
): number | null => {
  const [operator, left, right] = conversions.to.expression;

  const operand = (side: typeof left): number | "self" | null =>
    side === "self"
      ? "self"
      : typeof side === "object" && "const" in side
        ? side.const
        : null;

  const leftValue = operand(left);
  const rightValue = operand(right);

  if (operator === "*") {
    if (leftValue === "self" && typeof rightValue === "number") {
      return rightValue;
    }
    if (typeof leftValue === "number" && rightValue === "self") {
      return leftValue;
    }
  }

  if (
    operator === "/" &&
    leftValue === "self" &&
    typeof rightValue === "number" &&
    rightValue !== 0
  ) {
    return 1 / rightValue;
  }

  return null;
};

/** The symmetric `to`/`from` pair multiplying a value by `factor`. */
export const conversionsFromFactor = (factor: number): Conversions => {
  const constant = (value: number) => ({
    const: value,
    type: "number" as const,
  });

  // The reciprocal reads better — and stores the value the user typed
  // exactly — when it is the shorter number: `["/", "self", 30.48]` for a
  // 1-foot-is-30.48-of-these conversion rather than a long multiply
  const divisor = Number((1 / factor).toPrecision(12));
  const useDivision =
    factor < 1 && String(divisor).length < String(factor).length;

  return {
    to: {
      expression: useDivision
        ? ["/", "self", constant(divisor)]
        : ["*", "self", constant(factor)],
    },
    from: {
      expression: useDivision
        ? ["*", "self", constant(divisor)]
        : ["/", "self", constant(factor)],
    },
  };
};

export type ConversionRowState = {
  key: string;
  targetBaseUrl: BaseUrl | null;
  /** Viewed units per one target unit: "1 target = `value` × 1 viewed" */
  value: number | null;
  /** The type whose metadata stores this pairing; null for new rows */
  storedOnBaseUrl: BaseUrl | null;
  /** Composed through the group's canonical — displayed, not editable */
  viaCanonical: boolean;
  /** A stored expression beyond a plain factor — displayed, not editable */
  formula: boolean;
};

/** 1 viewed unit = `factor` target units — the row value's reciprocal */
export const rowEffectiveFactor = (row: ConversionRowState): number | null => {
  if (row.value === null || row.value === 0) {
    return null;
  }
  return 1 / row.value;
};

/**
 * The stored factor reversed into the row's display value, snapped so a
 * reciprocal round-trip shows the number the user typed (30.48, not
 * 30.480000000000004).
 */
const reversedValue = (factor: number | null): number | null =>
  factor === null || factor === 0 ? null : Number((1 / factor).toPrecision(12));

export const conversionRowStatesFromRows = (
  rows: ConversionRow[],
): ConversionRowState[] =>
  rows.map((row) => ({
    key: row.targetBaseUrl,
    targetBaseUrl: row.targetBaseUrl,
    value: reversedValue(row.factor),
    storedOnBaseUrl: row.storedOnBaseUrl,
    viaCanonical: row.viaCanonical,
    formula: row.factor === null,
  }));

export const newConversionRowState = (
  existingRows: ConversionRowState[],
): ConversionRowState => ({
  // One past the highest live "new-N" key: counting rows would collide with
  // a surviving row after an add-remove-add sequence
  key: `new-${existingRows.reduce((next, row) => {
    const match = /^new-(\d+)$/.exec(row.key);
    return match ? Math.max(next, Number(match[1]) + 1) : next;
  }, 0)}`,
  targetBaseUrl: null,
  value: null,
  storedOnBaseUrl: null,
  viaCanonical: false,
  formula: false,
});

type ConversionEdge = {
  sourceBaseUrl: BaseUrl;
  targetBaseUrl: BaseUrl;
  /** Converts a source-typed value into target units; null for formulas */
  factor: number | null;
};

export type ConversionGroup = {
  /**
   * The member all stored factors are expressed against for composition —
   * the group's most-connected type, e.g. Metre for the length units.
   */
  canonicalBaseUrl: BaseUrl;
  /** member → factor converting a value of that member into canonical units */
  factorsToCanonical: Map<BaseUrl, number>;
  /** the stored conversion entries linking the group */
  edges: ConversionEdge[];
};

/**
 * The conversion groups across the latest data types: connected components
 * of the stored conversion entries, each with factors composed against the
 * group's most-connected member. Members linked only by formula conversions
 * carry no composed factor.
 */
export const buildConversionGroups = (
  latestDataTypes: Record<BaseUrl, DataTypeWithMetadata>,
): Map<BaseUrl, ConversionGroup> => {
  const edges: ConversionEdge[] = [];

  for (const dataType of Object.values(latestDataTypes)) {
    for (const [targetBaseUrl, conversions] of Object.entries(
      dataType.metadata.conversions ?? {},
    )) {
      edges.push({
        sourceBaseUrl: dataType.metadata.recordId.baseUrl,
        targetBaseUrl: targetBaseUrl as BaseUrl,
        factor: parseConversionFactor(conversions),
      });
    }
  }

  const neighbours = new Map<BaseUrl, Set<BaseUrl>>();
  const addNeighbour = (from: BaseUrl, to: BaseUrl) => {
    const set = neighbours.get(from) ?? new Set<BaseUrl>();
    set.add(to);
    neighbours.set(from, set);
  };
  for (const edge of edges) {
    addNeighbour(edge.sourceBaseUrl, edge.targetBaseUrl);
    addNeighbour(edge.targetBaseUrl, edge.sourceBaseUrl);
  }

  const groupByMember = new Map<BaseUrl, ConversionGroup>();
  const visited = new Set<BaseUrl>();

  for (const startBaseUrl of neighbours.keys()) {
    if (visited.has(startBaseUrl)) {
      continue;
    }

    // Collect the component
    const members: BaseUrl[] = [];
    const queue = [startBaseUrl];
    visited.add(startBaseUrl);
    while (queue.length > 0) {
      const member = queue.shift();
      if (!member) {
        break;
      }
      members.push(member);
      for (const neighbour of neighbours.get(member) ?? []) {
        if (!visited.has(neighbour)) {
          visited.add(neighbour);
          queue.push(neighbour);
        }
      }
    }

    const memberSet = new Set(members);
    const componentEdges = edges.filter((edge) =>
      memberSet.has(edge.sourceBaseUrl),
    );

    // The canonical is the most-connected member: the hub every spoke
    // targets, or the holder that defines every conversion. Ties prefer a
    // definer, so new entries land where existing ones are stored.
    const definers = new Set(componentEdges.map((edge) => edge.sourceBaseUrl));
    let canonicalBaseUrl = members[0]!;
    let bestScore = -1;
    for (const member of members) {
      const score =
        (neighbours.get(member)?.size ?? 0) * 2 +
        (definers.has(member) ? 1 : 0);
      if (score > bestScore) {
        bestScore = score;
        canonicalBaseUrl = member;
      }
    }

    // Compose factors against the canonical, breadth-first over numeric edges
    const factorsToCanonical = new Map<BaseUrl, number>([
      [canonicalBaseUrl, 1],
    ]);
    let settled = false;
    while (!settled) {
      settled = true;
      for (const edge of componentEdges) {
        if (edge.factor === null || edge.factor === 0) {
          continue;
        }
        const sourceFactor = factorsToCanonical.get(edge.sourceBaseUrl);
        const targetFactor = factorsToCanonical.get(edge.targetBaseUrl);
        // v_canonical = v_target × targetFactor and v_target = v_source × edge
        if (targetFactor !== undefined && sourceFactor === undefined) {
          factorsToCanonical.set(
            edge.sourceBaseUrl,
            edge.factor * targetFactor,
          );
          settled = false;
        } else if (sourceFactor !== undefined && targetFactor === undefined) {
          factorsToCanonical.set(
            edge.targetBaseUrl,
            sourceFactor / edge.factor,
          );
          settled = false;
        }
      }
    }

    const group: ConversionGroup = {
      canonicalBaseUrl,
      factorsToCanonical,
      edges: componentEdges,
    };
    for (const member of members) {
      groupByMember.set(member, group);
    }
  }

  return groupByMember;
};

export type ConversionRow = {
  targetBaseUrl: BaseUrl;
  /** 1 viewed unit = `factor` target units; null for unparsable formulas */
  factor: number | null;
  /** The type whose metadata stores this pairing; null for composed rows */
  storedOnBaseUrl: BaseUrl | null;
  /** Composed through the canonical rather than stored directly */
  viaCanonical: boolean;
};

/**
 * The group's conversions as seen from one member: a row per other member,
 * direct entries first (reversed where the other member stores them),
 * then pairings composed through the canonical.
 */
export const conversionRowsForViewer = ({
  viewedBaseUrl,
  group,
}: {
  viewedBaseUrl: BaseUrl;
  group: ConversionGroup;
}): ConversionRow[] => {
  const rows = new Map<BaseUrl, ConversionRow>();

  for (const edge of group.edges) {
    if (edge.sourceBaseUrl === viewedBaseUrl) {
      rows.set(edge.targetBaseUrl, {
        targetBaseUrl: edge.targetBaseUrl,
        factor: edge.factor,
        storedOnBaseUrl: edge.sourceBaseUrl,
        viaCanonical: false,
      });
    } else if (edge.targetBaseUrl === viewedBaseUrl) {
      rows.set(edge.sourceBaseUrl, {
        targetBaseUrl: edge.sourceBaseUrl,
        factor:
          edge.factor === null || edge.factor === 0 ? null : 1 / edge.factor,
        storedOnBaseUrl: edge.sourceBaseUrl,
        viaCanonical: false,
      });
    }
  }

  const viewedFactor = group.factorsToCanonical.get(viewedBaseUrl);
  if (viewedFactor !== undefined) {
    for (const [memberBaseUrl, memberFactor] of group.factorsToCanonical) {
      if (memberBaseUrl === viewedBaseUrl || rows.has(memberBaseUrl)) {
        continue;
      }
      rows.set(memberBaseUrl, {
        targetBaseUrl: memberBaseUrl,
        factor: viewedFactor / memberFactor,
        storedOnBaseUrl: null,
        viaCanonical: true,
      });
    }
  }

  return [...rows.values()].sort((a, b) =>
    a.targetBaseUrl.localeCompare(b.targetBaseUrl),
  );
};

export type ConversionUpdatePlan = {
  updates: Array<{
    baseUrl: BaseUrl;
    conversions: Record<BaseUrl, Conversions>;
  }>;
  /** Pairings no reachable type has a free slot to store — see the doc above */
  unplacedTargets: BaseUrl[];
};

/**
 * Where and what to write so the edited type's desired pairings hold.
 *
 * The store keeps at most ONE conversion entry per data type, and the app
 * (frontend and the graph's conversion resolution alike) only composes
 * pairings through a single shared hub — so every group must stay a pure
 * star: each member stores its one entry aimed at the group's canonical,
 * which itself stores none. A new pairing therefore does exactly one of:
 *
 * - start a new group: both types ungrouped — the viewed type stores the
 *   entry, making the target the pair's canonical;
 * - join a group: one side ungrouped — it stores an entry aimed at the other
 *   side's canonical, with the factor composed through it;
 * - merge two groups: both sides grouped — every member of one group is
 *   republished to aim at the other group's canonical, which needs write
 *   permission on all of that group's members.
 *
 * Existing direct pairings are rewritten or removed where they are stored
 * (reversed when the other member stores them). Pairings none of these moves
 * can satisfy are returned as `unplacedTargets` for the caller to surface.
 */
export const planConversionUpdates = ({
  viewedBaseUrl,
  desiredRows,
  initialRows,
  latestDataTypes,
  canWriteTo,
}: {
  viewedBaseUrl: BaseUrl;
  desiredRows: Array<{ targetBaseUrl: BaseUrl; factor: number }>;
  initialRows: ConversionRow[];
  latestDataTypes: Record<BaseUrl, DataTypeWithMetadata>;
  /**
   * Whether a conversion entry may be stored on this type — storing one
   * republishes it, so this is an edit-permission check (the viewed type
   * itself should return true: the save already writes it)
   */
  canWriteTo: (baseUrl: BaseUrl) => boolean;
}): ConversionUpdatePlan => {
  /** staged next conversions per type, seeded lazily from current metadata */
  const staged = new Map<BaseUrl, Record<BaseUrl, Conversions>>();
  const touch = (baseUrl: BaseUrl): Record<BaseUrl, Conversions> => {
    const existing = staged.get(baseUrl);
    if (existing) {
      return existing;
    }
    const current = {
      ...(latestDataTypes[baseUrl]?.metadata.conversions ?? {}),
    } as Record<BaseUrl, Conversions>;
    staged.set(baseUrl, current);
    return current;
  };

  const desiredByTarget = new Map(
    desiredRows.map((row) => [row.targetBaseUrl, row]),
  );

  // Removed or changed direct pairings: rewrite where each is stored
  for (const initial of initialRows) {
    if (initial.storedOnBaseUrl === null) {
      continue;
    }

    const desired = desiredByTarget.get(initial.targetBaseUrl);
    const storedOnViewer = initial.storedOnBaseUrl === viewedBaseUrl;
    const entryKey = storedOnViewer ? initial.targetBaseUrl : viewedBaseUrl;

    if (!desired) {
      delete touch(initial.storedOnBaseUrl)[entryKey];
      continue;
    }

    desiredByTarget.delete(initial.targetBaseUrl);
    if (desired.factor !== initial.factor) {
      touch(initial.storedOnBaseUrl)[entryKey] = conversionsFromFactor(
        storedOnViewer ? desired.factor : 1 / desired.factor,
      );
    }
  }

  /**
   * Groups over the staged state, so each placement sees the ones before it
   * — a type absent from the stored data (the create flow's new type) gets a
   * synthetic stand-in carrying its staged entries
   */
  const groupsFromStaged = () => {
    const view: Record<BaseUrl, DataTypeWithMetadata> = { ...latestDataTypes };
    for (const [baseUrl, conversions] of staged) {
      const existing = latestDataTypes[baseUrl];
      view[baseUrl] = (
        existing
          ? {
              ...existing,
              metadata: { ...existing.metadata, conversions },
            }
          : {
              schema: { title: baseUrl },
              metadata: { recordId: { baseUrl, version: 1 }, conversions },
            }
      ) as DataTypeWithMetadata;
    }
    return buildConversionGroups(view);
  };

  /** Every base URL the group's stored entries touch, hub included */
  const membersOf = (group: ConversionGroup): Set<BaseUrl> => {
    const members = new Set<BaseUrl>(group.factorsToCanonical.keys());
    for (const edge of group.edges) {
      members.add(edge.sourceBaseUrl);
      members.add(edge.targetBaseUrl);
    }
    return members;
  };

  /**
   * A group can be absorbed when every member can be republished to aim at
   * the new canonical: all writable, and all on composable numeric factors
   * (a formula-linked member can't be re-expressed against a new hub)
   */
  const absorbable = (group: ConversionGroup): boolean =>
    [...membersOf(group)].every(
      (member) =>
        canWriteTo(member) &&
        group.factorsToCanonical.get(member) !== undefined,
    );

  /** Point every member of `group` at `newHub`: 1 member = `factor(m)` hubs */
  const absorb = (
    group: ConversionGroup,
    newHubBaseUrl: BaseUrl,
    /** multiplies a member's factor-to-its-old-hub into new-hub units */
    oldHubToNewHub: number,
  ) => {
    for (const member of membersOf(group)) {
      const toOldHub = group.factorsToCanonical.get(member);
      if (toOldHub === undefined || member === newHubBaseUrl) {
        continue;
      }
      const entries = touch(member);
      for (const key of Object.keys(entries)) {
        delete entries[key as BaseUrl];
      }
      entries[newHubBaseUrl] = conversionsFromFactor(toOldHub * oldHubToNewHub);
    }
  };

  const unplacedTargets: BaseUrl[] = [];

  for (const added of desiredByTarget.values()) {
    const groups = groupsFromStaged();
    const viewedGroup = groups.get(viewedBaseUrl);
    const targetGroup = groups.get(added.targetBaseUrl);

    // 1 viewed = `added.factor` targets throughout; factorsToCanonical maps
    // a member's value into its hub's units
    const viewedToHub = viewedGroup?.factorsToCanonical.get(viewedBaseUrl);
    const targetToHub = targetGroup?.factorsToCanonical.get(
      added.targetBaseUrl,
    );

    if (!viewedGroup && !targetGroup) {
      // A new group of two: the viewed type stores the entry, the target
      // becomes the pair's canonical
      touch(viewedBaseUrl)[added.targetBaseUrl] = conversionsFromFactor(
        added.factor,
      );
      continue;
    }

    if (viewedGroup && targetGroup && viewedGroup === targetGroup) {
      // An earlier placement already connected the pair: composition covers
      // it when the factors agree, and nothing can honour a disagreement
      if (
        viewedToHub !== undefined &&
        targetToHub !== undefined &&
        Math.abs(viewedToHub / targetToHub / added.factor - 1) < 1e-9
      ) {
        continue;
      }
      unplacedTargets.push(added.targetBaseUrl);
      continue;
    }

    if (!viewedGroup && targetGroup) {
      // The viewed type joins the target's group, aimed at its canonical
      if (targetToHub === undefined) {
        // The target hangs off its group by a formula — nothing to compose
        unplacedTargets.push(added.targetBaseUrl);
        continue;
      }
      touch(viewedBaseUrl)[targetGroup.canonicalBaseUrl] =
        conversionsFromFactor(added.factor * targetToHub);
      continue;
    }

    if (viewedGroup && !targetGroup) {
      // The target joins the viewed type's group — republishing the target
      if (viewedToHub === undefined || !canWriteTo(added.targetBaseUrl)) {
        unplacedTargets.push(added.targetBaseUrl);
        continue;
      }
      // 1 target = (1/factor) viewed = viewedToHub/factor hub units
      touch(added.targetBaseUrl)[viewedGroup.canonicalBaseUrl] =
        conversionsFromFactor(viewedToHub / added.factor);
      continue;
    }

    if (
      viewedGroup &&
      targetGroup &&
      viewedToHub !== undefined &&
      targetToHub !== undefined
    ) {
      // Two groups: merge by absorbing whichever the caller may fully
      // rewrite, preferring the smaller rewrite
      const hubVToHubT = (added.factor * targetToHub) / viewedToHub;

      const candidates = [
        {
          group: targetGroup,
          newHub: viewedGroup.canonicalBaseUrl,
          oldHubToNewHub: 1 / hubVToHubT,
        },
        {
          group: viewedGroup,
          newHub: targetGroup.canonicalBaseUrl,
          oldHubToNewHub: hubVToHubT,
        },
      ]
        .filter(({ group }) => absorbable(group))
        .sort((a, b) => membersOf(a.group).size - membersOf(b.group).size);

      const chosen = candidates[0];
      if (chosen) {
        absorb(chosen.group, chosen.newHub, chosen.oldHubToNewHub);
        continue;
      }
    }

    unplacedTargets.push(added.targetBaseUrl);
  }

  return {
    updates: [...staged.entries()]
      .filter(([baseUrl, conversions]) => {
        const current = latestDataTypes[baseUrl]?.metadata.conversions ?? {};
        return JSON.stringify(conversions) !== JSON.stringify(current);
      })
      .map(([baseUrl, conversions]) => ({ baseUrl, conversions })),
    unplacedTargets,
  };
};

/** The drawer-facing view: the viewed type's rows, or none without a group */
export const conversionRowsForDataType = ({
  dataTypeBaseUrl,
  latestDataTypes,
}: {
  dataTypeBaseUrl: BaseUrl;
  latestDataTypes: Record<BaseUrl, DataTypeWithMetadata>;
}): { rows: ConversionRow[]; groups: Map<BaseUrl, ConversionGroup> } => {
  const groups = buildConversionGroups(latestDataTypes);
  const group = groups.get(dataTypeBaseUrl);

  return {
    rows: group
      ? conversionRowsForViewer({ viewedBaseUrl: dataTypeBaseUrl, group })
      : [],
    groups,
  };
};

/** Naive singular for the mock's "1 Centimetre × 0.01 = Metres" line */
export const singularize = (name: string): string => {
  const trimmed = name.trim();
  return /s$/i.test(trimmed) && !/(ss|us|is)$/i.test(trimmed)
    ? trimmed.slice(0, -1)
    : trimmed;
};

export const dataTypeBaseUrlOf = (dataType: DataTypeWithMetadata): BaseUrl =>
  extractBaseUrl(dataType.schema.$id);
