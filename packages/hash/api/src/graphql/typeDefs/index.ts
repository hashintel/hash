import { gql } from "apollo-server-express";

import { deprecatedTypedef } from "./deprecated.typedef";
import { linkTypedef } from "./link.typedef";
import { userTypedef } from "./knowledge/user.typedef";
import { embedTypeDef } from "./embed.typedef";
import { executeTaskTypedef } from "./taskExecution.typedef";
import { dataTypeTypedef } from "./ontology/data-type.typedef";
import { propertyTypeTypedef } from "./ontology/property-type.typedef";
import { entityTypeTypedef } from "./ontology/entity-type.typedef";
import { entityTypedef } from "./knowledge/entity.typedef";
import { pageTypedef } from "./knowledge/page.typedef";
import { commentTypedef } from "./knowledge/comment.typedef";
import { blockTypedef } from "./knowledge/block.typedef";
import { subgraphTypedef } from "./subgraph.typedef";
import { blockprotocolTypedef } from "./blockprotocol.typedef";
import { orgTypedef } from "./knowledge/org.typedef";

const baseSchema = gql`
  scalar Date
  scalar JSONObject
  scalar TextToken

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
];

// This needs to be called 'schema' to be picked up by codegen -
// It could alternatively be a default export.
export const schema = [
  baseSchema,
  blockprotocolTypedef,
  embedTypeDef,
  deprecatedTypedef,
  linkTypedef,
  executeTaskTypedef,
  ...ontology,
  ...knowledge,
  subgraphTypedef,
];
