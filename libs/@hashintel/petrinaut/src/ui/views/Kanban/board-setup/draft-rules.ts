import type {
  SDCPN,
  StatusHighlight,
  StatusLabel,
  StatusView,
} from "@hashintel/petrinaut-core";

// Prototype: rules drafted on a status in board setup. A rule either
// highlights matching cards (saved as a status view highlight) or becomes
// its own status, inserted before its parent.

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
  /** Highlight colour. */
  color: string;
  /** Highlight glyph, from `HIGHLIGHT_ICONS`. */
  icon: HighlightIcon | null;
};

export const HIGHLIGHT_COLORS = [
  "#ea580c",
  "#dc2626",
  "#d97706",
  "#16a34a",
  "#2563eb",
  "#9333ea",
] as const;

export const HIGHLIGHT_ICONS = [
  "warning",
  "diamondExclamation",
  "clock",
  "lightning",
  "starFilled",
  "bell",
] as const;

export type HighlightIcon = (typeof HIGHLIGHT_ICONS)[number];

export const isHighlightIcon = (name: unknown): name is HighlightIcon =>
  HIGHLIGHT_ICONS.some((icon) => icon === name);

/** Prefix for status views that exist only in a compile request. */
export const DRAFT_VIEW_PREFIX = "__board-setup-draft__";
export const HIGHLIGHT_VIEW_ID = `${DRAFT_VIEW_PREFIX}highlights`;
export const anywhereViewId = (ruleId: string) =>
  `${DRAFT_VIEW_PREFIX}anywhere:${ruleId}`;
export const ruleViewId = (ruleId: string) =>
  `${DRAFT_VIEW_PREFIX}rule:${ruleId}`;

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

/** A condition in short human form, e.g. `damage_ratio ≥ 0.8`. */
export const describeCondition = (condition: string): string =>
  condition
    .replace(/\btoken\./g, "")
    .replace(/===/g, "=")
    .replace(/!==/g, "≠")
    .replace(/>=/g, "≥")
    .replace(/<=/g, "≤")
    .trim();

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

/** The rule alone, in its own places, so its matches can be compared. */
export const buildRuleView = (
  rule: DraftRule,
  labels: readonly StatusLabel[],
  trackedPlaceIds: ReadonlySet<string>,
  identityRef: string,
): StatusView | null => {
  const tokenCondition = buildConditionExpression(rule);
  if (tokenCondition === null) {
    return null;
  }
  const parent = labels.find((label) => label.id === rule.labelId);
  return {
    id: ruleViewId(rule.id),
    name: "Draft rule",
    identityRef,
    labels: [
      {
        id: rule.id,
        name: rule.id,
        displayColor: rule.color,
        places: getRulePlaceIds(rule, parent, trackedPlaceIds),
        tokenCondition,
      },
    ],
  };
};

/** Saved highlights as one view: first matching highlight wins. */
export const highlightsAsView = (
  highlights: readonly StatusHighlight[],
  identityRef: string,
): StatusView => ({
  id: HIGHLIGHT_VIEW_ID,
  name: "Highlights",
  identityRef,
  labels: highlights
    .filter((highlight) => highlight.tokenCondition.trim() !== "")
    .map((highlight) => ({
      id: highlight.id,
      name: highlight.id,
      displayColor: highlight.displayColor,
      places: highlight.places,
      tokenCondition: highlight.tokenCondition,
    })),
});

const OPERATOR_PATTERN = OPERATORS.map((operator) =>
  operator.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
)
  .sort((left, right) => right.length - left.length)
  .join("|");
const SIMPLE_CONDITION = new RegExp(
  `^token\\.([A-Za-z_][A-Za-z0-9_]*)\\s*(${OPERATOR_PATTERN})\\s*(-?[0-9.eE-]+|true|false|"[^"]*")$`,
);

const sameSet = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((id) => right.includes(id));

/** A saved highlight back into an editable rule. */
export const ruleFromHighlight = (
  highlight: StatusHighlight,
  labels: readonly StatusLabel[],
  trackedPlaceIds: ReadonlySet<string>,
): DraftRule => {
  const parent =
    labels.find((label) => label.id === highlight.statusLabelRef) ??
    labels.find((label) =>
      label.places.some((id) => highlight.places.includes(id)),
    ) ??
    labels[0];
  const own = parent?.places ?? [];
  const checks: RuleChecks =
    trackedPlaceIds.size > 0 && sameSet(highlight.places, [...trackedPlaceIds])
      ? "anywhere"
      : sameSet(highlight.places, own)
        ? "status"
        : "also";
  const match = SIMPLE_CONDITION.exec(highlight.tokenCondition.trim());
  const value = match?.[3] ?? "";
  return {
    id: highlight.id,
    labelId: parent?.id ?? "",
    name: highlight.name,
    field: match?.[1] ?? "",
    operator: (match?.[2] as RuleOperator | undefined) ?? ">=",
    value: value.startsWith('"') ? (JSON.parse(value) as string) : value,
    expression: match ? null : highlight.tokenCondition,
    checks,
    alsoPlaceIds:
      checks === "also"
        ? highlight.places.filter((id) => !own.includes(id))
        : [],
    color: highlight.displayColor,
    icon: isHighlightIcon(highlight.icon) ? highlight.icon : null,
  };
};

/** Finished rules as saved highlights, in priority order. */
export const highlightsFromRules = (
  rules: readonly DraftRule[],
  labels: readonly StatusLabel[],
  trackedPlaceIds: ReadonlySet<string>,
): StatusHighlight[] =>
  rules.flatMap((rule) => {
    const tokenCondition = buildConditionExpression(rule);
    if (tokenCondition === null) {
      return [];
    }
    const parent = labels.find((label) => label.id === rule.labelId);
    return [
      {
        id: rule.id,
        name: rule.name.trim() || "Flagged",
        displayColor: rule.color,
        ...(rule.icon ? { icon: rule.icon } : {}),
        ...(parent ? { statusLabelRef: parent.id } : {}),
        places: getRulePlaceIds(rule, parent, trackedPlaceIds),
        tokenCondition,
      },
    ];
  });

/** Moves a rule to just before another, so it wins when both match. */
export const moveRuleBefore = (
  rules: readonly DraftRule[],
  ruleId: string,
  beforeId: string,
): DraftRule[] => {
  const moving = rules.find((rule) => rule.id === ruleId);
  if (!moving) {
    return [...rules];
  }
  const rest = rules.filter((rule) => rule.id !== ruleId);
  const index = rest.findIndex((rule) => rule.id === beforeId);
  return index < 0
    ? [...rules]
    : [...rest.slice(0, index), moving, ...rest.slice(index)];
};

/** Attributes of the tracked token types, and whether every type has them. */
export const getCardFieldOptions = (
  sdcpn: SDCPN,
  trackedPlaceIds: ReadonlySet<string>,
  identityRef: string,
): { name: string; type: string; everywhere: boolean }[] => {
  const typeIds = new Set(
    sdcpn.places
      .filter((place) => trackedPlaceIds.has(place.id))
      .map((place) => place.colorId)
      .filter((id): id is string => typeof id === "string"),
  );
  const types = sdcpn.types.filter((type) => typeIds.has(type.id));
  const options: { name: string; type: string; everywhere: boolean }[] = [];
  for (const type of types) {
    for (const element of type.elements) {
      if (
        element.identityRef === identityRef ||
        options.some((option) => option.name === element.name)
      ) {
        continue;
      }
      options.push({
        name: element.name,
        type: element.type,
        everywhere: types.every((other) =>
          other.elements.some((candidate) => candidate.name === element.name),
        ),
      });
    }
  }
  return options;
};

/** Default card fields: the first number every tracked type carries. */
export const getDefaultCardFields = (
  options: readonly { name: string; type: string; everywhere: boolean }[],
): string[] => {
  const first = options.find(
    (option) =>
      option.everywhere &&
      (option.type === "real" || option.type === "integer"),
  );
  return first ? [first.name] : [];
};

/** `machine_damage_ratio` on a Machine card reads `damage ratio`. */
export const humanizeField = (name: string, identityName?: string): string => {
  const words = name.replace(/_/g, " ").trim();
  const prefix = identityName ? `${identityName.toLowerCase()} ` : "";
  return prefix && words.toLowerCase().startsWith(prefix)
    ? words.slice(prefix.length)
    : words;
};

export const formatFieldValue = (
  value: number | boolean | bigint | string | undefined,
): string => {
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return value === undefined ? "—" : String(value);
};
