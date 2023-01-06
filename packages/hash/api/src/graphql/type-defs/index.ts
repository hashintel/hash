import { gql } from "apollo-server-express";

import { blockprotocolTypedef } from "./blockprotocol.typedef";
import { deprecatedTypedef } from "./deprecated.typedef";
import { embedTypeDef } from "./embed.typedef";
import { blockTypedef } from "./knowledge/block.typedef";
import { commentTypedef } from "./knowledge/comment.typedef";
import { entityTypedef } from "./knowledge/entity.typedef";
import { hashInstanceTypedef } from "./knowledge/hash-instance.typedef";
import { orgTypedef } from "./knowledge/org.typedef";
import { pageTypedef } from "./knowledge/page.typedef";
import { userTypedef } from "./knowledge/user.typedef";
import { dataTypeTypedef } from "./ontology/data-type.typedef";
import { entityTypeTypedef } from "./ontology/entity-type.typedef";
import { propertyTypeTypedef } from "./ontology/property-type.typedef";
import { subgraphTypedef } from "./subgraph.typedef";
import { executeTaskTypedef } from "./task-execution.typedef";

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
