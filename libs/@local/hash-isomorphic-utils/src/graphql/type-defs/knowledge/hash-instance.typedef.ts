import { gql } from "apollo-server-express";

export const hashInstanceTypedef = gql`
  type HashInstanceSettings {
    entity: SerializedEntity!
    isUserAdmin: Boolean!
  }

  extend type Query {
    """
    Get the HASH instance settings
    """
    hashInstanceSettings: HashInstanceSettings
  }
`;
