import { gql } from "graphql-tag";

export const hashInstanceTypedef = gql`
  type EnabledIntegrations {
    googleSheets: Boolean!
    linear: Boolean!
  }

  type HashInstanceSettings {
    entity: Entity!
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
