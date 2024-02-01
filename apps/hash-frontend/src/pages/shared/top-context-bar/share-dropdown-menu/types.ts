import { GetEntityAuthorizationRelationshipsQuery } from "../../../../graphql/api-types.gen";

export type AuthorizationRelationship =
  GetEntityAuthorizationRelationshipsQuery["getEntityAuthorizationRelationships"][number];

export type AccountAuthorizationRelationship = Omit<
  AuthorizationRelationship,
  "subject"
> & {
  subject: Exclude<
    AuthorizationRelationship["subject"],
    { __typename: "PublicAuthorizationSubject" }
  >;
};

export type PublicAuthorizationRelationship = Omit<
  AuthorizationRelationship,
  "subject"
> & {
  subject: { __typename: "PublicAuthorizationSubject"; public: boolean };
};
