import gql from "graphql-tag";

export const createEntityTypeMutation = gql`
  mutation createEntityType(
    $accountId: ID!
    $description: String!
    $name: String!
  ) {
    createEntityType(
      accountId: $accountId
      description: $description
      name: $name
    ) {
      accountId
      createdById
      createdAt
      entityId
      entityVersionId
      entityTypeId
      entityTypeVersionId
      entityTypeName
      updatedAt
      properties
      visibility
    }
  }
`;
