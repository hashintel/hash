import type { EntitySlideProps } from "./entity-slide";
import type { EntityId, VersionedUrl } from "@blockprotocol/type-system";

export type SlideEntityItem = {
  kind: "entity";
  itemId: EntityId;
  onEntityDbChange?: (entityId: EntityId) => void;
} & Pick<
  EntitySlideProps,
  "defaultOutgoingLinkFilters" | "proposedEntitySubgraph"
>;

export type SlideEntityTypeItem = {
  kind: "entityType";
  itemId: VersionedUrl;
  onUpdate?: (entityTypeId: VersionedUrl) => void;
};

export type SlideDataTypeItem = {
  kind: "dataType";
  itemId: VersionedUrl;
  onUpdate?: (dataTypeId: VersionedUrl) => void;
};

export type SlideLinkTableItem = {
  kind: "linkTable";
  /**
   * Synthetic stack key. The link entities are identified by `linkEntityIds`;
   * `itemId` only needs to be stable for this stack entry, so it is derived from
   * the ids (see the producer in entities-visualizer.tsx).
   */
  itemId: string;
  linkEntityIds: EntityId[];
};

export type SlideItem =
  | SlideEntityItem
  | SlideEntityTypeItem
  | SlideDataTypeItem
  | SlideLinkTableItem;

export type PushToStackFn = (item: SlideItem) => void;
