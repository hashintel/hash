import { payloadKindTraits } from "@local/hash-isomorphic-utils/flows/types";

import type { EntityProperty, PropertyValueKind } from "./condition-properties";
import type { BaseUrl } from "@blockprotocol/type-system";
import type { PayloadKind } from "@local/hash-isomorphic-utils/flows/types";

/** What a condition checks, a sort sorts by or an aggregation reads: the value itself, or a property of its entity. */
export type ConditionTarget = {
  /** Identifies the target among a step's by its subject: "input", or "property:" and the property's base URL. */
  key: string;
  label: string;
  subject:
    | { kind: "input" }
    | { kind: "entityProperty"; propertyTypeBaseUrl: BaseUrl };
  valueKind: PropertyValueKind;
};

const rowKinds = ["Text", "Number", "Date", "DateTime", "Boolean"] as const;

type RowKind = (typeof rowKinds)[number];

const isRowKind = (kind: PayloadKind): kind is RowKind =>
  (rowKinds as readonly PayloadKind[]).includes(kind);

const subjectKeyOf = (subject: ConditionTarget["subject"]) =>
  subject.kind === "input"
    ? "input"
    : `property:${subject.propertyTypeBaseUrl}`;

/**
 * What can be read from a value of `kind`: the value itself when it's text, a number, a date, a date and time or
 * true/false, or the given properties when it's an entity. Nothing for any other kind, or nothing connected.
 */
export const getConditionTargets = ({
  kind,
  valueLabel,
  properties,
}: {
  kind: PayloadKind | null;
  /** What the value itself is called, e.g. "Value" or "Item". */
  valueLabel: string;
  properties: EntityProperty[];
}): ConditionTarget[] => {
  if (!kind) {
    return [];
  }

  if (isRowKind(kind)) {
    const subject = { kind: "input" } as const;

    return [
      {
        key: subjectKeyOf(subject),
        label: valueLabel,
        subject,
        valueKind: { kind },
      },
    ];
  }

  return "entity" in payloadKindTraits[kind]
    ? properties.map(({ baseUrl, title, valueKind }) => {
        const subject = {
          kind: "entityProperty",
          propertyTypeBaseUrl: baseUrl,
        } as const;

        return { key: subjectKeyOf(subject), label: title, subject, valueKind };
      })
    : [];
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const hasOnlyKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).every((key) => keys.includes(key));

/**
 * The kind a saved condition leaf, sort key or aggregation was built for, from its subject: the value's own kind, or an
 * entity's. Lets it show while nothing is connected to what it reads.
 */
export const getSavedSubjectKind = (saved: unknown): PayloadKind | null => {
  const subject = isRecord(saved) ? saved.subject : undefined;

  if (!isRecord(subject)) {
    return null;
  }

  if (subject.kind === "entityProperty") {
    return "EntityId";
  }

  return subject.kind === "input" &&
    typeof subject.payloadKind === "string" &&
    isRowKind(subject.payloadKind as PayloadKind)
    ? (subject.payloadKind as PayloadKind)
    : null;
};

/** The target a saved subject names, if it's one of `targets` and of the kind the target's value is. */
export const readTarget = (
  subject: unknown,
  targets: ReadonlyMap<string, ConditionTarget>,
) => {
  if (!isRecord(subject)) {
    return undefined;
  }

  const key =
    subject.kind === "input" && hasOnlyKeys(subject, ["kind", "payloadKind"])
      ? "input"
      : subject.kind === "entityProperty" &&
          hasOnlyKeys(subject, [
            "kind",
            "payloadKind",
            "propertyTypeBaseUrl",
          ]) &&
          typeof subject.propertyTypeBaseUrl === "string"
        ? `property:${subject.propertyTypeBaseUrl}`
        : undefined;
  const target = key === undefined ? undefined : targets.get(key);

  return target && subject.payloadKind === target.valueKind.kind
    ? target
    : undefined;
};

/** The subject a step reads for a target, with the kind of its value. */
export const toSubject = (target: ConditionTarget) => ({
  ...target.subject,
  payloadKind: target.valueKind.kind,
});
