import type { VersionedUrl } from "@blockprotocol/type-system";
import type { SizedGridColumn } from "@glideapps/glide-data-grid";
import type { EntityId, SimpleEntity } from "@local/hash-graph-types/entity";
import type { EntityTypeWithMetadata } from "@local/hash-graph-types/ontology";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";

export type LinkAndTargetEntity = {
  rightEntity: SimpleEntity;
  linkEntity: SimpleEntity;
};

export type LinkRow = {
  rowId: string;
  linkEntityTypeId: VersionedUrl;
  linkTitle: string;
  maxItems?: number;
  isErroredUpload: boolean;
  isFile: boolean;
  isList: boolean;
  isUploading: boolean;
  expectedEntityTypes: EntityTypeWithMetadata[];
  expectedEntityTypeTitles: string[];
  linkAndTargetEntities: (LinkAndTargetEntity & {
    // Adding the subgraph we found these in makes it easy to retrieve their type(s), e.g. for labelling
    sourceSubgraph: Subgraph<EntityRootType> | null;
  })[];
  entitySubgraph: Subgraph<EntityRootType>;
  markLinkAsArchived: (linkEntityId: EntityId) => void;
  onEntityClick: (params: { entity: SimpleEntity }) => void;
  retryErroredUpload?: () => void;
};

export type LinkColumnKey = "linkTitle" | "linkedWith" | "expectedEntityTypes";

export interface LinkColumn extends SizedGridColumn {
  id: LinkColumnKey;
}
