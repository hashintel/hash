import { gql } from "apollo-server-express";

export const blockprotocolTypedef = gql`
  type BlockType {
    entryPoint: String!
    tagName: String
  }

  type BlockVariant {
    description: String
    icon: String
    name: String
    properties: JSONObject
    examples: [JSONObject!]
  }

  type BlockProtocolBlock {
    blockType: BlockType!
    default: JSONObject
    description: String
    displayName: String
    examples: [JSONObject!]
    externals: JSONObject
    icon: String
    image: String
    license: String
    name: String!
    protocol: String
    source: String!
    variants: [BlockVariant!]
    version: String!
    author: String!
    createdAt: String
    blockSitePath: String!
    componentId: String!
    exampleGraph: String
    lastUpdated: String
    npmPackageName: String
    pathWithNamespace: String!
    repository: String
    schema: String
  }

  extend type Query {
    getBlockProtocolBlocks: [BlockProtocolBlock!]!
  }
`;
