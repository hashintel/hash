import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import type {
  Entity,
  EntityId,
  PartialEntityType,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { SizedGridColumn } from "@glideapps/glide-data-grid";

export type LinkAndTargetEntity = {
  rightEntity: Entity;
  linkEntity: Entity;
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
  expectedEntityTypes: PartialEntityType[];
  linkAndTargetEntities: (LinkAndTargetEntity & {
    linkEntityLabel: string;
    rightEntityLabel: string;
  })[];
  entitySubgraph: Subgraph<EntityRootType>;
  markLinkAsArchived: (linkEntityId: EntityId) => void;
  onEntityClick: (entityId: EntityId) => void;
  retryErroredUpload?: () => void;
};

export type LinkColumnKey = "linkTitle" | "linkedWith" | "expectedEntityTypes";

export interface LinkColumn extends SizedGridColumn {
  id: LinkColumnKey;
}
