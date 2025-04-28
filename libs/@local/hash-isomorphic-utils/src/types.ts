import type {
  BaseUrl,
  EntityId,
  EntityType,
  PropertyPath,
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type {
  GetEntitiesRequest as GetEntitiesRequestGraphApi,
  GetEntitySubgraphRequest as GetEntitySubgraphRequestGraphApi,
} from "@local/hash-graph-client";

export type TextToken =
  | {
      tokenType: "text";
      text: string;
      bold?: boolean;
      italics?: boolean;
      underline?: boolean;
      strikethrough?: boolean;
      highlighted?: boolean;
      link?: string;
    }
  | { tokenType: "hardBreak" }
  | {
      tokenType: "mention";
      mentionType:
        | "user"
        | "page"
        | "entity"
        | "property-value"
        | "outgoing-link";
      entityId: EntityId;
      propertyTypeBaseUrl?: BaseUrl;
      linkEntityTypeBaseUrl?: BaseUrl;
    };

export const isNotNullish = <T>(value: T): value is NonNullable<T> => {
  return value !== null && value !== undefined;
};
