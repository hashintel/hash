import { subgraphFieldsFragment } from "@local/hash-isomorphic-utils/graphql/queries/subgraph";

export const getEntityTypesQuery = /* GraphQL */ `
  query getEntityTypes {
    queryEntityTypes(
      constrainsValuesOn: { outgoing: 255 }
      constrainsPropertiesOn: { outgoing: 255 }
      constrainsLinksOn: { outgoing: 0 }
      constrainsLinkDestinationsOn: { outgoing: 0 }
      inheritsFrom: { outgoing: 255 }
      latestOnly: false
      includeArchived: true
    ) {
      ...SubgraphFields
    }
  }
  ${subgraphFieldsFragment.toString()}
`;
