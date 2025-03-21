import type {
  EntityId,
  PartialEntityType,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { SizedGridColumn } from "@glideapps/glide-data-grid";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";

export type LinkAndTargetEntity = {
  rightEntity: HashEntity;
  linkEntity: HashEntity;
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
