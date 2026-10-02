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

export type TimeWord = "always" | "eventually" | "until" | "release";

export type CheckSubject = {
  /**
   * `placeTokens`: the token count of place `id`. `tokenField`: field `field`
   * of the token type of place `id`, or of type `id` under a "for every".
   * `metric`: the model metric `id`.
   */
  kind: "placeTokens" | "tokenField" | "metric";
  id: string;
  field?: string;
};

export type CheckOp = "below" | "above";

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
  always: "Always",
  eventually: "Eventually",
  until: "Until",
  release: "Release",
};

export const timeWordHint: Record<TimeWord, string> = {
  always: "Holds at every step, until the end of the run.",
  eventually: "Holds at least once before the end of the run.",
  until: "Holds until another condition becomes true, which must happen.",
  release:
    "One condition holds until another releases it, or to the end of the run.",
};

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
      raw.kind !== "metric")
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
    op: raw.op === "above" ? "above" : "below",
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

const timeWords: TimeWord[] = ["always", "eventually", "until", "release"];
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
  if (kind === "placeTokens" || kind === "metric") {
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
  time === "until" || time === "release";

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

export type RulePreset = { id: string; label: string; hint: string };

export const rulePresets: RulePreset[] = [
  { id: "blank", label: "Blank", hint: "build the rule yourself" },
  { id: "always", label: "Always X", hint: "X holds at every step" },
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
  { id: "precedence", label: "Y only after X", hint: "precedence" },
];

const presetShape = (id: string): Partial<ModelConstraint> => {
  switch (id) {
    case "once":
      return { time: "eventually", checks: [emptyCheck()] };
    case "response":
      return {
        time: "always",
        trigger: { ...emptyCheck(), op: "above", bound: 0 },
        checks: [
          {
            kind: "rule",
            time: "eventually",
            window: { kind: "within", to: 2 },
            checks: [{ ...emptyCheck(), op: "above", bound: 0 }],
          },
        ],
      };
    case "precedence":
      return {
        time: "until",
        checks: [{ ...emptyCheck(), op: "below", bound: 1 }],
        second: [{ ...emptyCheck(), op: "above", bound: 0 }],
      };
    default:
      return { time: "always", checks: [emptyCheck()] };
  }
};

/** The rule a preset starts from, with every subject empty. The name, scope, tolerance and mode stay. */
export const applyPreset = (
  constraint: ModelConstraint,
  id: string,
): ModelConstraint => {
  const {
    window: _window,
    join: _join,
    trigger: _trigger,
    second: _second,
    secondJoin: _secondJoin,
    code: _code,
    ...kept
  } = constraint;
  return { ...kept, ...presetShape(id), preset: id };
};

const subjectExpression = (
  net: SDCPN,
  constraint: ModelConstraint,
  subject: CheckSubject | null,
  bare = false,
): string => {
  if (!subject) {
    return "?";
  }
  switch (subject.kind) {
    case "placeTokens": {
      const place = net.places.find(({ id }) => id === subject.id);
      return place
        ? bare
          ? identifier(place.name)
          : `${identifier(place.name)}.count`
        : "?";
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
      return metric ? `metric("${metric.name}")` : "?";
    }
  }
};

const checkExpression = (
  net: SDCPN,
  constraint: ModelConstraint,
  check: Check,
  bare = false,
): string =>
  `${subjectExpression(net, constraint, check.subject, bare)} ${
    check.op === "below" ? "<" : ">"
  } ${check.bound ?? "?"}`;

const forEveryScope = (
  net: SDCPN,
  forEvery: NonNullable<ModelConstraint["forEvery"]>,
): string => {
  const places = forEvery.placeIds
    .map((placeId) => {
      const place = net.places.find(({ id }) => id === placeId);
      return place ? `"${place.name}"` : "?";
    })
    .join(", ");
  return forEvery.where === "reaches" ? `reaches([${places}])` : `[${places}]`;
};

const plainChecks = (items: RuleItem[]): Check[] =>
  items.filter((item): item is Check => !isNestedRule(item));

type RuleBody = Pick<
  ModelConstraint,
  "time" | "window" | "join" | "trigger" | "checks" | "second" | "secondJoin"
>;

const windowSuffix = (window: ConstraintWindow | undefined): string =>
  window
    ? `_[${window.kind === "between" ? window.from : 0} days,${window.to} days]`
    : "";

const joinText = (parts: string[], join: "all" | "any" | undefined): string =>
  parts.join(join === "any" ? " || " : " && ");

/** A place that must hold a token reads as its bare name; any other check as `Name < 20`. */
const modernCheck = (
  net: SDCPN,
  constraint: ModelConstraint,
  check: Check,
): string =>
  check.subject?.kind === "placeTokens" &&
  check.op === "above" &&
  check.bound === 0
    ? subjectExpression(net, constraint, check.subject, true)
    : checkExpression(net, constraint, check, true);

/**
 * A rule that holds another rule reads as `always (A --> eventually_[0 days,2 days] B)`:
 * the time word with its window, then the body, with `-->` after a trigger.
 */
const modernCode = (
  net: SDCPN,
  constraint: ModelConstraint,
  rule: RuleBody,
  top: boolean,
): string => {
  const item = (entry: RuleItem, wrap: boolean): string => {
    if (!isNestedRule(entry)) {
      return modernCheck(net, constraint, entry);
    }
    const text = modernCode(net, constraint, entry, false);
    return wrap ? `(${text})` : text;
  };
  const operand = (items: RuleItem[], join: "all" | "any" | undefined) => {
    const text = joinText(
      items.map((entry) => item(entry, items.length > 1)),
      join,
    );
    return items.length > 1 ? `(${text})` : text;
  };
  const word = `${rule.time}${windowSuffix(rule.window)}`;
  if (hasSecondSlot(rule.time)) {
    const second = rule.second && rule.second.length > 0 ? rule.second : [emptyCheck()];
    return `${operand(rule.checks, rule.join)} ${word} ${operand(second, rule.secondJoin)}`;
  }
  const joined = joinText(
    rule.checks.map((entry) => item(entry, rule.checks.length > 1)),
    rule.join,
  );
  const body = rule.trigger
    ? `${modernCheck(net, constraint, rule.trigger)} --> ${rule.checks.length > 1 ? `(${joined})` : joined}`
    : joined;
  return top || rule.trigger || rule.checks.length > 1
    ? `${word} (${body})`
    : `${word} ${body}`;
};

/** The one line a constraint's rows read as. `?` marks a slot not yet set. */
export const constraintCode = (
  net: SDCPN,
  constraint: ModelConstraint,
): string => {
  const scope = (inner: string) =>
    !constraint.forEvery
      ? inner
      : `forEvery(${forEveryScope(net, constraint.forEvery)}, (${forEveryVariable(net, constraint.forEvery.typeId)}) => ${inner})`;
  if (hasNestedRule(constraint)) {
    return scope(modernCode(net, constraint, constraint, true));
  }
  if (hasSecondSlot(constraint.time)) {
    const operand = (checks: Check[], join: "all" | "any" | undefined) => {
      const text = joinText(
        checks.map((check) => checkExpression(net, constraint, check, true)),
        join,
      );
      return checks.length > 1 ? `(${text})` : text;
    };
    const window = windowSuffix(constraint.window);
    return scope(
      `${operand(plainChecks(constraint.checks), constraint.join)} ${constraint.time}${window} ${operand(plainChecks(secondChecks(constraint)), constraint.secondJoin)}`,
    );
  }
  const joined = joinText(
    plainChecks(constraint.checks).map((check) =>
      checkExpression(net, constraint, check),
    ),
    constraint.join,
  );
  const body = constraint.trigger
    ? `implies(${checkExpression(net, constraint, constraint.trigger)}, ${joined})`
    : joined;
  const window = constraint.window
    ? constraint.window.kind === "between"
      ? `${constraint.window.from}, ${constraint.window.to}, `
      : `0, ${constraint.window.to}, `
    : "";
  return scope(`${constraint.time}(${window}${body})`);
};

/**
 * The text "Edit as code" starts from. A rule with a nested rule breaks after
 * each `-->` and indents the rest, so the editor never splits the arrow.
 */
export const constraintCodeText = (
  net: SDCPN,
  constraint: ModelConstraint,
): string => {
  const line = constraintCode(net, constraint);
  return hasNestedRule(constraint) ? line.replace(/ --> /g, " -->\n  ") : line;
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
