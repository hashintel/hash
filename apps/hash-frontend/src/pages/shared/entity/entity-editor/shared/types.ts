import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import type { Entity, VersionedUrl } from "@blockprotocol/type-system";

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
