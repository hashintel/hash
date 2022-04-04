import gql from "graphql-tag";
import { linkFieldsFragment } from "./link.queries";

export const linkedAggregationsFragment = gql`
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

export const getEntity = gql`
  query getEntity($accountId: ID!, $entityId: ID!) {
    entity(accountId: $accountId, entityId: $entityId) {
      __typename
      createdByAccountId
      createdAt
      entityId
      entityVersionId
      entityTypeId
      entityTypeVersionId
      entityTypeName
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
      updatedAt
      accountId
      ... on UnknownEntity {
        properties
      }
      entityType {
        entityId
        properties
      }
      visibility
    }
  }
  ${linkFieldsFragment}
  ${linkedAggregationsFragment}
`;

export const createEntity = gql`
  mutation createEntity(
    $accountId: ID!
    $properties: JSONObject!
    $entityTypeId: ID
    $entityTypeVersionId: ID
    $systemTypeName: SystemTypeName
    $versioned: Boolean! = true
  ) {
    createEntity(
      accountId: $accountId
      entity: {
        entityProperties: $properties
        versioned: $versioned
        entityType: {
          entityTypeId: $entityTypeId
          entityTypeVersionId: $entityTypeVersionId
          systemTypeName: $systemTypeName
        }
      }
    ) {
      __typename
      id
      createdByAccountId
      createdAt
      entityId
      entityTypeId
      entityTypeVersionId
      entityTypeName
      updatedAt
      accountId
      ... on UnknownEntity {
        properties
      }
      visibility
    }
  }
`;

export const updateEntity = gql`
  mutation updateEntity(
    $accountId: ID!
    $entityId: ID!
    $properties: JSONObject!
  ) {
    updateEntity(
      accountId: $accountId
      entityId: $entityId
      properties: $properties
    ) {
      __typename
      id
      entityId
      entityTypeId
      entityTypeVersionId
      entityTypeName
      updatedAt
      ... on UnknownEntity {
        properties
      }
    }
  }
`;

export const aggregateEntity = gql`
  query aggregateEntity($accountId: ID!, $operation: AggregateOperationInput!) {
    aggregateEntity(accountId: $accountId, operation: $operation) {
      __typename
      results {
        __typename
        id
        accountId
        entityId
        entityTypeId
        entityTypeVersionId
        entityTypeName
        properties
      }
      operation {
        entityTypeId
        pageNumber
        pageCount
        itemsPerPage
        multiSort {
          field
          desc
        }
        multiFilter {
          operator
          filters {
            field
            value
            operator
          }
        }
      }
    }
  }
`;

// @todo dedupe
export const getAccountEntityTypes = gql`
  query getAccountEntityTypesShared(
    $accountId: ID!
    $includeOtherTypesInUse: Boolean = false
  ) {
    getAccountEntityTypes(
      accountId: $accountId
      includeOtherTypesInUse: $includeOtherTypesInUse
    ) {
      entityId
      entityVersionId
      properties
    }
  }
`;

// @todo dedupe
export const createEntityType = gql`
  mutation createEntityTypeShared(
    $accountId: ID!
    $description: String
    $name: String!
    $schema: JSONObject!
  ) {
    createEntityType(
      accountId: $accountId
      description: $description
      name: $name
      schema: $schema
    ) {
      entityId
      entityTypeName
      properties
    }
  }
`;
