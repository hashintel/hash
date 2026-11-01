import { gql } from "@apollo/client";

export const myApiTokensQuery = gql`
  query myApiTokens {
    myApiTokens
  }
`;

export const createApiTokenMutation = gql`
  mutation createApiToken($name: String!, $lifetimeDays: Int) {
    createApiToken(name: $name, lifetimeDays: $lifetimeDays)
  }
`;

export const revokeApiTokenMutation = gql`
  mutation revokeApiToken($tokenId: ApiTokenId!) {
    revokeApiToken(tokenId: $tokenId)
  }
`;
