import type { DraftLinksToCreate } from "../../../shared/use-draft-link-state";
import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import type {
  Entity,
  EntityId,
  PartialEntityType,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { SizedGridColumn } from "@glideapps/glide-data-grid";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { Dispatch, SetStateAction } from "react";

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
  /**
   * The entity being edited – the source/left entity of these outgoing links.
   * Carried on the row so the editable cell editors don't need `useEntityEditor`.
   */
  entity: HashEntity;
  readonly: boolean;
  draftLinksToCreate: DraftLinksToCreate;
  setDraftLinksToCreate: Dispatch<SetStateAction<DraftLinksToCreate>>;
  markLinkAsArchived: (linkEntityId: EntityId) => void;
  onEntityClick: (entityId: EntityId) => void;
  retryErroredUpload?: () => void;
};

export type LinkColumnKey = "linkTitle" | "linkedWith" | "expectedEntityTypes";

export interface LinkColumn extends SizedGridColumn {
  id: LinkColumnKey;
}
