import { VersionedUri } from "@blockprotocol/type-system-web";
import { SizedGridColumn } from "@glideapps/glide-data-grid";
import {
  Entity,
  EntityTypeWithMetadata,
  Subgraph,
  SubgraphRootTypes,
} from "@hashintel/hash-subgraph";

export type LinkRow = {
  rowId: string;
  linkEntityTypeId: VersionedUri;
  linkTitle: string;
  maxItems: number;
  expectedEntityTypes: EntityTypeWithMetadata[];
  expectedEntityTypeTitles: string[];
  linkAndTargetEntities: { rightEntity: Entity; linkEntity: Entity }[];
  entitySubgraph: Subgraph<SubgraphRootTypes["entity"]>;
};

export type LinkColumnKey = "linkTitle" | "linkedWith" | "expectedEntityTypes";

export interface LinkColumn extends SizedGridColumn {
  id: LinkColumnKey;
}
