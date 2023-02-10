import { VersionedUri } from "@blockprotocol/type-system";
import { SizedGridColumn } from "@glideapps/glide-data-grid";
import {
  Entity,
  EntityId,
  EntityTypeWithMetadata,
  Subgraph,
  SubgraphRootTypes,
} from "@local/hash-subgraph/main";

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
  entitySubgraph: Subgraph<SubgraphRootTypes["entity"]>;
  markLinkAsArchived: (linkEntityId: EntityId) => void;
};

export type LinkColumnKey = "linkTitle" | "linkedWith" | "expectedEntityTypes";

export interface LinkColumn extends SizedGridColumn {
  id: LinkColumnKey;
}
