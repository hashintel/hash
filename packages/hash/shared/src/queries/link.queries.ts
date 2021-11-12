import gql from "graphql-tag";

const linkFieldsFragment = gql`
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
  mutation createLink(
    $path: String!
    $index: Int
    $sourceAccountId: ID!
    $sourceEntityId: ID!
    $destinationAccountId: ID!
    $destinationEntityId: ID!
    $destinationEntityVersionId: ID
  ) {
    createLink(
      link: {
        path: $path
        index: $index
        sourceAccountId: $sourceAccountId
        sourceEntityId: $sourceEntityId
        destinationAccountId: $destinationAccountId
        destinationEntityId: $destinationEntityId
        destinationEntityVersionId: $destinationEntityVersionId
      }
    ) {
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
