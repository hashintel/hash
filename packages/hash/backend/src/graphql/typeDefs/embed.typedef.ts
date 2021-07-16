import { gql } from "apollo-server-express";

export const embedTypeDef = gql`
  type Embed {
    html: String!
    providerName: String!
  }

  extend type Query {
    """
    accepts url and returns embed data
    """
    embedCode(
      """
      The URL of the embed
      """
      url: String!

      type: String
    ): Embed!
  }
`;
