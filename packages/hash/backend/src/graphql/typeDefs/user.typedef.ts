import { gql } from "apollo-server-express";

export const userTypedef = gql`
  type User {
    id: ID!
    email: String!
    username: String!
  }
`;
