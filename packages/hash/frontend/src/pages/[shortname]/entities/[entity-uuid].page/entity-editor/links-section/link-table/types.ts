import { VersionedUri } from "@blockprotocol/type-system";
import { SizedGridColumn } from "@glideapps/glide-data-grid";
import {
  Entity,
  EntityTypeWithMetadata,
  Subgraph,
  SubgraphRootTypes,
} from "@hashintel/hash-subgraph";
import { EntityId } from "@local/hash-isomorphic-utils/types";

export type LinkRow = {
  rowId: string;
  linkEntityTypeId: VersionedUri;
  linkTitle: string;
  maxItems: number;
  expectedEntityTypes: EntityTypeWithMetadata[];
  expectedEntityTypeTitles: string[];
  linkAndTargetEntities: { rightEntity: Entity; linkEntity: Entity }[];
  entitySubgraph: Subgraph<SubgraphRootTypes["entity"]>;
  deleteLink: (linkEntityId: EntityId) => Promise<void>;
};

export type LinkColumnKey = "linkTitle" | "linkedWith" | "expectedEntityTypes";

export interface LinkColumn extends SizedGridColumn {
  id: LinkColumnKey;
}
