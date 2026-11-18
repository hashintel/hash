import { format, isValid, parseISO } from "date-fns";
import { upperFirst } from "lodash";

import { isStoredPayloadRef } from "@local/hash-isomorphic-utils/flows/types";

import { getKindLabel, withArticle } from "../../shared/value-display";

import type { EntityId } from "@blockprotocol/type-system";
import type {
  Payload,
  PayloadKind,
  PayloadKindValues,
} from "@local/hash-isomorphic-utils/flows/types";

/** How a value a step got or gave shows in its run's panel. */
export type ValueDisplay =
  /** As text: one line per value, e.g. for a list of numbers. */
  | { kind: "inline"; values: string[] }
  /** As a row per entity, a file being an entity too. */
  | { kind: "entities"; entityIds: EntityId[] }
  /** Only by what it is, e.g. "An entity query", where its value means little to read. */
  | { kind: "described"; text: string };

export type ListDisplay = Exclude<ValueDisplay, { kind: "described" }>;

export const getListLength = (list: ListDisplay) =>
  list.kind === "inline" ? list.values.length : list.entityIds.length;

export const countItems = (count: number) =>
  `${count} ${count === 1 ? "item" : "items"}`;

const formatDate = (value: string, pattern: string) => {
  const date = parseISO(value);

  return isValid(date) ? format(date, pattern) : value;
};

/**
 * How each kind's value shows: as text, as the entity it names, or, for `null`, only described. Every kind needs a
 * decision, so a new one can't show as something it isn't.
 */
const kindDisplays: {
  [Kind in PayloadKind]:
    | { text: (value: PayloadKindValues[Kind]) => string }
    | { entityId: (value: PayloadKindValues[Kind]) => EntityId }
    | null;
} = {
  ActorType: { text: upperFirst },
  Aggregation: null,
  Boolean: { text: (value) => (value ? "True" : "False") },
  Date: { text: (value) => formatDate(value, "d MMM yyyy") },
  DateTime: { text: (value) => formatDate(value, "d MMM yyyy, HH:mm") },
  Duration: {
    text: ({ amount, unit }) =>
      `${amount} ${amount === 1 ? unit.slice(0, -1) : unit}`,
  },
  EntityId: { entityId: (value) => value },
  EntityQuery: null,
  FailedEntityProposal: null,
  FilterCondition: null,
  FormattedText: { text: ({ content }) => content },
  GoogleAccountId: { text: (value) => value },
  GoogleSheet: {
    text: (sheet) =>
      "spreadsheetId" in sheet ? sheet.spreadsheetId : sheet.newSheetName,
  },
  Number: { text: String },
  PersistedEntityMetadata: { entityId: ({ entityId }) => entityId },
  PropertyObjectWithMetadata: null,
  PropertyPatch: null,
  ProposedEntity: null,
  ProposedEntityWithResolvedLinks: null,
  SortKey: null,
  Text: { text: (value) => value },
  VersionedUrl: { text: (value) => value },
  WebPage: { text: ({ title, url }) => title || url },
  WebSearchResult: { text: ({ title, url }) => title || url },
};

/**
 * How a value shows. One read from storage, as a step's inputs can be, holds only a reference, so it's described: a
 * list by its length.
 */
export const getValueDisplay = ({ kind, value }: Payload): ValueDisplay => {
  /* The kind and the value's type go together, which the lookup can't tell. */
  const display = kindDisplays[kind] as
    | { text: (value: unknown) => string }
    | { entityId: (value: unknown) => EntityId }
    | null;
  const values: unknown[] = Array.isArray(value) ? value : [value];

  if (display && !values.some(isStoredPayloadRef)) {
    return "entityId" in display
      ? { kind: "entities", entityIds: values.map(display.entityId) }
      : { kind: "inline", values: values.map(display.text) };
  }

  const count = isStoredPayloadRef(value)
    ? "length" in value
      ? value.length
      : null
    : Array.isArray(value)
      ? value.length
      : null;

  return {
    kind: "described",
    text:
      count === null
        ? upperFirst(
            withArticle(getKindLabel({ payloadKind: kind, array: false })),
          )
        : countItems(count),
  };
};

/* About twice what long text shows of its start, so that asking for the rest is worth it. */
const longTextCharacters = 600;
const longTextLines = 12;

/**
 * Whether text is long enough to show only its start until the rest is asked for, e.g. a prompt or a report, so that
 * what's under it in the panel stays within reach.
 */
export const isLongText = (text: string) =>
  text.length > longTextCharacters || text.split("\n").length > longTextLines;

const peekLength = 5;

/** How many of a list's values the panel or the column shows, and the "Show all N" after them, if any. */
export const getListPeek = (length: number) => ({
  shown: Math.min(length, peekLength),
  showAll: length > peekLength ? length : null,
});

/** A value's kind, and whether it's a list, as the editor names a value's type. */
export const getPayloadShape = ({ kind, value }: Payload) => ({
  payloadKind: kind,
  array: Array.isArray(value) || (isStoredPayloadRef(value) && value.array),
});
