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
    """
    The id of the web HASH's own flow definitions and types are in, which differs on every instance.
    """
    hashWebId: WebId!
  }

  extend type Query {
    """
    Get the HASH instance settings
    """
    hashInstanceSettings: HashInstanceSettings
  }
`;
