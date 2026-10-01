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
  checks: Check[];
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
  const checks = Array.isArray(raw.checks)
    ? raw.checks.flatMap((check) => {
        const parsed = parseCheck(check);
        return parsed ? [parsed] : [];
      })
    : [];
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
    ...(typeof raw.code === "string" ? { code: raw.code } : {}),
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

const identifier = (name: string): string =>
  name.replace(/[^\p{L}\p{N}_]/gu, "");

/** The type's name as a variable for a "for every" body: its last word, lower case. */
const forEveryVariable = (net: SDCPN, typeId: string): string => {
  const name = net.types.find(({ id }) => id === typeId)?.name ?? "token";
  const last = name.trim().split(/\s+/).pop() ?? "token";
  return identifier(last).toLowerCase() || "token";
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
      return place ? `${identifier(place.name)}.count` : "?";
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
): string =>
  `${subjectExpression(net, constraint, check.subject)} ${
    check.op === "below" ? "<" : ">"
  } ${check.bound ?? "?"}`;

/** The one line a constraint's rows read as. `?` marks a slot not yet set. */
export const constraintCode = (
  net: SDCPN,
  constraint: ModelConstraint,
): string => {
  const joined = constraint.checks
    .map((check) => checkExpression(net, constraint, check))
    .join(constraint.join === "any" ? " || " : " && ");
  const body = constraint.trigger
    ? `implies(${checkExpression(net, constraint, constraint.trigger)}, ${joined})`
    : joined;
  const window = constraint.window
    ? constraint.window.kind === "between"
      ? `${constraint.window.from}, ${constraint.window.to}, `
      : `0, ${constraint.window.to}, `
    : "";
  const args =
    constraint.time === "until"
      ? `${window}${body}, ?`
      : constraint.time === "release"
        ? `${window}?, ${body}`
        : `${window}${body}`;
  const line = `${constraint.time}(${args})`;
  if (!constraint.forEvery) {
    return line;
  }
  const places = constraint.forEvery.placeIds
    .map((placeId) => {
      const place = net.places.find(({ id }) => id === placeId);
      return place ? `"${place.name}"` : "?";
    })
    .join(", ");
  const scope =
    constraint.forEvery.where === "reaches"
      ? `reaches([${places}])`
      : `[${places}]`;
  return `forEvery(${scope}, (${forEveryVariable(net, constraint.forEvery.typeId)}) => ${line})`;
};

/** The hover text on "For every", with the token type's name in place of "order". */
export const forEveryHint = (typeName: string): string => {
  const noun = typeName.trim().toLowerCase() || "token";
  return `Tracks one ${noun} across firings only if the net gives each ${noun} an ID. Without one, the check runs on whichever tokens are there.`;
};

/**
 * The unit shown after a check's bound. The net does not give fields a unit,
 * so a field named `age` reads as days.
 */
export const subjectUnit = (
  net: SDCPN,
  subject: CheckSubject | null,
): string | null => {
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
