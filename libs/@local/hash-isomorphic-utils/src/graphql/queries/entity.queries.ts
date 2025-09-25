import { gql } from "@apollo/client";

export const queryEntitySubgraphQuery = gql`
  query queryEntitySubgraph($request: QueryEntitySubgraphRequest!) {
    queryEntitySubgraph(request: $request)
  }
`;

export const checkUserPermissionsOnEntityQuery = gql`
  query checkUserPermissionsOnEntity($metadata: EntityMetadata!) {
    checkUserPermissionsOnEntity(metadata: $metadata)
  }
`;
