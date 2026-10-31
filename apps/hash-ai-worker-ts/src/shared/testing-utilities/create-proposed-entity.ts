import type { EntityId, VersionedUrl } from "@blockprotocol/type-system";
import type { ProposedEntity } from "@local/hash-isomorphic-utils/flows/types";

/**
 * A valid proposed entity with the fields a test sets. Storing a payload checks it against its kind's schema, so a
 * stand-in with only the fields the test reads can't be stored.
 *
 * Its local id may be any string, as an integration's may be.
 */
export const createProposedEntity = ({
  localEntityId = "entity",
  ...fields
}: Partial<Omit<ProposedEntity, "localEntityId">> & {
  localEntityId?: string;
}): ProposedEntity => ({
  claims: { isSubjectOf: [], isObjectOf: [] },
  provenance: { actorType: "ai", origin: { type: "flow" } },
  propertyMetadata: { value: {} },
  localEntityId: localEntityId as EntityId,
  entityTypeIds: [
    "https://hash.ai/@h/types/entity-type/thing/v/1" as VersionedUrl,
  ],
  properties: {},
  ...fields,
});
