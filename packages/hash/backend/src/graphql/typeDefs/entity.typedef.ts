import { gql } from "apollo-server-express";

export const ROOT_ENTITY_FIELDS = `
  id: ID!
  namespaceId: ID!
  namespace: String!
  createdAt: Date!
  createdBy: User!
  properties: EntityProperties!
  updatedAt: Date!
  visibility: Visibility!
  type: String!
`;

export const entityTypedef = gql`
  interface Entity {
    ${ROOT_ENTITY_FIELDS}
  }

  type UnknownEntity implements Entity {
    properties: JSONObject!
    
    ${ROOT_ENTITY_FIELDS}
  }

  union EntityProperties = Page | JSONObject

  enum Visibility {
    PRIVATE
    PUBLIC
  }
`;
