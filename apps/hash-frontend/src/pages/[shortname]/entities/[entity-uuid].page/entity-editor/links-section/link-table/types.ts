import { VersionedUrl } from "@blockprotocol/type-system";
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
  onEntityClick: (params: { entity: Entity }) => void;
  retryErroredUpload?: () => void;
};

export type LinkColumnKey = "linkTitle" | "linkedWith" | "expectedEntityTypes";

export interface LinkColumn extends SizedGridColumn {
  id: LinkColumnKey;
}
