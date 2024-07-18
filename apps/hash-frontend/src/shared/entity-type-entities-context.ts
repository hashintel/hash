import type { ApolloQueryResult } from "@apollo/client";
import type {
  EntityType,
  PropertyType,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { createContext, useContext } from "react";

import type { GetEntitySubgraphQuery } from "../graphql/api-types.gen";

export type EntityTypeEntitiesContextValue = {
  entityTypeId?: VersionedUrl;
  entityTypeBaseUrl?: BaseUrl;
  entities?: Entity[];
  entityTypes?: EntityType[];
  // Whether or not cached content was available immediately for the context data
  hadCachedContent: boolean;
  /**
   * Whether or not a network request is in process.
   * Note that if is hasCachedContent is true, data for the given query is available before loading is complete.
   * The cached content will be replaced automatically and the value updated when the network request completes.
   */
  loading: boolean;
  refetch: () => Promise<ApolloQueryResult<GetEntitySubgraphQuery>>;
  propertyTypes?: PropertyType[];
  subgraph?: Subgraph<EntityRootType>;
};

export const EntityTypeEntitiesContext =
  createContext<null | EntityTypeEntitiesContextValue>(null);

export const useEntityTypeEntitiesContext = () => {
  const entityTypeEntitiesContext = useContext(EntityTypeEntitiesContext);

  if (!entityTypeEntitiesContext) {
    throw new Error("no EntityTypeEntitiesContext value has been provided");
  }

  return entityTypeEntitiesContext;
};
