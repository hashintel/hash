import { gql } from "apollo-server-express";

export const accountTypedef = gql`
  extend type Query {
    accounts: [Account!]!
  }

  union Account = User | Org
`;
