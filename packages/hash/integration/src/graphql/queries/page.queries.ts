import gql from "graphql-tag";

const linkFieldsFragment = gql`
  fragment LinkFields on Link {
    linkId
    path
    index
    sourceAccountId
    sourceEntityId
    destinationAccountId
    destinationEntityId
  }
`;

const linkedAggregationsFragment = gql`
  fragment LinkedAggregationsFields on LinkedAggregation {
    sourceAccountId
    sourceEntityId
    path
    operation {
      entityTypeId
      entityTypeVersionId
      multiFilter {
        filters {
          field
          value
          operator
        }
        operator
      }
      multiSort {
        field
        desc
      }
      itemsPerPage
      pageNumber
      pageCount
    }
    results {
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
`;

const pageFieldsFragment = gql`
  fragment PageFields on Page {
    __typename
    entityId
    entityVersionId
    accountId
    createdAt
    updatedAt
    entityTypeId
    entityTypeVersionId
    history {
      createdAt
      entityVersionId
    }
    contents {
      __typename
      entityVersionId
      entityId
      accountId
      updatedAt
      createdAt
      entityVersionCreatedAt
      createdByAccountId
      data {
        __typename
        entityVersionId
        entityId
        accountId
        updatedAt
        createdAt
        entityTypeId
        entityTypeVersionId
        entityVersionCreatedAt
        createdByAccountId
        properties
        linkGroups {
          links {
            ...LinkFields
          }
          sourceEntityId
          sourceEntityVersionId
          path
        }
        linkedEntities {
          accountId
          entityId
          entityTypeId
          properties
        }
        linkedAggregations {
          ...LinkedAggregationsFields
        }
      }
      properties {
        componentId
      }
    }
    properties {
      __typename
      archived
      summary
      title
    }
  }
  ${linkFieldsFragment}
  ${linkedAggregationsFragment}
`;

export const createPage = gql`
  mutation createPage($accountId: ID!, $properties: PageCreationData!) {
    createPage(accountId: $accountId, properties: $properties) {
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

export const getAccountPagesTree = gql`
  query getAccountPagesTree($accountId: ID!) {
    accountPages(accountId: $accountId) {
      entityId
      properties {
        title
      }
      parentPageEntityId
    }
  }
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
      page {
        ...PageFields
      }
    }
  }
  ${pageFieldsFragment}
`;

export const setPageParent = gql`
  mutation setParentPage(
    $accountId: ID!
    $pageEntityId: ID!
    $parentPageEntityId: ID
  ) {
    setParentPage(
      accountId: $accountId
      pageEntityId: $pageEntityId
      parentPageEntityId: $parentPageEntityId
    ) {
      entityId
      properties {
        title
        summary
        __typename
      }
      __typename
    }
  }
`;
