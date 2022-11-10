import { gql } from "apollo-server-express";

import { blockTypedef } from "./block.typedef";
import { entityTypedef } from "./entity.typedef";
import { linkTypedef } from "./link.typedef";
import { deprecatedEntityTypeTypedef } from "./entityType.typedef";
import { pageTypedef } from "./page.typedef";
import { textTypedef } from "./text.typedef";
import { userTypedef } from "./knowledge/user.typedef";
import { embedTypeDef } from "./embed.typedef";
import { fileTypedef } from "./file.typedef";
import { impliedHistoryTypedef } from "./impliedHistory.typedef";
import { aggregationTypedef } from "./aggregation.typedef";
import { pagePaginationTypedef } from "./paginationConnections.typedef";
import { executeTaskTypedef } from "./taskExecution.typedef";
import { dataTypeTypedef } from "./ontology/data-type.typedef";
import { propertyTypeTypedef } from "./ontology/property-type.typedef";
import { linkTypeTypedef } from "./ontology/link-type.typedef";
import { entityTypeTypedef } from "./ontology/entity-type.typedef";
import { persistedEntityTypedef } from "./knowledge/entity.typedef";
import { persistedPageTypedef } from "./knowledge/page.typedef";
import { persistedCommentTypedef } from "./knowledge/comment.typedef";
import { persistedBlockTypedef } from "./knowledge/block.typedef";
import { persistedLinkTypedef } from "./knowledge/link.typedef";
import { subgraphTypedef } from "./subgraph.typedef";
import { blockprotocolTypedef } from "./blockprotocol.typedef";

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

const ontology = [
  dataTypeTypedef,
  propertyTypeTypedef,
  linkTypeTypedef,
  entityTypeTypedef,
];

const knowledge = [
  persistedEntityTypedef,
  persistedBlockTypedef,
  persistedPageTypedef,
  persistedCommentTypedef,
  persistedLinkTypedef,
];

// This needs to be called 'schema' to be picked up by codegen -
// It could alternatively be a default export.
export const schema = [
  baseSchema,
  blockTypedef,
  blockprotocolTypedef,
  embedTypeDef,
  entityTypedef,
  linkTypedef,
  aggregationTypedef,
  deprecatedEntityTypeTypedef,
  impliedHistoryTypedef,
  pageTypedef,
  pagePaginationTypedef,
  textTypedef,
  userTypedef,
  fileTypedef,
  executeTaskTypedef,
  ...ontology,
  ...knowledge,
  subgraphTypedef,
];
