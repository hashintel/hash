import { VersionedUri } from "@blockprotocol/type-system";
import { SizedGridColumn } from "@glideapps/glide-data-grid";
import { EntityId } from "@local/hash-isomorphic-utils/types";
import {
  Entity,
  EntityTypeWithMetadata,
  Subgraph,
  SubgraphRootTypes,
} from "../hash-subgraph/src";

export type LinkAndTargetEntity = { rightEntity: Entity; linkEntity: Entity };

export type LinkRow = {
  rowId: string;
  linkEntityTypeId: VersionedUri;
  linkTitle: string;
  maxItems: number;
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
