import { gql } from "apollo-server-express";

// TODO: Probably incorrect syntax!
export const workspaceIntegrationsTypedef = gql`
  type MVPResponse {
    ok: Boolean!
    data: String!
  }
  extend type Query {
    integrations: MVPResponse
  }

  # input UpdateUserProperties {
  #   shortname: String
  #   preferredName: String
  #   usingHow: WayToUseHASH
  # }

  extend type Mutation {
    # cause a mutation for hello world
    integrationsHello: MVPResponse
  }
`;
