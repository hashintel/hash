import { VersionedUrl } from "@blockprotocol/graph";
import { ProposedEntity } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import { OwnedById } from "@local/hash-subgraph";

export type InferEntitiesRequest = {
  entityTypeIds: VersionedUrl[];
  type: "infer-entities";
  textInput: string;
};

export type CreateEntitiesRequest = {
  type: "create-entities";
  entitiesToCreate: ProposedEntity[];
  ownedById: OwnedById;
  skippedEntities: ProposedEntity[];
};

type GetSiteContentRequest = {
  type: "get-site-content";
};

export type Message =
  | InferEntitiesRequest
  | CreateEntitiesRequest
  | GetSiteContentRequest;
