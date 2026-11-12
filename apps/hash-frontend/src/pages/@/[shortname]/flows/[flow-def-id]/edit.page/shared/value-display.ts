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

const kindDisplays: Record<PayloadKind, { label: string; icon: IconName }> = {
  ActorType: { label: "actor type", icon: "user" },
  Aggregation: { label: "aggregation", icon: "chartBar" },
  Boolean: { label: "true or false", icon: "squareCheck" },
  Date: { label: "date", icon: "calendar" },
  DateTime: { label: "date and time", icon: "calendarClock" },
  Duration: { label: "duration", icon: "clock" },
  EntityId: { label: "entity", icon: "cube" },
  EntityQuery: { label: "entity query", icon: "search" },
  FailedEntityProposal: { label: "failed entity proposal", icon: "warning" },
  FilterCondition: { label: "filter condition", icon: "filter" },
  FormattedText: { label: "formatted text", icon: "fileLines" },
  GoogleAccountId: { label: "Google account", icon: "user" },
  GoogleSheet: { label: "Google Sheet", icon: "fileSpreadsheet" },
  Number: { label: "number", icon: "oneHundred" },
  PersistedEntityMetadata: { label: "saved entity", icon: "cube" },
  PropertyObjectWithMetadata: {
    label: "entity properties",
    icon: "bracketsCurly",
  },
  PropertyPatch: { label: "property change", icon: "edit" },
  ProposedEntity: { label: "proposed entity", icon: "cube" },
  ProposedEntityWithResolvedLinks: {
    label: "proposed entity",
    icon: "cube",
  },
  SortKey: { label: "sort order", icon: "sortDown" },
  Text: { label: "text", icon: "text" },
  VersionedUrl: { label: "type", icon: "shapes" },
  WebPage: { label: "web page", icon: "file" },
  WebSearchResult: { label: "web search result", icon: "search" },
};

/** The kind of a value in lower case, e.g. "date" or, for an array, "date list". */
export const getKindLabel = ({
  payloadKind,
  array,
}: {
  payloadKind: PayloadKind;
  array: boolean;
}) => `${kindDisplays[payloadKind].label}${array ? " list" : ""}`;

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
