import { VersionedUri } from "@blockprotocol/type-system";
import { SizedGridColumn } from "@glideapps/glide-data-grid";
import {
  Entity,
  EntityId,
  EntityRootType,
  EntityTypeWithMetadata,
  Subgraph,
} from "@local/hash-subgraph";

export type LinkAndTargetEntity = { rightEntity: Entity; linkEntity: Entity };

export type LinkRow = {
  rowId: string;
  linkEntityTypeId: VersionedUri;
  linkTitle: string;
  maxItems?: number;
  isList: boolean;
  expectedEntityTypes: EntityTypeWithMetadata[];
  expectedEntityTypeTitles: string[];
  linkAndTargetEntities: LinkAndTargetEntity[];
  entitySubgraph: Subgraph<EntityRootType>;
  markLinkAsArchived: (linkEntityId: EntityId) => void;
};

export type LinkColumnKey = "linkTitle" | "linkedWith" | "expectedEntityTypes";

export interface LinkColumn extends SizedGridColumn {
  id: LinkColumnKey;
}
