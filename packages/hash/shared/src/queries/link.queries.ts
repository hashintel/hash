import gql from "graphql-tag";

export const linkFieldsFragment = gql`
  fragment LinkFields on Link {
    linkId
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
    $sourceAccountId: ID!
    $sourceEntityId: ID!
    $linkId: ID!
  ) {
    deleteLink(
      sourceAccountId: $sourceAccountId
      sourceEntityId: $sourceEntityId
      linkId: $linkId
    )
  }
`;
