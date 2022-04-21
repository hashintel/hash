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

export const linkedAggregationsWithoutResultsFragment = gql`
  fragment LinkedAggregationsWithoutResultsFields on LinkedAggregation {
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
  }
`;

export const linkedAggregationIdentifierFieldsFragment = gql`
  fragment LinkedAggregationIdentifierFields on LinkedAggregation {
    aggregationId
    sourceAccountId
    sourceEntityId
  }
`;

export const getLinkQuery = gql`
  query getLink($linkId: ID!, $sourceAccountId: ID!) {
    getLink(linkId: $linkId, sourceAccountId: $sourceAccountId) {
      ...LinkFields
    }
  }
  ${linkFieldsFragment}
`;

/**
 * doesn't include the results of a linked aggregation, which is an expensive operation
 * @todo should do this with a @skip directive on the existing {@link linkedAggregationsFragment}
 *    but linting warns about unused variable on the query (e.g. $skipResults: Boolean=true) if you do this
 *    @see https://stackoverflow.com/a/58251208/17217717 for how to do a fragment with skip/include directive
 */
export const getLinkedAggregationIdentifierFieldsQuery = gql`
  query getLinkedAggregation($aggregationId: ID!, $sourceAccountId: ID!) {
    getLinkedAggregation(
      aggregationId: $aggregationId
      sourceAccountId: $sourceAccountId
    ) {
      ...LinkedAggregationsWithoutResultsFields
    }
  }
  ${linkedAggregationsWithoutResultsFragment}
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

export const createLinkedAggregationMutation = gql`
  mutation createLinkedAggregationOperation(
    $sourceAccountId: ID!
    $sourceEntityId: ID!
    $path: String!
    $operation: AggregateOperationInput!
  ) {
    createLinkedAggregation(
      sourceAccountId: $sourceAccountId
      sourceEntityId: $sourceEntityId
      path: $path
      operation: $operation
    ) {
      aggregationId
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
    }
  }
`;

export const updateLinkedAggregationMutation = gql`
  mutation updateLinkedAggregationOperation(
    $sourceAccountId: ID!
    $sourceEntityId: ID!
    $aggregationId: ID!
    $updatedOperation: AggregateOperationInput!
  ) {
    updateLinkedAggregationOperation(
      sourceAccountId: $sourceAccountId
      sourceEntityId: $sourceEntityId
      aggregationId: $aggregationId
      updatedOperation: $updatedOperation
    ) {
      aggregationId
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
    }
  }
`;
