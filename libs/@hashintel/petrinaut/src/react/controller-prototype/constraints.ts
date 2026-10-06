/**
 * Constraint prototype: the model-level constraints and the pure rules that
 * read them.
 *
 * A constraint is a rule about the whole net that experiments check and
 * controllers must respect. Constraints are kept in `SDCPN.metadata` under
 * {@link CONSTRAINTS_METADATA_KEY}, beside the controllers, so the prototype
 * needs no schema change. The code line is display only: its syntax is a
 * design inference, not an engine contract.
 */

import type { JsonValue, SDCPN } from "@hashintel/petrinaut-core";

export const CONSTRAINTS_METADATA_KEY = "constraintsPrototype";

export type TimeWord =
  | "always"
  | "never"
  | "eventually"
  | "atEnd"
  | "until"
  | "weakUntil"
  | "release";

export type CheckSubject = {
  /**
   * `placeTokens`: the token count of place `id`. `tokenField`: field `field`
   * of the token type of place `id`, or of type `id` under a "for every".
   * `metric`: the model metric `id`. `fires`: transition `id` fires.
   * `leaves`: a token leaves place `id`. Events have no comparison.
   */
  kind: "placeTokens" | "tokenField" | "metric" | "fires" | "leaves";
  id: string;
  field?: string;
};

export type CheckOp =
  | "below"
  | "atMost"
  | "above"
  | "atLeast"
  | "equals"
  | "not";

export const checkOps: CheckOp[] = [
  "below",
  "atMost",
  "above",
  "atLeast",
  "equals",
  "not",
];

export const checkOpLabel: Record<CheckOp, string> = {
  below: "is below",
  atMost: "is at most",
  above: "is above",
  atLeast: "is at least",
  equals: "equals",
  not: "is not",
};

export const checkOpSymbol: Record<CheckOp, string> = {
  below: "<",
  atMost: "≤",
  above: ">",
  atLeast: "≥",
  equals: "=",
  not: "≠",
};

const negatedOp: Record<CheckOp, CheckOp> = {
  below: "atLeast",
  atMost: "above",
  above: "atMost",
  atLeast: "below",
  equals: "not",
  not: "equals",
};

/** The comparison that holds exactly when this one does not. */
export const negateOp = (op: CheckOp): CheckOp => negatedOp[op];

export const isEventSubject = (subject: CheckSubject | null): boolean =>
  subject?.kind === "fires" || subject?.kind === "leaves";

export type Check = {
  subject: CheckSubject | null;
  op: CheckOp;
  bound: number | null;
};

export type ConstraintWindow =
  | { kind: "between"; from: number; to: number }
  | { kind: "within"; to: number };

/** A rule held inside another rule's check list, with its own time word and window. */
export type NestedRule = {
  kind: "rule";
  time: TimeWord;
  window?: ConstraintWindow;
  join?: "all" | "any";
  trigger?: Check;
  checks: RuleItem[];
  second?: RuleItem[];
  secondJoin?: "all" | "any";
};

export type RuleItem = Check | NestedRule;

export const isNestedRule = (item: RuleItem): item is NestedRule =>
  "kind" in item;

export type ConstraintMode =
  | "monitored"
  | "enforcedSoft"
  | "enforcedHard"
  | "stopEarly";

export type ModelConstraint = {
  id: string;
  name: string;
  forEvery?: { typeId: string; where: "in" | "reaches"; placeIds: string[] };
  time: TimeWord;
  /** In days. */
  window?: ConstraintWindow;
  join?: "all" | "any";
  trigger?: Check;
  checks: RuleItem[];
  /** The second operand of until and release. Kept, hidden, under other words. */
  second?: RuleItem[];
  secondJoin?: "all" | "any";
  /** The "Start from" choice last made. Editing the rows afterwards keeps it. */
  preset?: string;
  /** Set after "Edit as code"; it replaces the generated line. */
  code?: string;
  /** Percent of runs in which the rule must hold. */
  tolerance: number;
  mode: ConstraintMode;
};

export const timeWordLabel: Record<TimeWord, string> = {
  always: "always",
  never: "never",
  eventually: "eventually",
  atEnd: "at the end of the run",
  until: "until",
  weakUntil: "until, if ever",
  release: "release",
};

export const timeWordHint: Record<TimeWord, string> = {
  always: "Holds at every moment of the run, or of the window.",
  never: "Never happens during the run, or the window.",
  eventually: "Holds at least once during the run, or the window.",
  atEnd: "Checked once, when the run ends.",
  until: "Holds until the second condition happens, which must happen.",
  weakUntil:
    "Holds until the second condition happens. That may never happen.",
  release:
    "One condition holds until another releases it, or to the end of the run.",
};

/** Time words that take two operands around the word. */
export const takesWindow = (time: TimeWord): boolean => time !== "atEnd";

export const constraintModeLabel: Record<ConstraintMode, string> = {
  monitored: "Monitored",
  enforcedSoft: "Enforced · soft",
  enforcedHard: "Enforced · hard",
  stopEarly: "Stop the run early",
};

export const constraintModeHint: Record<ConstraintMode, string> = {
  monitored: "Every run completes. You see which runs failed.",
  enforcedSoft: "The optimiser prefers inputs that keep it, but may break it.",
  enforcedHard:
    "The optimiser rejects inputs that hold in under this share of runs.",
  stopEarly: "A failing run stops and counts as failed.",
};

/** The sentence under the "must hold in" line. The enforced modes reuse their hover text. */
export const constraintModeNote: Record<ConstraintMode, string> = {
  ...constraintModeHint,
  monitored: "A run that breaks this rule still finishes and counts as failed.",
  stopEarly: "A run that breaks this rule stops early and counts as failed.",
};

export const emptyCheck = (): Check => ({
  subject: null,
  op: "below",
  bound: null,
});

export const newConstraint = (id: string, name: string): ModelConstraint => ({
  id,
  name,
  time: "always",
  checks: [emptyCheck()],
  tolerance: 95,
  mode: "monitored",
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseSubject = (raw: unknown): CheckSubject | null => {
  if (
    !isRecord(raw) ||
    typeof raw.id !== "string" ||
    (raw.kind !== "placeTokens" &&
      raw.kind !== "tokenField" &&
      raw.kind !== "metric" &&
      raw.kind !== "fires" &&
      raw.kind !== "leaves")
  ) {
    return null;
  }
  return {
    kind: raw.kind,
    id: raw.id,
    ...(typeof raw.field === "string" ? { field: raw.field } : {}),
  };
};

const parseCheck = (raw: unknown): Check | null => {
  if (!isRecord(raw)) {
    return null;
  }
  return {
    subject: parseSubject(raw.subject),
    op: checkOps.find((op) => op === raw.op) ?? "below",
    bound: typeof raw.bound === "number" ? raw.bound : null,
  };
};

const parseWindow = (raw: unknown): ConstraintWindow | undefined => {
  if (!isRecord(raw) || typeof raw.to !== "number") {
    return undefined;
  }
  if (raw.kind === "within") {
    return { kind: "within", to: raw.to };
  }
  if (raw.kind === "between" && typeof raw.from === "number") {
    return { kind: "between", from: raw.from, to: raw.to };
  }
  return undefined;
};

const timeWords: TimeWord[] = [
  "always",
  "never",
  "eventually",
  "atEnd",
  "until",
  "weakUntil",
  "release",
];
const modes: ConstraintMode[] = [
  "monitored",
  "enforcedSoft",
  "enforcedHard",
  "stopEarly",
];

const parseItem = (raw: unknown): RuleItem | null => {
  if (!isRecord(raw) || raw.kind !== "rule") {
    return parseCheck(raw);
  }
  const window = parseWindow(raw.window);
  const trigger = parseCheck(raw.trigger);
  const checks = parseChecks(raw.checks);
  const second = parseChecks(raw.second);
  return {
    kind: "rule",
    time: timeWords.find((word) => word === raw.time) ?? "always",
    ...(window ? { window } : {}),
    ...(raw.join === "all" || raw.join === "any" ? { join: raw.join } : {}),
    ...(trigger ? { trigger } : {}),
    checks: checks.length > 0 ? checks : [emptyCheck()],
    ...(second.length > 0 ? { second } : {}),
    ...(raw.secondJoin === "all" || raw.secondJoin === "any"
      ? { secondJoin: raw.secondJoin }
      : {}),
  };
};

const parseChecks = (raw: unknown): RuleItem[] =>
  Array.isArray(raw)
    ? raw.flatMap((item) => {
        const parsed = parseItem(item);
        return parsed ? [parsed] : [];
      })
    : [];

const parseConstraint = (raw: unknown): ModelConstraint | null => {
  if (
    !isRecord(raw) ||
    typeof raw.id !== "string" ||
    typeof raw.name !== "string"
  ) {
    return null;
  }
  const forEvery = raw.forEvery;
  const window = parseWindow(raw.window);
  const trigger = parseCheck(raw.trigger);
  const checks = parseChecks(raw.checks);
  const second = parseChecks(raw.second);
  return {
    id: raw.id,
    name: raw.name,
    ...(isRecord(forEvery) &&
    typeof forEvery.typeId === "string" &&
    Array.isArray(forEvery.placeIds)
      ? {
          forEvery: {
            typeId: forEvery.typeId,
            where: forEvery.where === "reaches" ? "reaches" : "in",
            placeIds: forEvery.placeIds.filter(
              (id): id is string => typeof id === "string",
            ),
          },
        }
      : {}),
    time: timeWords.find((word) => word === raw.time) ?? "always",
    ...(window ? { window } : {}),
    ...(raw.join === "all" || raw.join === "any" ? { join: raw.join } : {}),
    ...(trigger ? { trigger } : {}),
    checks: checks.length > 0 ? checks : [emptyCheck()],
    ...(second.length > 0 ? { second } : {}),
    ...(raw.secondJoin === "all" || raw.secondJoin === "any"
      ? { secondJoin: raw.secondJoin }
      : {}),
    ...(typeof raw.code === "string" ? { code: raw.code } : {}),
    ...(typeof raw.preset === "string" ? { preset: raw.preset } : {}),
    tolerance: typeof raw.tolerance === "number" ? raw.tolerance : 95,
    mode: modes.find((mode) => mode === raw.mode) ?? "monitored",
  };
};

/** The net's constraints. Entries that do not parse are dropped. */
export const readConstraints = (sdcpn: SDCPN): ModelConstraint[] => {
  const raw = sdcpn.metadata?.[CONSTRAINTS_METADATA_KEY];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((entry) => {
    const parsed = parseConstraint(entry);
    return parsed ? [parsed] : [];
  });
};

export const writeConstraints = (
  draft: SDCPN,
  constraints: ModelConstraint[],
): void => {
  draft.metadata = {
    ...draft.metadata,
    [CONSTRAINTS_METADATA_KEY]: constraints as unknown as JsonValue,
  };
};

/** Where a constraint may point a check. */
export type SubjectOption = { value: string; text: string };
export type SubjectGroup = {
  id: string;
  label: string;
  items: SubjectOption[];
};

/** The select value that stands for a subject. */
export const subjectValue = (subject: CheckSubject): string =>
  subject.kind === "tokenField"
    ? `field:${subject.id}:${subject.field ?? ""}`
    : `${subject.kind}:${subject.id}`;

export const parseSubjectValue = (value: string): CheckSubject | null => {
  const [kind, id, ...rest] = value.split(":");
  if (!id) {
    return null;
  }
  if (
    kind === "placeTokens" ||
    kind === "metric" ||
    kind === "fires" ||
    kind === "leaves"
  ) {
    return { kind, id };
  }
  if (kind === "field") {
    return { kind: "tokenField", id, field: rest.join(":") };
  }
  return null;
};

/**
 * The subjects a check can read, grouped as the picker shows them. Under a
 * "for every", a check reads the fields of that token type alone.
 */
export const subjectGroups = (
  net: SDCPN,
  forEvery?: ModelConstraint["forEvery"],
): SubjectGroup[] => {
  if (forEvery) {
    const type = net.types.find(({ id }) => id === forEvery.typeId);
    return [
      {
        id: "fields",
        label: "Token fields",
        items: (type?.elements ?? []).map((element) => ({
          value: subjectValue({
            kind: "tokenField",
            id: forEvery.typeId,
            field: element.elementId,
          }),
          text: element.name,
        })),
      },
    ];
  }
  const typeOf = (colorId: string | null | undefined) =>
    net.types.find(({ id }) => id === colorId);
  return [
    {
      id: "tokens",
      label: "Place tokens",
      items: net.places.map((place) => ({
        value: subjectValue({ kind: "placeTokens", id: place.id }),
        text: `${place.name} · tokens`,
      })),
    },
    {
      id: "fields",
      label: "Token fields",
      items: net.places.flatMap((place) =>
        (typeOf(place.colorId)?.elements ?? []).map((element) => ({
          value: subjectValue({
            kind: "tokenField",
            id: place.id,
            field: element.elementId,
          }),
          text: `${place.name} · ${element.name}`,
        })),
      ),
    },
    {
      id: "metrics",
      label: "Metrics",
      items: (net.metrics ?? []).map((metric) => ({
        value: subjectValue({ kind: "metric", id: metric.id }),
        text: metric.name,
      })),
    },
    {
      id: "events",
      label: "Events",
      items: [
        ...net.transitions.map((transition) => ({
          value: subjectValue({ kind: "fires", id: transition.id }),
          text: `${transition.name} fires`,
        })),
        ...net.places.map((place) => ({
          value: subjectValue({ kind: "leaves", id: place.id }),
          text: `a token leaves ${place.name}`,
        })),
      ],
    },
  ].filter((group) => group.items.length > 0);
};

/** A subject's row text inside its kind tab, which already says "tokens". */
export const subjectRowText = (groupId: string, text: string): string =>
  groupId === "tokens" ? text.replace(/ · tokens$/, "") : text;

const identifier = (name: string): string =>
  name.replace(/[^\p{L}\p{N}_]/gu, "");

/** The type's name as a variable for a "for every" body: its last word, lower case. */
const forEveryVariable = (net: SDCPN, typeId: string): string => {
  const name = net.types.find(({ id }) => id === typeId)?.name ?? "token";
  const last = name.trim().split(/\s+/).pop() ?? "token";
  return identifier(last).toLowerCase() || "token";
};

/** Until and release read as two operands around the word. */
export const hasSecondSlot = (time: TimeWord): boolean =>
  time === "until" || time === "weakUntil" || time === "release";

/** The second operand's checks; one empty check stands in for a slot not yet filled. */
export const secondChecks = (constraint: ModelConstraint): RuleItem[] =>
  constraint.second && constraint.second.length > 0
    ? constraint.second
    : [emptyCheck()];

const mapNested = (
  rule: NestedRule,
  change: (check: Check) => Check,
): NestedRule => ({
  ...rule,
  checks: mapChecks(rule.checks, change),
  ...(rule.second ? { second: mapChecks(rule.second, change) } : {}),
  ...(rule.trigger ? { trigger: change(rule.trigger) } : {}),
});

/** Changes every plain check in the items, at any depth. */
export const mapChecks = (
  items: RuleItem[],
  change: (check: Check) => Check,
): RuleItem[] =>
  items.map((item) =>
    isNestedRule(item) ? mapNested(item, change) : change(item),
  );

/** Changes every check of a constraint, including its trigger and any nested rule. */
export const mapConstraintChecks = (
  constraint: ModelConstraint,
  change: (check: Check) => Check,
): ModelConstraint => ({
  ...constraint,
  checks: mapChecks(constraint.checks, change),
  second: constraint.second && mapChecks(constraint.second, change),
  trigger: constraint.trigger && change(constraint.trigger),
});

/** The first plain check, taking the list in order and going into a nested rule where it comes. */
export const firstCheck = (items: RuleItem[]): Check | undefined => {
  for (const item of items) {
    const found = isNestedRule(item) ? firstCheck(item.checks) : item;
    if (found) {
      return found;
    }
  }
  return undefined;
};

const itemsDepth = (items: RuleItem[]): number =>
  1 +
  Math.max(
    0,
    ...items.map((item) =>
      isNestedRule(item)
        ? itemsDepth([...item.checks, ...(item.second ?? [])])
        : 0,
    ),
  );

/** How many rules sit inside each other: a flat rule is 1, one nested rule makes 2. */
export const ruleDepth = (constraint: ModelConstraint): number =>
  itemsDepth([...constraint.checks, ...(constraint.second ?? [])]);

/** The most levels the rows draw. Deeper rules, which data can hold, show as code. */
export const MAX_ROW_DEPTH = 2;

export const hasNestedRule = (constraint: ModelConstraint): boolean =>
  [...constraint.checks, ...(constraint.second ?? [])].some(isNestedRule);

export const newNestedRule = (): NestedRule => ({
  kind: "rule",
  time: "eventually",
  checks: [emptyCheck()],
});

export type RulePattern = {
  id: string;
  label: string;
  hint: string;
};

/** The pattern menu. Custom comes last and opens the free builder. */
export const rulePatterns: RulePattern[] = [
  { id: "always", label: "Always X", hint: "X holds at every moment" },
  { id: "never", label: "Never X", hint: "X never happens" },
  {
    id: "once",
    label: "X at least once",
    hint: "eventually, optionally within T",
  },
  {
    id: "response",
    label: "Whenever X, then Y within T",
    hint: "machines come back within 2 days",
  },
  { id: "precedence", label: "Y only after X", hint: "Y waits for X" },
  { id: "custom", label: "Custom", hint: "build the rule freely" },
];

const plainOnly = (items: RuleItem[] | undefined): boolean =>
  (items ?? []).every((item) => !isNestedRule(item));

/**
 * The pattern a rule matches, read from its shape. Anything else is Custom.
 * Choosing Custom sticks until another pattern is chosen.
 */
export const rulePatternOf = (constraint: ModelConstraint): string => {
  const { time, trigger, checks, second } = constraint;
  if (constraint.code !== undefined || constraint.preset === "custom") {
    return "custom";
  }
  if (!trigger && plainOnly(checks) && checks.length === 1) {
    if (time === "always") {
      return "always";
    }
    if (time === "never") {
      return "never";
    }
    if (time === "eventually") {
      return "once";
    }
  }
  const only = checks[0];
  if (
    time === "always" &&
    trigger &&
    checks.length === 1 &&
    only &&
    isNestedRule(only) &&
    only.time === "eventually" &&
    plainOnly(only.checks) &&
    only.checks.length === 1
  ) {
    return "response";
  }
  if (
    time === "weakUntil" &&
    !trigger &&
    checks.length === 1 &&
    (second?.length ?? 0) === 1 &&
    plainOnly(checks) &&
    plainOnly(second)
  ) {
    return "precedence";
  }
  return "custom";
};

type PatternSlots = {
  /** The pattern's X: what holds, or what triggers. */
  x: Check | null;
  /** The pattern's Y: what must follow, or what waits. */
  y: Check | null;
  /** The whole rule's window, as Always, Never and once take it. */
  window?: ConstraintWindow;
  /** T in "Y within T": the nested rule's window. It stays with the response. */
  within?: ConstraintWindow;
};

const firstPlain = (items: RuleItem[] | undefined): Check | null =>
  (items ?? []).find((item): item is Check => !isNestedRule(item)) ?? null;

/**
 * What a rule puts in each pattern slot. A response reads X from "if" and Y
 * from the nested rule. "Y only after X" reads Y from the first slot and X
 * from the second. Any other rule reads X from its first condition.
 */
const patternSlots = (constraint: ModelConstraint): PatternSlots => {
  switch (rulePatternOf({ ...constraint, preset: undefined })) {
    case "response": {
      const nested = constraint.checks.find(isNestedRule);
      return {
        x: constraint.trigger ?? null,
        y: firstPlain(nested?.checks),
        within: nested?.window,
      };
    }
    case "precedence":
      return {
        x: firstPlain(constraint.second),
        y: firstPlain(constraint.checks),
        window: constraint.window,
      };
    default: {
      const x = constraint.trigger ?? firstCheck(constraint.checks) ?? null;
      const all: Check[] = [];
      mapConstraintChecks(constraint, (check) => {
        all.push(check);
        return check;
      });
      return {
        x,
        y: all.find((check) => check !== x && check.subject) ?? null,
        window: constraint.window,
      };
    }
  }
};

/** A slot's subject with the pattern's own comparison. */
const asEvent = (check: Check | null, op: CheckOp, bound: number): Check => ({
  subject: check?.subject ?? null,
  op,
  bound,
});

/**
 * The rule a pattern gives. What fills X, Y and T carries into the new
 * pattern's slots, so switching patterns keeps what maps. A full condition
 * ("Backorders is below 20") keeps its comparison where the slot takes one.
 * Custom keeps the rule as it is.
 */
export const applyPattern = (
  constraint: ModelConstraint,
  id: string,
): ModelConstraint => {
  if (id === "custom") {
    return { ...constraint, preset: "custom" };
  }
  const slots = patternSlots(constraint);
  // An empty condition fills no slot, so the pattern's own comparison shows.
  const x = slots.x?.subject ? slots.x : null;
  const y = slots.y?.subject ? slots.y : null;
  const window = slots.window;
  const {
    window: _window,
    join: _join,
    trigger: _trigger,
    second: _second,
    secondJoin: _secondJoin,
    code: _code,
    ...kept
  } = constraint;
  const held = (fallback: CheckOp): Check =>
    x ? { ...x } : { subject: null, op: fallback, bound: null };
  const withWindow = window ? { window } : {};
  switch (id) {
    case "never":
      return {
        ...kept,
        ...withWindow,
        time: "never",
        checks: [held("above")],
        preset: id,
      };
    case "once":
      return {
        ...kept,
        ...withWindow,
        time: "eventually",
        checks: [held("above")],
        preset: id,
      };
    case "response":
      return {
        ...kept,
        time: "always",
        trigger: x ? { ...x } : asEvent(null, "above", 0),
        checks: [
          {
            kind: "rule",
            time: "eventually",
            window: slots.within ?? { kind: "within", to: 2 },
            checks: [y ? { ...y } : asEvent(null, "above", 0)],
          },
        ],
        preset: id,
      };
    case "precedence":
      return {
        ...kept,
        ...withWindow,
        time: "weakUntil",
        checks: [asEvent(y, "atMost", 0)],
        second: [asEvent(x, "above", 0)],
        preset: id,
      };
    default:
      return {
        ...kept,
        ...withWindow,
        time: "always",
        checks: [held("below")],
        preset: id,
      };
  }
};

const subjectExpression = (
  net: SDCPN,
  constraint: ModelConstraint,
  subject: CheckSubject | null,
): string => {
  if (!subject) {
    return "?";
  }
  switch (subject.kind) {
    case "placeTokens": {
      const place = net.places.find(({ id }) => id === subject.id);
      return place ? identifier(place.name) : "?";
    }
    case "tokenField": {
      if (constraint.forEvery) {
        const element = net.types
          .find(({ id }) => id === subject.id)
          ?.elements.find(({ elementId }) => elementId === subject.field);
        return element
          ? `${forEveryVariable(net, subject.id)}.${identifier(element.name)}`
          : "?";
      }
      const place = net.places.find(({ id }) => id === subject.id);
      const element = net.types
        .find(({ id }) => id === place?.colorId)
        ?.elements.find(({ elementId }) => elementId === subject.field);
      return place && element
        ? `${identifier(place.name)}.${identifier(element.name)}`
        : "?";
    }
    case "metric": {
      const metric = net.metrics?.find(({ id }) => id === subject.id);
      return metric ? identifier(metric.name) : "?";
    }
    case "fires": {
      const transition = net.transitions.find(({ id }) => id === subject.id);
      return transition ? `fired(${identifier(transition.name)})` : "?";
    }
    case "leaves": {
      const place = net.places.find(({ id }) => id === subject.id);
      return place ? `left(${identifier(place.name)})` : "?";
    }
  }
};

const checkExpression = (
  net: SDCPN,
  constraint: ModelConstraint,
  check: Check,
  negate = false,
): string => {
  const subject = subjectExpression(net, constraint, check.subject);
  if (isEventSubject(check.subject)) {
    return negate ? `¬${subject}` : subject;
  }
  const op = negate ? negatedOp[check.op] : check.op;
  return `${subject} ${checkOpSymbol[op]} ${check.bound ?? "?"}`;
};

const forEveryScope = (
  net: SDCPN,
  forEvery: NonNullable<ModelConstraint["forEvery"]>,
): string =>
  forEvery.placeIds
    .map((placeId) => {
      const place = net.places.find(({ id }) => id === placeId);
      return place ? identifier(place.name) : "?";
    })
    .join(" ∪ ") || "?";

type RuleBody = Pick<
  ModelConstraint,
  "time" | "window" | "join" | "trigger" | "checks" | "second" | "secondJoin"
>;

const windowSuffix = (window: ConstraintWindow | undefined): string =>
  window
    ? `[${window.kind === "between" ? window.from : 0},${window.to}]`
    : "";

const operatorOf: Record<TimeWord, string> = {
  always: "G",
  never: "G",
  eventually: "F",
  atEnd: "F",
  until: "U",
  weakUntil: "W",
  release: "R",
};

/**
 * A rule in metric temporal logic, the notation Yannis writes rules in:
 * `G (MachineDown > 0 → F[0,2] (MachineUp > 0))`. Never X reads as
 * always-not-X with the comparisons flipped, so the line needs no NOT.
 */
const mtl = (
  net: SDCPN,
  constraint: ModelConstraint,
  rule: RuleBody,
): string => {
  const negate = rule.time === "never";
  const item = (entry: RuleItem): string =>
    isNestedRule(entry)
      ? `(${mtl(net, constraint, entry)})`
      : checkExpression(net, constraint, entry, negate);
  const group = (items: RuleItem[], join: "all" | "any" | undefined) => {
    // Flipping every comparison under "never" swaps and/or (De Morgan).
    const any = negate ? join !== "any" : join === "any";
    const text = items.map(item).join(any ? " ∨ " : " ∧ ");
    return items.length > 1 ? `(${text})` : text;
  };
  const window = rule.time === "atEnd" ? "[T,T]" : windowSuffix(rule.window);
  const word = `${operatorOf[rule.time]}${window}`;
  if (hasSecondSlot(rule.time)) {
    const second =
      rule.second && rule.second.length > 0 ? rule.second : [emptyCheck()];
    return `${group(rule.checks, rule.join)} ${word} ${group(second, rule.secondJoin)}`;
  }
  const body = rule.trigger
    ? `${checkExpression(net, constraint, rule.trigger)} → ${group(rule.checks, rule.join)}`
    : group(rule.checks, rule.join);
  return body.startsWith("(") && !rule.trigger
    ? `${word} ${body}`
    : `${word} (${body})`;
};

/** The one line a constraint's rows read as, in MTL. `?` marks a slot not yet set. */
export const constraintCode = (
  net: SDCPN,
  constraint: ModelConstraint,
): string => {
  const line = mtl(net, constraint, constraint);
  if (!constraint.forEvery) {
    return line;
  }
  const variable = forEveryVariable(net, constraint.forEvery.typeId);
  return `∀ ${variable} ∈ ${forEveryScope(net, constraint.forEvery)}: ${line}`;
};

/** The text "Edit as code" starts from. A rule with a nested rule breaks after each `→`. */
export const constraintCodeText = (
  net: SDCPN,
  constraint: ModelConstraint,
): string => {
  const line = constraintCode(net, constraint);
  return hasNestedRule(constraint) ? line.replace(/ → /g, " →\n  ") : line;
};

type Range = {
  low: number;
  lowOpen: boolean;
  high: number;
  highOpen: boolean;
  not: number[];
};

const narrow = (range: Range, check: Check, bound: number): Range => {
  const raiseLow = (current: Range, value: number, open: boolean): Range =>
    value > current.low || (value === current.low && open)
      ? { ...current, low: value, lowOpen: open }
      : current;
  const dropHigh = (current: Range, value: number, open: boolean): Range =>
    value < current.high || (value === current.high && open)
      ? { ...current, high: value, highOpen: open }
      : current;
  switch (check.op) {
    case "below":
      return dropHigh(range, bound, true);
    case "atMost":
      return dropHigh(range, bound, false);
    case "above":
      return raiseLow(range, bound, true);
    case "atLeast":
      return raiseLow(range, bound, false);
    case "equals":
      return dropHigh(raiseLow(range, bound, false), bound, false);
    case "not":
      return { ...range, not: [...range.not, bound] };
  }
};

/**
 * True when conditions joined by "and" on one subject leave no value that
 * meets them all, such as "is below 10 and is above 20".
 */
export const contradictionIn = (
  items: RuleItem[],
  join: "all" | "any" | undefined,
): boolean => {
  if (join === "any") {
    return false;
  }
  const ranges = new Map<string, Range>();
  for (const item of items) {
    if (
      isNestedRule(item) ||
      !item.subject ||
      item.bound === null ||
      isEventSubject(item.subject)
    ) {
      continue;
    }
    const key = subjectValue(item.subject);
    const range = ranges.get(key) ?? {
      low: -Infinity,
      lowOpen: true,
      high: Infinity,
      highOpen: true,
      not: [],
    };
    ranges.set(key, narrow(range, item, item.bound));
  }
  return [...ranges.values()].some(
    (range) =>
      range.low > range.high ||
      (range.low === range.high &&
        (range.lowOpen || range.highOpen || range.not.includes(range.low))),
  );
};

/** The hover text on "For every", with the token type's name in place of "order". */
export const forEveryHint = (typeName: string): string => {
  const noun = typeName.trim().toLowerCase() || "token";
  return `Tracks one ${noun} across firings only if the net gives each ${noun} an ID. Without one, the check runs on whichever tokens are there.`;
};

/**
 * The unit shown inside a check's bound: place tokens count tokens, and a
 * metric has none. The net does not give fields a unit, so a field named `age`
 * reads as days.
 */
export const subjectUnit = (
  net: SDCPN,
  subject: CheckSubject | null,
): string | null => {
  if (subject?.kind === "placeTokens") {
    return "tokens";
  }
  if (subject?.kind !== "tokenField") {
    return null;
  }
  const place = net.places.find(({ id }) => id === subject.id);
  const type = net.types.find(
    ({ id }) => id === subject.id || id === place?.colorId,
  );
  const element = type?.elements.find(
    ({ elementId }) => elementId === subject.field,
  );
  return element?.name === "age" ? "days" : null;
};
