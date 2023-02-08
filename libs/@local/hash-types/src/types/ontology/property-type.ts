import { PropertyTypeWithMetadata as PropertyTypeWithMetadataBp } from "@blockprotocol/graph";
import { PropertyType } from "@blockprotocol/type-system/slim";
import { Subtype } from "@local/advanced-types/subtype";

import { OntologyElementMetadata } from "./metadata";

export type PropertyTypeWithMetadata = Subtype<
  PropertyTypeWithMetadataBp,
  {
    schema: PropertyType;
    metadata: OntologyElementMetadata;
  }
>;
