export const getEntityTypesQuery = /* GraphQL */ `
  query getEntityTypes {
    queryEntityTypes(
      constrainsValuesOn: { outgoing: 0 }
      constrainsPropertiesOn: { outgoing: 0 }
      constrainsLinksOn: { outgoing: 0 }
      constrainsLinkDestinationsOn: { outgoing: 0 }
      inheritsFrom: { outgoing: 0 }
      latestOnly: true
      includeArchived: false
    ) {
      roots
      vertices
    }
  }
`;
