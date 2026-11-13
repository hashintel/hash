import { getNameLabel } from "./name-label";

import type { IconName } from "@hashintel/ds-components";
import type {
  FlowInputDefinition,
  PayloadKind,
} from "@local/hash-isomorphic-utils/flows/types";

/** A flow input as people read it: its label, or else its name. */
export const getFlowInputLabel = ({
  label,
  name,
}: Pick<FlowInputDefinition, "label" | "name">) => label ?? getNameLabel(name);

const kindDisplays: Record<
  PayloadKind,
  { label: string; plural: string; icon: IconName }
> = {
  ActorType: { label: "actor type", plural: "actor types", icon: "user" },
  Aggregation: {
    label: "aggregation",
    plural: "aggregations",
    icon: "chartBar",
  },
  Boolean: {
    label: "true or false",
    plural: "true or false values",
    icon: "squareCheck",
  },
  Date: { label: "date", plural: "dates", icon: "calendar" },
  DateTime: {
    label: "date and time",
    plural: "dates and times",
    icon: "calendarClock",
  },
  Duration: { label: "duration", plural: "durations", icon: "clock" },
  EntityId: { label: "entity", plural: "entities", icon: "cube" },
  EntityQuery: {
    label: "entity query",
    plural: "entity queries",
    icon: "search",
  },
  FailedEntityProposal: {
    label: "failed entity proposal",
    plural: "failed entity proposals",
    icon: "warning",
  },
  FilterCondition: {
    label: "filter condition",
    plural: "filter conditions",
    icon: "filter",
  },
  FormattedText: {
    label: "formatted text",
    plural: "formatted text",
    icon: "fileLines",
  },
  GoogleAccountId: {
    label: "Google account",
    plural: "Google accounts",
    icon: "user",
  },
  GoogleSheet: {
    label: "Google Sheet",
    plural: "Google Sheets",
    icon: "fileSpreadsheet",
  },
  Number: { label: "number", plural: "numbers", icon: "oneHundred" },
  PersistedEntityMetadata: {
    label: "saved entity",
    plural: "saved entities",
    icon: "cube",
  },
  PropertyObjectWithMetadata: {
    label: "entity properties",
    plural: "entity properties",
    icon: "bracketsCurly",
  },
  PropertyPatch: {
    label: "property change",
    plural: "property changes",
    icon: "edit",
  },
  ProposedEntity: {
    label: "proposed entity",
    plural: "proposed entities",
    icon: "cube",
  },
  ProposedEntityWithResolvedLinks: {
    label: "proposed entity",
    plural: "proposed entities",
    icon: "cube",
  },
  SortKey: { label: "sort order", plural: "sort orders", icon: "sortDown" },
  Text: { label: "text", plural: "text", icon: "text" },
  VersionedUrl: { label: "type", plural: "types", icon: "shapes" },
  WebPage: { label: "web page", plural: "web pages", icon: "file" },
  WebSearchResult: {
    label: "web search result",
    plural: "web search results",
    icon: "search",
  },
};

/** The kind of a value in lower case, e.g. "date" or, for an array, "list of dates". */
export const getKindLabel = ({
  payloadKind,
  array,
}: {
  payloadKind: PayloadKind;
  array: boolean;
}) =>
  array
    ? `list of ${kindDisplays[payloadKind].plural}`
    : kindDisplays[payloadKind].label;

/** An array of entities shows the many-entities icon, as Figma's Entities output does. */
export const getKindIcon = ({
  payloadKind,
  array,
}: {
  payloadKind: PayloadKind;
  array: boolean;
}): IconName => {
  const { icon } = kindDisplays[payloadKind];

  return array && icon === "cube" ? "cubes" : icon;
};

/** "a date", "an entity". */
export const withArticle = (noun: string) =>
  `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;
