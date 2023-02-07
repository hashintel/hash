import { type OntologyElementMetadata as OntologyElementMetadataBp } from "@blockprotocol/graph";
import { Subtype } from "@local/hash-isomorphic-utils/util";

import { OwnedById } from "../../branded";
import { OntologyTypeRecordId } from "../ontology";
import { ProvenanceMetadata } from "../shared";

export type OntologyElementMetadata = Subtype<
  OntologyElementMetadataBp,
  {
    recordId: OntologyTypeRecordId;
    ownedById: OwnedById;
    provenance: ProvenanceMetadata;
  }
>;
