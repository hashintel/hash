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

  // A whole-number divisor reads better (and is exact) as a division
  const divisor = 1 / factor;
  const useDivision = factor < 1 && Number.isInteger(divisor);

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
  /** How the factor is displayed: 1 unit × value, or 1 unit ÷ value */
  operator: "multiply" | "divide";
  value: number | null;
  /** The type whose metadata stores this pairing; null for new rows */
  storedOnBaseUrl: BaseUrl | null;
  /** Composed through the group's canonical — displayed, not editable */
  viaCanonical: boolean;
  /** A stored expression beyond a plain factor — displayed, not editable */
  formula: boolean;
};

/** 1 viewed unit = `factor` target units, per the row's operator and value */
export const rowEffectiveFactor = (row: ConversionRowState): number | null => {
  if (row.value === null || row.value === 0) {
    return null;
  }
  return row.operator === "multiply" ? row.value : 1 / row.value;
};

/**
 * How a factor reads best: a recurring decimal like 1/60 displays as
 * "÷ 60", while short decimals like 0.01 stay as "× 0.01".
 */
const presentFactor = (
  factor: number | null,
): Pick<ConversionRowState, "operator" | "value"> => {
  if (factor !== null && factor > 0 && factor < 1) {
    const inverse = 1 / factor;
    const snapped = Math.round(inverse);

    if (
      snapped !== 0 &&
      Math.abs(inverse - snapped) / inverse < 1e-9 &&
      String(factor).length > 8
    ) {
      return { operator: "divide", value: snapped };
    }
  }

  return { operator: "multiply", value: factor };
};

export const conversionRowStatesFromRows = (
  rows: ConversionRow[],
): ConversionRowState[] =>
  rows.map((row) => ({
    key: row.targetBaseUrl,
    targetBaseUrl: row.targetBaseUrl,
    ...presentFactor(row.factor),
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
  operator: "multiply",
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

export type ConversionUpdatePlan = Array<{
  baseUrl: BaseUrl;
  conversions: Record<BaseUrl, Conversions>;
}>;

/**
 * Where and what to write so the edited type's desired pairings hold.
 *
 * Direct pairings are rewritten where they are stored (reversed when the
 * other member stores them). New pairings follow the hub model: they land on
 * the edited type's group canonical, or on the edited type itself when it
 * has no group (making it the canonical of a new one). When a type that
 * anchors a group pairs into another group, that group is merged: its
 * canonical's entries move onto the surviving canonical, re-composed, and
 * the absorbed canonical is cleared. A groupless type instead joins the
 * target's group as a spoke, leaving the established hub untouched.
 */
export const planConversionUpdates = ({
  viewedBaseUrl,
  desiredRows,
  initialRows,
  groups,
  latestDataTypes,
}: {
  viewedBaseUrl: BaseUrl;
  desiredRows: Array<{ targetBaseUrl: BaseUrl; factor: number }>;
  initialRows: ConversionRow[];
  groups: Map<BaseUrl, ConversionGroup>;
  latestDataTypes: Record<BaseUrl, DataTypeWithMetadata>;
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

  const viewedGroup = groups.get(viewedBaseUrl);
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

  // New pairings land on the canonical (hub model)
  const survivingCanonical = viewedGroup?.canonicalBaseUrl ?? viewedBaseUrl;
  const viewedToCanonical =
    viewedGroup?.factorsToCanonical.get(viewedBaseUrl) ?? 1;

  for (const added of desiredByTarget.values()) {
    const targetGroup = groups.get(added.targetBaseUrl);

    // factor converting a canonical-unit value into target units
    const canonicalToTarget = added.factor / viewedToCanonical;

    if (survivingCanonical === added.targetBaseUrl) {
      // the viewed type pairs straight with its canonical: store the
      // reverse factor there, keyed by the viewed type
      touch(survivingCanonical)[viewedBaseUrl] = conversionsFromFactor(
        1 / added.factor,
      );
      continue;
    }

    if (survivingCanonical === viewedBaseUrl) {
      touch(viewedBaseUrl)[added.targetBaseUrl] = conversionsFromFactor(
        added.factor,
      );
    } else {
      touch(survivingCanonical)[added.targetBaseUrl] =
        conversionsFromFactor(canonicalToTarget);
    }

    // Connecting a second group when the viewed type anchors one of its own:
    // absorb its canonical's entries, re-composed against the surviving
    // canonical, and clear the absorbed canonical. A groupless viewed type
    // joins the target's group as a spoke instead — absorbing would wipe
    // conversions off a hub the user never edited.
    if (
      viewedGroup &&
      targetGroup &&
      targetGroup.canonicalBaseUrl !== survivingCanonical
    ) {
      const absorbed = targetGroup.canonicalBaseUrl;
      const targetToAbsorbed =
        targetGroup.factorsToCanonical.get(added.targetBaseUrl) ?? 1;
      // canonical units → absorbed-canonical units
      const canonicalToAbsorbed = canonicalToTarget * targetToAbsorbed;

      if (absorbed !== added.targetBaseUrl) {
        touch(survivingCanonical)[absorbed] =
          conversionsFromFactor(canonicalToAbsorbed);
      }

      const absorbedEntries =
        latestDataTypes[absorbed]?.metadata.conversions ?? {};
      for (const [entryTarget, conversions] of Object.entries(
        absorbedEntries,
      )) {
        const factor = parseConversionFactor(conversions);
        if (
          factor === null ||
          entryTarget === survivingCanonical ||
          entryTarget === viewedBaseUrl
        ) {
          continue;
        }
        // absorbed.to converts absorbed units → entry-target units
        touch(survivingCanonical)[entryTarget as BaseUrl] =
          conversionsFromFactor(canonicalToAbsorbed * factor);
      }

      if (Object.keys(absorbedEntries).length > 0) {
        staged.set(absorbed, {});
      }
    }
  }

  return [...staged.entries()]
    .filter(([baseUrl, conversions]) => {
      const current = latestDataTypes[baseUrl]?.metadata.conversions ?? {};
      return JSON.stringify(conversions) !== JSON.stringify(current);
    })
    .map(([baseUrl, conversions]) => ({ baseUrl, conversions }));
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
