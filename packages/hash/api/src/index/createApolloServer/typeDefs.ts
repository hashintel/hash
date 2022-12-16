import { gql } from "apollo-server-express";

import { deprecatedTypedef } from "./typeDefs/deprecated.typedef";
import { userTypedef } from "./typeDefs/user.typedef";
import { embedTypeDef } from "./typeDefs/embed.typedef";
import { executeTaskTypedef } from "./typeDefs/taskExecution.typedef";
import { dataTypeTypedef } from "./typeDefs/data-type.typedef";
import { propertyTypeTypedef } from "./typeDefs/property-type.typedef";
import { entityTypeTypedef } from "./typeDefs/entity-type.typedef";
import { entityTypedef } from "./typeDefs/entity.typedef";
import { pageTypedef } from "./typeDefs/page.typedef";
import { commentTypedef } from "./typeDefs/comment.typedef";
import { blockTypedef } from "./typeDefs/block.typedef";
import { subgraphTypedef } from "./typeDefs/subgraph.typedef";
import { blockprotocolTypedef } from "./typeDefs/blockprotocol.typedef";
import { orgTypedef } from "./typeDefs/org.typedef";
import { hashInstanceTypedef } from "./typeDefs/hashInstance.typedef";

const baseSchema = gql`
  scalar Date
  scalar JSONObject
  scalar TextToken
  # Branded types
  scalar OwnedById
  scalar AccountId

  """
  The queries available in this schema
  """
  type Query {
    healthCheck: Boolean!
  }

  """
  The mutation operations available in this schema
  """
  type Mutation {
    setHealth: Boolean!
  }
`;

const ontology = [dataTypeTypedef, propertyTypeTypedef, entityTypeTypedef];

const knowledge = [
  entityTypedef,
  blockTypedef,
  pageTypedef,
  commentTypedef,
  userTypedef,
  orgTypedef,
  hashInstanceTypedef,
];

// This needs to be called 'schema' to be picked up by codegen -
// It could alternatively be a default export.
export const schema = [
  baseSchema,
  blockprotocolTypedef,
  embedTypeDef,
  deprecatedTypedef,
  executeTaskTypedef,
  ...ontology,
  ...knowledge,
  subgraphTypedef,
];
