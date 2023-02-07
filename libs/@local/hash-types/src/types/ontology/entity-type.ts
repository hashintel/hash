import { EntityTypeWithMetadata as EntityTypeWithMetadataBp } from "@blockprotocol/graph";
import { EntityType } from "@blockprotocol/type-system/slim";
import { Subtype } from "@local/hash-isomorphic-utils/util";

import { OntologyElementMetadata } from "./metadata";

export type EntityTypeWithMetadata = Subtype<
  EntityTypeWithMetadataBp,
  {
    schema: EntityType;
    metadata: OntologyElementMetadata;
  }
>;
