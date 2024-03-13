import { VersionedUrl } from "@blockprotocol/type-system";
import { AccountId, Entity, OwnedById } from "@local/hash-subgraph";
import type { Status } from "@local/status";

export type ResearchTaskWorkflowParams = {
  prompt: string;
  entityTypeIds: VersionedUrl[];
  userAuthentication: { actorId: AccountId };
  webOwnerId: OwnedById;
};

export type EntityWithSources = {
  entity: Entity;
  sourceWebPages: { title: string; url: string }[];
};

export type ResearchTaskWorkflowResponse = Status<{
  createdDraftEntities: EntityWithSources[];
  unchangedExistingEntities: EntityWithSources[];
}>;
