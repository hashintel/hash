import type { VersionedUrl } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";

export type CustomEntityLinksColumn = {
  id: string;
  appliesToEntityTypeId: VersionedUrl;
  label: string;
  sortable: boolean;
  calculateValue: (
    entity: HashEntity,
    subgraph: Subgraph<EntityRootType>,
  ) => number | string;
  width: number;
};
