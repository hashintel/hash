import type { InputDefinition, InputSize, PayloadKind } from "./types.js";

/**
 * The size of a value of each kind, for an input that takes only that kind. Only text can be anything from a name to a
 * document, so a `Text` input with a smaller value says so on its definition.
 */
const kindSizes: Record<PayloadKind, InputSize> = {
  Text: "long",
  FormattedText: "long",
  Boolean: "short",
  Date: "short",
  DateTime: "short",
  Duration: "short",
  Number: "short",
  /* Picked from a menu. */
  ActorType: "short",
  EntityId: "short",
  GoogleAccountId: "short",
  GoogleSheet: "short",
  VersionedUrl: "short",
  /* Payloads only steps give, so picked from earlier steps. */
  FailedEntityProposal: "short",
  PersistedEntityMetadata: "short",
  ProposedEntity: "short",
  ProposedEntityWithResolvedLinks: "short",
  WebPage: "short",
  WebSearchResult: "short",
  /* Each needs a builder, which won't fit beside its label, but they're picked from a menu until they have one. */
  Aggregation: "short",
  EntityQuery: "short",
  FilterCondition: "short",
  PropertyObjectWithMetadata: "short",
  PropertyPatch: "short",
  SortKey: "short",
};

/**
 * How much room a value typed for an input takes in the editor: the size on its definition, otherwise its kind's.
 *
 * A list, an input of several kinds, or one that takes its kind from another, is short: its value is picked from
 * earlier steps, or typed as one value to compare, as for If's `value`.
 */
export const getInputSize = (input: InputDefinition): InputSize => {
  if (input.size) {
    return input.size;
  }

  if (input.array || !("oneOfPayloadKinds" in input)) {
    return "short";
  }

  const [onlyKind, ...otherKinds] = input.oneOfPayloadKinds;

  return onlyKind && otherKinds.length === 0 ? kindSizes[onlyKind] : "short";
};
