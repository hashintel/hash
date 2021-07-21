import gql from "graphql-tag";

export const getEmbedCode = gql`
  query getEmbedCode(
    $url: String!
    $type: String
  ) {
    embedCode(
      url: $url
      type: $type
    ) {
      html
      providerName
    }
  }
`;