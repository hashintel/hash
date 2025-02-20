import type { VersionedUrl } from "@blockprotocol/type-system";
import type { EntityId } from "@local/hash-graph-types/entity";

import type { EntitySlideProps } from "./entity-slide";

export type SlideEntityItem = {
  kind: "entity";
  itemId: EntityId;
  onUpdate?: (entityId: EntityId) => void;
} & Pick<EntitySlideProps, "defaultOutgoingLinkFilters">;

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

export type SlideItem =
  | SlideEntityItem
  | SlideEntityTypeItem
  | SlideDataTypeItem;

export type PushToStackFn = (item: SlideItem) => void;
