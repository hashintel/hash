import { gql } from "apollo-server-express";

export const hashInstanceTypedef = gql`
  type EnabledIntegrations {
    googleSheets: Boolean!
    linear: Boolean!
  }

  type HashInstanceSettings {
    entity: SerializedEntity!
    isUserAdmin: Boolean!
    enabledIntegrations: EnabledIntegrations!
  }

  extend type Query {
    """
    Get the HASH instance settings
    """
    hashInstanceSettings: HashInstanceSettings
  }
`;
