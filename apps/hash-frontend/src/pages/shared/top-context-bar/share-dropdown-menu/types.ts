import { GetEntityAuthorizationRelationshipsQuery } from "../../../../graphql/api-types.gen";

export type AuthorizationRelationship =
  GetEntityAuthorizationRelationshipsQuery["getEntityAuthorizationRelationships"][number];
