import type { SDCPN, StatusLabel, StatusView } from "@hashintel/petrinaut-core";

// Prototype: rules drafted on a status in board setup. A rule either
// highlights matching cards (draft state only: the schema has no highlight
// field) or becomes its own status, inserted before its parent.

export const OPERATORS = [
  { value: ">=", text: "≥" },
  { value: ">", text: ">" },
  { value: "<=", text: "≤" },
  { value: "<", text: "<" },
  { value: "===", text: "=" },
  { value: "!==", text: "≠" },
] as const;

export type RuleOperator = (typeof OPERATORS)[number]["value"];

/** Which places a rule looks at. */
export type RuleChecks = "status" | "also" | "anywhere";

export type DraftRule = {
  id: string;
  /** The status the rule was started from. */
  labelId: string;
  /** Badge text on matching cards, and the name if it becomes a status. */
  name: string;
  field: string;
  operator: RuleOperator;
  value: string;
  /** Raw expression; when set it replaces field, operator and value. */
  expression: string | null;
  checks: RuleChecks;
  /** Extra places for `checks: "also"`. */
  alsoPlaceIds: string[];
};

/** Prefix for status views that exist only in a compile request. */
export const DRAFT_VIEW_PREFIX = "__board-setup-draft__";
export const HIGHLIGHT_VIEW_ID = `${DRAFT_VIEW_PREFIX}highlights`;
export const anywhereViewId = (ruleId: string) =>
  `${DRAFT_VIEW_PREFIX}anywhere:${ruleId}`;

const formatValue = (value: string): string => {
  const trimmed = value.trim();
  if (/^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed === "true" || trimmed === "false") {
    return trimmed;
  }
  return JSON.stringify(trimmed);
};

/** The rule's condition as a status-label expression, or null if unfinished. */
export const buildConditionExpression = (rule: DraftRule): string | null => {
  if (rule.expression !== null) {
    return rule.expression.trim() === "" ? null : rule.expression.trim();
  }
  if (rule.field === "" || rule.value.trim() === "") {
    return null;
  }
  return `token.${rule.field} ${rule.operator} ${formatValue(rule.value)}`;
};

/** Short human form, e.g. `damage ≥ 0.8`. */
export const describeRule = (rule: DraftRule): string => {
  if (rule.expression !== null) {
    return rule.expression.trim() || "No expression yet";
  }
  const operator =
    OPERATORS.find((candidate) => candidate.value === rule.operator)?.text ??
    rule.operator;
  return `${rule.field} ${operator} ${rule.value.trim() || "…"}`;
};

/** The places a rule checks, in model order. */
export const getRulePlaceIds = (
  rule: DraftRule,
  parent: StatusLabel | undefined,
  trackedPlaceIds: ReadonlySet<string>,
): string[] => {
  const own = parent?.places ?? [];
  if (rule.checks === "anywhere") {
    return [...trackedPlaceIds];
  }
  if (rule.checks === "also") {
    return [...new Set([...own, ...rule.alsoPlaceIds])];
  }
  return [...own];
};

/**
 * One label per finished rule, in rule order. The first matching label
 * wins, so a card shows at most one highlight.
 */
export const buildHighlightView = (
  rules: readonly DraftRule[],
  labels: readonly StatusLabel[],
  trackedPlaceIds: ReadonlySet<string>,
  identityRef: string,
): StatusView => ({
  id: HIGHLIGHT_VIEW_ID,
  name: "Draft highlights",
  identityRef,
  labels: rules.flatMap((rule) => {
    const tokenCondition = buildConditionExpression(rule);
    if (tokenCondition === null) {
      return [];
    }
    const parent = labels.find((label) => label.id === rule.labelId);
    return [
      {
        id: rule.id,
        name: rule.id,
        displayColor: "#f59e0b",
        places: getRulePlaceIds(rule, parent, trackedPlaceIds),
        tokenCondition,
      },
    ];
  }),
});

/** The same rule checked in every tracked place. */
export const buildAnywhereView = (
  rule: DraftRule,
  trackedPlaceIds: ReadonlySet<string>,
  identityRef: string,
): StatusView | null => {
  const tokenCondition = buildConditionExpression(rule);
  if (tokenCondition === null) {
    return null;
  }
  return {
    id: anywhereViewId(rule.id),
    name: "Draft anywhere preview",
    identityRef,
    labels: [
      {
        id: rule.id,
        name: rule.id,
        displayColor: "#f59e0b",
        places: [...trackedPlaceIds],
        tokenCondition,
      },
    ],
  };
};

/**
 * The saved net with the draft view swapped in and the synthetic views
 * appended. Only ever sent to the compiler; never saved.
 */
export const buildDraftDefinition = (
  sdcpn: SDCPN,
  draftView: StatusView,
  syntheticViews: readonly StatusView[],
): SDCPN => ({
  ...sdcpn,
  statusViews: [
    ...(sdcpn.statusViews ?? []).map((view) =>
      view.id === draftView.id ? draftView : view,
    ),
    ...syntheticViews,
  ],
});

/**
 * Turns a rule into a status placed just before its parent. First match
 * wins, so the new status takes the matching cards and the parent keeps
 * the rest.
 */
export const insertRuleAsStatus = (
  labels: readonly StatusLabel[],
  rule: DraftRule,
  trackedPlaceIds: ReadonlySet<string>,
  newLabel: { id: string; displayColor: string },
): StatusLabel[] => {
  const parentIndex = labels.findIndex((label) => label.id === rule.labelId);
  const tokenCondition = buildConditionExpression(rule);
  if (parentIndex < 0 || tokenCondition === null) {
    return [...labels];
  }
  const label: StatusLabel = {
    id: newLabel.id,
    name: rule.name.trim() || "New status",
    displayColor: newLabel.displayColor,
    places: getRulePlaceIds(rule, labels[parentIndex], trackedPlaceIds),
    tokenCondition,
  };
  return [...labels.slice(0, parentIndex), label, ...labels.slice(parentIndex)];
};

/**
 * Moves a place into a status. A status with a token condition shares its
 * places with the others, so moving into or out of one leaves the place
 * where it also is.
 */
export const movePlaceToLabel = (
  labels: readonly StatusLabel[],
  placeId: string,
  labelId: string,
): StatusLabel[] => {
  const target = labels.find((label) => label.id === labelId);
  const targetFilters = (target?.tokenCondition ?? "").trim() !== "";
  return labels.map((label) => {
    if (label.id === labelId) {
      return {
        ...label,
        places: [...label.places.filter((id) => id !== placeId), placeId],
      };
    }
    const filters = (label.tokenCondition ?? "").trim() !== "";
    if (targetFilters || filters) {
      return label;
    }
    return { ...label, places: label.places.filter((id) => id !== placeId) };
  });
};

/** Attributes present on every token type of the given places. */
export const getSharedAttributes = (
  sdcpn: SDCPN,
  placeIds: readonly string[],
): { name: string; type: string }[] => {
  const typeIds = [
    ...new Set(
      placeIds
        .map((id) => sdcpn.places.find((place) => place.id === id)?.colorId)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];
  const types = typeIds
    .map((id) => sdcpn.types.find((type) => type.id === id))
    .filter((type) => type !== undefined);
  const [first, ...rest] = types;
  if (!first) {
    return [];
  }
  return first.elements
    .filter((element) =>
      rest.every((type) =>
        type.elements.some((other) => other.name === element.name),
      ),
    )
    .map((element) => ({ name: element.name, type: element.type }));
};
