import { gql } from "apollo-server-express";

export const generationTypedef = gql`
  extend type Query {
    """
    Generates the plural form of a word or phrase (e.g. Company -> Companies)

    TODO handle missing API keys gracefully for self-hosted instances
    """
    generatePlural(singular: String!): String!

    """
    Generate the inverse form of a relationship (e.g. Parent Of -> Child Of, Employee Of -> Employer Of)
    """
    generateInverse(relationship: String!): String!
  }
`;
