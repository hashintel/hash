import gql from "graphql-tag";

const pageFieldsFragment = gql`
  fragment PageFields on Page {
    __typename
    entityId
    entityVersionId
    accountId
    createdAt
    updatedAt
    history {
      createdAt
      entityVersionId
    }
    properties {
      __typename
      archived
      summary
      title
      contents {
        __typename
        id
        entityVersionId
        entityId
        accountId
        updatedAt
        createdAt
        entityVersionCreatedAt
        createdByAccountId
        properties {
          componentId
          entity {
            __typename
            id
            entityVersionId
            entityId
            accountId
            updatedAt
            createdAt
            entityVersionCreatedAt
            createdByAccountId
            properties
          }
        }
      }
    }
  }
`;

export const createPage = gql`
  mutation createPage($accountId: ID!, $properties: PageCreationData!) {
    createPage(accountId: $accountId, properties: $properties) {
      ...PageFields
    }
  }
  ${pageFieldsFragment}
`;

export const insertBlocksIntoPage = gql`
  mutation insertBlocksIntoPage(
    $accountId: ID!
    $entityVersionId: ID!
    $entityId: ID!
    $blocks: [InsertBlocksData!]!
    $previousBlockId: ID
  ) {
    insertBlocksIntoPage(
      accountId: $accountId
      entityId: $entityId
      entityVersionId: $entityVersionId
      blocks: $blocks
      previousBlockId: $previousBlockId
    ) {
      ...PageFields
    }
  }
  ${pageFieldsFragment}
`;

export const getPage = gql`
  query getPage($accountId: ID!, $entityId: ID, $entityVersionId: ID) {
    page(
      accountId: $accountId
      entityId: $entityId
      entityVersionId: $entityVersionId
    ) {
      ...PageFields
    }
  }
  ${pageFieldsFragment}
`;

export const updatePageContents = gql`
  mutation updatePageContents(
    $accountId: ID!
    $entityId: ID!
    $actions: [UpdatePageAction!]!
  ) {
    updatePageContents(
      accountId: $accountId
      entityId: $entityId
      actions: $actions
    ) {
      ...PageFields
    }
  }
  ${pageFieldsFragment}
`;
