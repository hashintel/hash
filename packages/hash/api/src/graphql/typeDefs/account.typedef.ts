import { gql } from "apollo-server-express";

export const accountTypedef = gql`
  extend type Query {
    """
    Get all accounts in the system
    """
    accounts: [Account!]!
  }

  union Account = User | Org
`;
