import { gql } from "apollo-server-express";

export const hashInstanceTypedef = gql`
  extend type Query {
    """
    Get the HASH instance entity.
    """
    hashInstanceEntity: Entity!
  }
`;
