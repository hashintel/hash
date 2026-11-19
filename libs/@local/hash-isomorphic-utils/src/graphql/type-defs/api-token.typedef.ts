import { gql } from "graphql-tag";

export const apiTokenTypedef = gql`
  scalar ApiTokenId
  scalar ApiTokenResponse
  scalar CreateApiTokenResponse

  extend type Query {
    """
    The API tokens of the authenticated user, newest first, including expired
    and revoked tokens.
    """
    myApiTokens: [ApiTokenResponse!]!
  }

  extend type Mutation {
    """
    Creates an API token for the authenticated user. The response is the only
    place the complete token ever appears – it cannot be retrieved again.
    """
    createApiToken(name: String!, lifetimeDays: Int): CreateApiTokenResponse!

    """
    Revokes an API token of the authenticated user, returning its id.
    """
    revokeApiToken(tokenId: ApiTokenId!): ApiTokenId!
  }
`;
