import { gql } from "apollo-server-express";

export const orgTypedef = gql`
  type Org {
    id: ID!
    shortname: String!
  }
`;
