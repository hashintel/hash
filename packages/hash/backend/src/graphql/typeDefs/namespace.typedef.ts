import { gql } from "apollo-server-express";

export const namespaceTypedef = gql`
  extend type Query {
    namespaces: [Namespace!]!
  }

  union Namespace = User | Org
`;
