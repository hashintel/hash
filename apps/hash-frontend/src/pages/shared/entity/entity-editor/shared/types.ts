import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";

export type CustomEntityLinksColumn = {
  id: string;
  appliesToEntityTypeId: VersionedUrl;
  label: string;
  sortable: boolean;
  calculateValue: (
    entity: Entity,
    subgraph: Subgraph<EntityRootType>,
  ) => number | string;
  width: number;
};
