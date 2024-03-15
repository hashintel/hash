export const meQuery = /* GraphQL */ `
  query me {
    me(
      hasLeftEntity: { incoming: 0, outgoing: 0 }
      hasRightEntity: { incoming: 0, outgoing: 0 }
    ) {
      subgraph {
        roots
        vertices
        edges
        depths {
          constrainsLinkDestinationsOn {
            outgoing
          }
          constrainsLinksOn {
            outgoing
          }
          constrainsValuesOn {
            outgoing
          }
          constrainsPropertiesOn {
            outgoing
          }
          inheritsFrom {
            outgoing
          }
          isOfType {
            outgoing
          }
          hasLeftEntity {
            incoming
            outgoing
          }
          hasRightEntity {
            incoming
            outgoing
          }
        }
        temporalAxes
      }
    }
  }
`;
