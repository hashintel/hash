import { gql } from "@apollo/client";

export const getBlockProtocolBlocksQuery = gql`
  query getBlockProtocolBlocks {
    getBlockProtocolBlocks {
      blockType {
        entryPoint
        tagName
      }
      default
      description
      displayName
      examples
      externals
      icon
      image
      license
      name
      protocol
      source
      variants {
        description
        examples
        icon
        name
        properties
      }
      version
      author
      createdAt
      blockSitePath
      componentId
      exampleGraph
      lastUpdated
      npmPackageName
      pathWithNamespace
      repository
      schema
    }
  }
`;
