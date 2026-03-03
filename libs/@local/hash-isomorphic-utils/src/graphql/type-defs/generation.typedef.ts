import { gql } from "graphql-tag";

export const generationTypedef = gql`
  type IsGenerationAvailableResponse {
    available: Boolean!
    reason: String
  }

  extend type Query {
    """
    Generates the plural form of a word or phrase (e.g. Company -> Companies)
    """
    generatePlural(singular: String!): String!

    """
    Generate the inverse form of a relationship (e.g. Parent Of -> Child Of, Employee Of -> Employer Of)
    """
    generateInverse(relationship: String!): String!

    """
    Check whether the generation resolvers are available
    """
    isGenerationAvailable: IsGenerationAvailableResponse!
  }
`;
