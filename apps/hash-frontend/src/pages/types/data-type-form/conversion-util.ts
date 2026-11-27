import { isEqual } from "lodash";

import { extractBaseUrl } from "@blockprotocol/type-system";
import { formatNumber } from "@local/hash-isomorphic-utils/format-number";

import type {
  BaseUrl,
  ConversionExpression,
  Conversions,
  ConversionValue,
  DataTypeWithMetadata,
  Operator,
} from "@blockprotocol/type-system";

export type ConversionOperator = Operator;

/**
 * A single-step conversion the editor can author: the viewed type's `to`
 * expression applied to `self` with one constant — "Metre = Foot × 3.28"
 * is `{ operator: "*", operand: 3.28 }`. Anything beyond this shape is a
 * formula the editor displays but does not edit.
 */
export type SimpleConversion = {
  operator: ConversionOperator;
  operand: number;
};

export const inverseOperator: Record<ConversionOperator, ConversionOperator> = {
  "*": "/",
  "/": "*",
  "+": "-",
  "-": "+",
};

const operatorDisplaySymbols: Record<ConversionOperator, string> = {
  "*": "×",
  "/": "÷",
  "+": "+",
  "-": "−",
};

const operatorPrecedence: Record<ConversionOperator, number> = {
  "*": 1,
  "/": 1,
  "+": 0,
  "-": 0,
};

export type ConversionExpressionPart =
  | { kind: "text"; text: string }
  | { kind: "self" };

/**
 * A formula flattened for display: literal text runs interleaved with the
 * `self` references, so renderers can swap each reference for a type chip.
 */
export const conversionExpressionParts = (
  expression: ConversionExpression,
): ConversionExpressionPart[] => {
  const parts: ConversionExpressionPart[] = [];
  const pushText = (text: string) => {
    const last = parts.at(-1);
    if (last?.kind === "text") {
      last.text += text;
    } else {
      parts.push({ kind: "text", text });
    }
  };

  const visit = ([operator, left, right]: ConversionExpression) => {
    const side = (value: ConversionValue, isRightOperand: boolean) => {
      if (value === "self") {
        parts.push({ kind: "self" });
        return;
      }
      if (!Array.isArray(value)) {
        pushText(formatNumber(value.const));
        return;
      }
      const needsParens =
        operatorPrecedence[value[0]] < operatorPrecedence[operator] ||
        (isRightOperand &&
          operatorPrecedence[value[0]] === operatorPrecedence[operator] &&
          (operator === "-" || operator === "/"));
      if (needsParens) {
        pushText("(");
      }
      visit(value);
      if (needsParens) {
        pushText(")");
      }
    };

    side(left, false);
    pushText(` ${operatorDisplaySymbols[operator]} `);
    side(right, true);
  };

  visit(expression);
  return parts;
};

/** The parts joined as plain text, with `self` shown as `selfLabel` */
export const formatConversionExpression = (
  expression: ConversionExpression,
  selfLabel: string,
): string =>
  conversionExpressionParts(expression)
    .map((part) => (part.kind === "self" ? selfLabel : part.text))
    .join("");

/** The stored pair for a simple conversion, kept in the form the user typed */
export const simpleToConversions = (simple: SimpleConversion): Conversions => {
  const constant = { const: simple.operand, type: "number" as const };
  return {
    to: { expression: [simple.operator, "self", constant] },
    from: { expression: [inverseOperator[simple.operator], "self", constant] },
  };
};

/** One expression's single-step form: `self op const`, commuted for * and + */
const parseSimpleExpression = (
  expression: ConversionExpression,
): SimpleConversion | null => {
  const [operator, left, right] = expression;

  const operand = (side: typeof left): number | "self" | null =>
    side === "self"
      ? "self"
      : typeof side === "object" && "const" in side
        ? side.const
        : null;

  const leftValue = operand(left);
  const rightValue = operand(right);

  if (leftValue === "self" && typeof rightValue === "number") {
    return { operator, operand: rightValue };
  }

  // Multiplication and addition commute, so the constant may sit first
  if (
    (operator === "*" || operator === "+") &&
    typeof leftValue === "number" &&
    rightValue === "self"
  ) {
    return { operator, operand: leftValue };
  }

  return null;
};

export const parseSimpleConversion = (
  conversions: Conversions,
): SimpleConversion | null => {
  const to = parseSimpleExpression(conversions.to.expression);
  if (!to) {
    return null;
  }

  // Editing a simple row rewrites BOTH directions symmetrically, so a pair
  // whose `from` doesn't undo its `to` must stay a formula — the rewrite
  // would silently change what the stored `from` computes
  const from = parseSimpleExpression(conversions.from.expression);
  if (
    !from ||
    from.operator !== inverseOperator[to.operator] ||
    from.operand !== to.operand
  ) {
    return null;
  }

  return to;
};

/**
 * 1 viewed unit = `factor` target units, when the conversion scales — the
 * composable form group placement runs on. Additive conversions have none.
 */
export const simpleEffectiveFactor = (
  simple: SimpleConversion,
): number | null => {
  if (simple.operator === "*" && simple.operand !== 0) {
    return simple.operand;
  }
  if (simple.operator === "/" && simple.operand !== 0) {
    return 1 / simple.operand;
  }
  return null;
};

/**
 * The numeric factor a conversion's `to` expression multiplies `self` by,
 * or null for additive conversions and formulas.
 */
export const parseConversionFactor = (
  conversions: Conversions,
): number | null => {
  const simple = parseSimpleConversion(conversions);
  return simple ? simpleEffectiveFactor(simple) : null;
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
  /** The row reads "viewed = target `operator` `value`" — the to-expression */
  operator: ConversionOperator;
  value: number | null;
  /** The type whose metadata stores this pairing; null for new rows */
  storedOnBaseUrl: BaseUrl | null;
  /** Composed through the group's canonical — displayed, not editable */
  viaCanonical: boolean;
  /** A stored expression beyond a single step — displayed, not editable */
  formula: boolean;
  /** The stored pair behind a formula row, for display */
  conversions?: Conversions | null;
};

/** 1 viewed unit = `factor` target units; null while incomplete or additive */
export const rowEffectiveFactor = (row: ConversionRowState): number | null =>
  row.value === null
    ? null
    : simpleEffectiveFactor({ operator: row.operator, operand: row.value });

/** Snapped so composed factors read as the number the user typed */
const snapped = (factor: number): number => Number(factor.toPrecision(12));

export const conversionRowStatesFromRows = (
  rows: ConversionRow[],
): ConversionRowState[] =>
  rows.map((row) => ({
    key: row.targetBaseUrl,
    targetBaseUrl: row.targetBaseUrl,
    operator: row.simple?.operator ?? "*",
    value:
      row.simple?.operand ?? (row.factor === null ? null : snapped(row.factor)),
    storedOnBaseUrl: row.storedOnBaseUrl,
    viaCanonical: row.viaCanonical,
    formula: !row.viaCanonical && !row.simple,
    conversions: row.conversions ?? null,
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
  operator: "*",
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
  /** The stored pair, for direction-aware single-step parsing */
  conversions: Conversions;
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
        conversions,
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
    // member storing no entries — a pair's target, as the planner places it.
    const definers = new Set(componentEdges.map((edge) => edge.sourceBaseUrl));
    let canonicalBaseUrl = members[0]!;
    let bestScore = -1;
    for (const member of members) {
      const score =
        (neighbours.get(member)?.size ?? 0) * 2 +
        (definers.has(member) ? 0 : 1);
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
  /** 1 viewed unit = `factor` target units; null for additive or formulas */
  factor: number | null;
  /** The single-step form seen from the viewed side; null for formulas */
  simple?: SimpleConversion | null;
  /** The stored pair seen from the viewed side (`to` = viewed → target) */
  conversions?: Conversions | null;
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
        simple: parseSimpleConversion(edge.conversions),
        conversions: edge.conversions,
        storedOnBaseUrl: edge.sourceBaseUrl,
        viaCanonical: false,
      });
    } else if (edge.targetBaseUrl === viewedBaseUrl) {
      // Stored on the other side: its `from` is the viewed side's `to`
      const swapped = {
        to: edge.conversions.from,
        from: edge.conversions.to,
      };
      rows.set(edge.sourceBaseUrl, {
        targetBaseUrl: edge.sourceBaseUrl,
        factor:
          edge.factor === null || edge.factor === 0 ? null : 1 / edge.factor,
        simple: parseSimpleConversion(swapped),
        conversions: swapped,
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
      const factor = viewedFactor / memberFactor;
      rows.set(memberBaseUrl, {
        targetBaseUrl: memberBaseUrl,
        factor,
        simple: { operator: "*", operand: Number(factor.toPrecision(12)) },
        storedOnBaseUrl: null,
        viaCanonical: true,
      });
    }
  }

  return [...rows.values()].sort((a, b) =>
    a.targetBaseUrl.localeCompare(b.targetBaseUrl),
  );
};

/**
 * The pairings lost when `memberBaseUrl` is severed from its group: its own
 * pairing with every other member and — where its edges were the only path
 * between remaining members — those members' pairings with each other.
 */
export const severedConversionPairings = ({
  memberBaseUrl,
  group,
}: {
  memberBaseUrl: BaseUrl;
  group: ConversionGroup;
}): Array<[BaseUrl, BaseUrl]> => {
  const members = new Set<BaseUrl>(group.factorsToCanonical.keys());
  for (const edge of group.edges) {
    members.add(edge.sourceBaseUrl);
    members.add(edge.targetBaseUrl);
  }
  members.delete(memberBaseUrl);

  const pairings: Array<[BaseUrl, BaseUrl]> = [...members].map((member) => [
    memberBaseUrl,
    member,
  ]);

  // The rest can split when the severed member's edges joined them
  const remainingNeighbours = new Map<BaseUrl, Set<BaseUrl>>();
  const addNeighbour = (from: BaseUrl, to: BaseUrl) => {
    const set = remainingNeighbours.get(from) ?? new Set<BaseUrl>();
    set.add(to);
    remainingNeighbours.set(from, set);
  };
  for (const edge of group.edges) {
    if (
      edge.sourceBaseUrl !== memberBaseUrl &&
      edge.targetBaseUrl !== memberBaseUrl
    ) {
      addNeighbour(edge.sourceBaseUrl, edge.targetBaseUrl);
      addNeighbour(edge.targetBaseUrl, edge.sourceBaseUrl);
    }
  }

  const componentOf = new Map<BaseUrl, number>();
  let componentIndex = 0;
  for (const member of members) {
    if (componentOf.has(member)) {
      continue;
    }
    const queue = [member];
    componentOf.set(member, componentIndex);
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index];
      if (!current) {
        continue;
      }
      for (const neighbour of remainingNeighbours.get(current) ?? []) {
        if (!componentOf.has(neighbour)) {
          componentOf.set(neighbour, componentIndex);
          queue.push(neighbour);
        }
      }
    }
    componentIndex++;
  }

  const memberList = [...members];
  for (let first = 0; first < memberList.length; first++) {
    for (let second = first + 1; second < memberList.length; second++) {
      const firstMember = memberList[first];
      const secondMember = memberList[second];
      if (
        firstMember &&
        secondMember &&
        componentOf.get(firstMember) !== componentOf.get(secondMember)
      ) {
        pairings.push([firstMember, secondMember]);
      }
    }
  }

  return pairings;
};

export type ConversionUpdatePlan = {
  updates: Array<{
    baseUrl: BaseUrl;
    conversions: Record<BaseUrl, Conversions>;
  }>;
  /** Pairings no reachable type has a free slot to store — see the doc above */
  unplacedTargets: BaseUrl[];
  /** Members whose severing would republish a type the caller can't update */
  unremovableTargets: BaseUrl[];
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
 * (reversed when the other member stores them). An additive pairing can't
 * compose through a hub, so it only ever lives as the viewed type's own
 * direct entry — taking its single slot, which must be free. Pairings none
 * of these moves can satisfy are returned as `unplacedTargets` for the
 * caller to surface.
 *
 * A composed (via-canonical) pairing isn't stored anywhere, so removing one
 * means severing its target member from the group: every stored edge
 * incident to that member is deleted, wherever it lives. Members whose
 * severing would republish a type the caller can't update are returned as
 * `unremovableTargets`.
 */
export const planConversionUpdates = ({
  viewedBaseUrl,
  desiredRows,
  initialRows,
  removedComposedTargets = [],
  latestDataTypes,
  canWriteTo,
}: {
  viewedBaseUrl: BaseUrl;
  desiredRows: Array<
    | { targetBaseUrl: BaseUrl; factor: number }
    | { targetBaseUrl: BaseUrl; simple: SimpleConversion }
  >;
  initialRows: ConversionRow[];
  /** Group members severed by removing their composed pairing */
  removedComposedTargets?: BaseUrl[];
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

  // Every desired pairing in its single-step form, factors derived from it
  const desiredByTarget = new Map(
    desiredRows.map((row) => {
      const simple =
        "simple" in row
          ? row.simple
          : { operator: "*" as const, operand: row.factor };
      return [
        row.targetBaseUrl,
        {
          targetBaseUrl: row.targetBaseUrl,
          simple,
          factor: simpleEffectiveFactor(simple),
        },
      ];
    }),
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
    // A scaling pairing is unchanged when the effective factor matches,
    // whatever form stores it; an additive one when the exact step matches
    const unchanged =
      desired.factor !== null
        ? desired.factor === initial.factor
        : initial.simple != null &&
          initial.simple.operator === desired.simple.operator &&
          initial.simple.operand === desired.simple.operand;
    if (!unchanged) {
      // Stored on the other side, the entry runs the opposite way — its
      // `to` is the viewed side's `from`
      const stored = simpleToConversions(desired.simple);
      touch(initial.storedOnBaseUrl)[entryKey] = storedOnViewer
        ? stored
        : { to: stored.from, from: stored.to };
    }
  }

  const unremovableTargets: BaseUrl[] = [];

  // Severed members: delete every stored edge incident to each, wherever it
  // lives — on the member itself or on another member aiming at it. Staged
  // before placements so freed slots and split groups are visible to them.
  for (const removedBaseUrl of removedComposedTargets) {
    const holders: BaseUrl[] = [];
    for (const dataType of Object.values(latestDataTypes)) {
      const holderBaseUrl = dataType.metadata.recordId.baseUrl;
      const entries =
        staged.get(holderBaseUrl) ?? dataType.metadata.conversions ?? {};
      const holdsIncidentEdge =
        holderBaseUrl === removedBaseUrl
          ? Object.keys(entries).length > 0
          : entries[removedBaseUrl] !== undefined;
      if (holdsIncidentEdge) {
        holders.push(holderBaseUrl);
      }
    }

    if (!holders.every(canWriteTo)) {
      unremovableTargets.push(removedBaseUrl);
      continue;
    }

    for (const holderBaseUrl of holders) {
      const entries = touch(holderBaseUrl);
      if (holderBaseUrl === removedBaseUrl) {
        for (const key of Object.keys(entries)) {
          delete entries[key as BaseUrl];
        }
      } else {
        delete entries[removedBaseUrl];
      }
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

  /**
   * Whether the group's elected canonical is the hub this type's own entries
   * anchor on: the target of its single entry, or the type itself when it
   * stores none or several (a holder hub). Anyone can store an entry aimed
   * at a public type, so incoming entries alone can elect a canonical the
   * type never chose — pairings through such a hub are refused rather than
   * made to depend on it.
   */
  const anchorsOn = (
    anchorBaseUrl: BaseUrl,
    group: ConversionGroup,
  ): boolean => {
    const entryTargets = Object.keys(
      staged.get(anchorBaseUrl) ??
        latestDataTypes[anchorBaseUrl]?.metadata.conversions ??
        {},
    );
    const ownHub = entryTargets.length === 1 ? entryTargets[0] : anchorBaseUrl;
    return ownHub === group.canonicalBaseUrl;
  };

  const unplacedTargets: BaseUrl[] = [];

  for (const added of desiredByTarget.values()) {
    // Additive pairings don't scale, so they can't compose through a hub —
    // the viewed type stores the exact expression as its own entry, which
    // needs its single slot free (the store holds one entry per type)
    if (added.factor === null) {
      if (!canWriteTo(viewedBaseUrl)) {
        unplacedTargets.push(added.targetBaseUrl);
        continue;
      }
      const ownEntries = touch(viewedBaseUrl);
      if (Object.keys(ownEntries).some((key) => key !== added.targetBaseUrl)) {
        unplacedTargets.push(added.targetBaseUrl);
        continue;
      }
      ownEntries[added.targetBaseUrl] = simpleToConversions(added.simple);
      continue;
    }

    const groups = groupsFromStaged();
    const rawViewedGroup = groups.get(viewedBaseUrl);
    const targetGroup = groups.get(added.targetBaseUrl);

    // 1 viewed = `added.factor` targets throughout; factorsToCanonical maps
    // a member's value into its hub's units
    const viewedToHub = rawViewedGroup?.factorsToCanonical.get(viewedBaseUrl);

    // A type tied to a family only by someone else's formula edge has no
    // composable factor and no entry of its own — for placement it acts
    // ungrouped, taking its own free slot, rather than letting an untrusted
    // incoming conversion veto every pairing its owner adds
    const viewedOwnEntries =
      staged.get(viewedBaseUrl) ??
      latestDataTypes[viewedBaseUrl]?.metadata.conversions ??
      {};
    const viewedGroup =
      rawViewedGroup &&
      viewedToHub === undefined &&
      Object.keys(viewedOwnEntries).length === 0
        ? undefined
        : rawViewedGroup;
    const targetToHub = targetGroup?.factorsToCanonical.get(
      added.targetBaseUrl,
    );

    if (!viewedGroup && !targetGroup) {
      // A new group of two: the viewed type stores the entry in the form the
      // user typed, the target becomes the pair's canonical
      touch(viewedBaseUrl)[added.targetBaseUrl] = simpleToConversions(
        added.simple,
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

    const targetHubTrusted =
      !!targetGroup && anchorsOn(added.targetBaseUrl, targetGroup);
    const viewedHubTrusted =
      !!viewedGroup && anchorsOn(viewedBaseUrl, viewedGroup);

    if (!viewedGroup && targetGroup) {
      // The viewed type joins the target's group, aimed at its canonical
      if (targetToHub === undefined || !targetHubTrusted) {
        unplacedTargets.push(added.targetBaseUrl);
        continue;
      }
      touch(viewedBaseUrl)[targetGroup.canonicalBaseUrl] =
        conversionsFromFactor(added.factor * targetToHub);
      continue;
    }

    if (viewedGroup && !targetGroup) {
      // The target joins the viewed type's group — republishing the target
      if (
        viewedToHub === undefined ||
        !viewedHubTrusted ||
        !canWriteTo(added.targetBaseUrl)
      ) {
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
      // rewrite, preferring the smaller rewrite — into a canonical only when
      // that side's own entries anchor on it
      const hubVToHubT = (added.factor * targetToHub) / viewedToHub;

      const candidates = [
        ...(viewedHubTrusted
          ? [
              {
                group: targetGroup,
                newHub: viewedGroup.canonicalBaseUrl,
                oldHubToNewHub: 1 / hubVToHubT,
              },
            ]
          : []),
        ...(targetHubTrusted
          ? [
              {
                group: viewedGroup,
                newHub: targetGroup.canonicalBaseUrl,
                oldHubToNewHub: hubVToHubT,
              },
            ]
          : []),
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
    unremovableTargets,
  };
};

/**
 * Folds several plans' full conversion records for one type into one: each
 * applies as its diff against the type's current conversions. Null when two
 * plans set one target differently.
 */
export const mergeConversionRecords = (
  current: Record<BaseUrl, Conversions>,
  records: Record<BaseUrl, Conversions>[],
): Record<BaseUrl, Conversions> | null => {
  const merged = new Map(Object.entries(current) as [BaseUrl, Conversions][]);
  const changes = new Map<BaseUrl, Conversions | undefined>();

  for (const record of records) {
    const keys = new Set([
      ...Object.keys(current),
      ...Object.keys(record),
    ] as BaseUrl[]);
    for (const key of keys) {
      const next = record[key];
      if (isEqual(next, current[key])) {
        continue;
      }
      if (changes.has(key) && !isEqual(changes.get(key), next)) {
        return null;
      }
      changes.set(key, next);
      if (next) {
        merged.set(key, next);
      } else {
        merged.delete(key);
      }
    }
  }

  return Object.fromEntries(merged);
};

/**
 * A conversion pairing shown on a type group's editor: one member's
 * relationship to a conversion family. The row reads
 * "member = target `operator` `value`" — the member's to-expression.
 */
export type GroupConversionRowState = {
  key: string;
  /** The group member the pairing belongs to; null until picked on a new row */
  childBaseUrl: BaseUrl | null;
  targetBaseUrl: BaseUrl | null;
  operator: ConversionOperator;
  value: number | null;
  /** The type whose metadata stores the pairing; null for new rows */
  storedOnBaseUrl: BaseUrl | null;
  /** Composed through the family's canonical — displayed, not editable */
  viaCanonical: boolean;
  /** A stored expression beyond a single step — displayed, not editable */
  formula: boolean;
  /** The stored pair behind a formula row, for display */
  conversions?: Conversions | null;
};

/**
 * The conversions a type group's concrete members carry, one row per
 * pairing: a spoke member's stored pairing against its family's canonical,
 * and — where a member is itself a family's canonical with no spoke member
 * alongside it to carry the section — that hub's pairings to its spokes.
 */
export const groupConversionRowStates = ({
  childBaseUrls,
  latestDataTypes,
}: {
  childBaseUrls: BaseUrl[];
  latestDataTypes: Record<BaseUrl, DataTypeWithMetadata>;
}): GroupConversionRowState[] => {
  const groups = buildConversionGroups(latestDataTypes);
  const childSet = new Set(childBaseUrls);
  const states: GroupConversionRowState[] = [];

  const fromRow = (
    childBaseUrl: BaseUrl,
    row: ConversionRow,
  ): GroupConversionRowState => ({
    key: `${childBaseUrl}:${row.targetBaseUrl}`,
    childBaseUrl,
    targetBaseUrl: row.targetBaseUrl,
    operator: row.simple?.operator ?? "*",
    value:
      row.simple?.operand ??
      (row.factor === null ? null : Number(row.factor.toPrecision(12))),
    storedOnBaseUrl: row.storedOnBaseUrl,
    viaCanonical: row.viaCanonical,
    formula: !row.viaCanonical && !row.simple,
    conversions: row.conversions ?? null,
  });

  for (const childBaseUrl of childBaseUrls) {
    const group = groups.get(childBaseUrl);
    if (!group) {
      continue;
    }

    const rows = conversionRowsForViewer({
      viewedBaseUrl: childBaseUrl,
      group,
    });

    if (childBaseUrl !== group.canonicalBaseUrl) {
      // Every stored pairing the member takes part in — one aimed at the
      // canonical in the star shape, several on legacy chain shapes —
      // matching what the member's own editor shows and plans with
      for (const row of rows) {
        if (!row.viaCanonical) {
          states.push(fromRow(childBaseUrl, row));
        }
      }
      continue;
    }

    // The hub member: its pairings are its spokes' rows, surfaced from the
    // hub's side only when no spoke member carries the section itself
    if (!rows.some((row) => childSet.has(row.targetBaseUrl))) {
      for (const row of rows) {
        states.push(fromRow(childBaseUrl, row));
      }
    }
  }

  return states;
};

export const newGroupConversionRowState = (
  existingRows: GroupConversionRowState[],
): GroupConversionRowState => ({
  key: `new-${existingRows.reduce((next, row) => {
    const match = /^new-(\d+)$/.exec(row.key);
    return match ? Math.max(next, Number(match[1]) + 1) : next;
  }, 0)}`,
  childBaseUrl: null,
  targetBaseUrl: null,
  operator: "*",
  value: null,
  storedOnBaseUrl: null,
  viaCanonical: false,
  formula: false,
});

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

const operatorSortRank: Record<ConversionOperator, number> = {
  "*": 0,
  "/": 1,
  "+": 2,
  "-": 3,
};

/**
 * The cards' at-open ordering: × then ÷ then + then −, ascending value
 * within each operator, formulas last. Rows added during a session are
 * appended instead, keeping them where the user put them.
 */
export const compareConversionSteps = (
  a: { operator: ConversionOperator; value: number | null; formula: boolean },
  b: { operator: ConversionOperator; value: number | null; formula: boolean },
): number =>
  (a.formula ? 4 : operatorSortRank[a.operator]) -
    (b.formula ? 4 : operatorSortRank[b.operator]) ||
  (a.value ?? Number.POSITIVE_INFINITY) - (b.value ?? Number.POSITIVE_INFINITY);

export const dataTypeBaseUrlOf = (dataType: DataTypeWithMetadata): BaseUrl =>
  extractBaseUrl(dataType.schema.$id);
