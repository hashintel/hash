import { subgraphFieldsFragment } from "@local/hash-isomorphic-utils/graphql/queries/subgraph";
import { print } from "graphql";

export const createEntityMutation = /* GraphQL */ `
  mutation createEntity(
    $entityTypeIds: [VersionedUrl!]!
    $properties: PropertyObjectWithMetadata!
    $linkData: LinkData
  ) {
    createEntity(
      entityTypeIds: $entityTypeIds
      properties: $properties
      linkData: $linkData
    )
  }
`;

export const updateEntityMutation = /* GraphQL */ `
  mutation updateEntity($entityUpdate: EntityUpdateDefinition!) {
    updateEntity(entityUpdate: $entityUpdate)
  }
`;

export const getEntitySubgraphQuery = /* GraphQL */ `
  query getEntitySubgraph($request: GetEntitySubgraphRequest!) {
    getEntitySubgraph(request: $request) {
      subgraph {
        ...SubgraphFields
      }
    }
  }
  ${print(subgraphFieldsFragment)}
`;
