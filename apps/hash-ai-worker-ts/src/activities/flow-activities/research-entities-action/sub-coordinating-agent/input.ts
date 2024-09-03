import type { DereferencedEntityType } from "../../../shared/dereference-entity-type.js";
import type { LocalEntitySummary } from "../../shared/infer-summaries-then-claims-from-text/get-entity-summaries-from-text.js";
import type { Claim } from "../../shared/claims.js";

export type SubCoordinatingAgentInput = {
  goal: string;
  relevantEntities: LocalEntitySummary[];
  existingClaimsAboutRelevantEntities: Claim[];
  entityTypes: DereferencedEntityType[];
};
