import { gql } from "apollo-server-express";

export const embedTypeDef = gql`
  type Embed {
    html: String!
    providerName: String!
    height: Int
    width: Int!
  }

  extend type Query {
    """
    Accepts a url and returns embeddable html for it, and the provider name
    """
    embedCode(
      """
      The URL of the embed
      """
      url: String!

      """
      The providerName of the embed
      """
      type: String
    ): Embed!
  }
`;
