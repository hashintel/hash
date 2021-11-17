import gql from "graphql-tag";

export const linkFieldsFragment = gql`
  fragment LinkFields on Link {
    id
    path
    index
    sourceAccountId
    sourceEntityId
    destinationAccountId
    destinationEntityId
    destinationEntityVersionId
  }
`;

export const createLinkMutation = gql`
  mutation createLink($link: CreateLinkInput!) {
    createLink(link: $link) {
      ...LinkFields
    }
  }
  ${linkFieldsFragment}
`;

export const deleteLinkMutation = gql`
  mutation deleteLink(
    $path: String!
    $index: Int
    $sourceAccountId: ID!
    $sourceEntityId: ID!
  ) {
    deleteLinkByPath(
      path: $path
      index: $index
      sourceAccountId: $sourceAccountId
      sourceEntityId: $sourceEntityId
    )
  }
`;
