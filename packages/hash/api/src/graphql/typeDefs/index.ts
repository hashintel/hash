import { gql } from "apollo-server-express";

import { entityTypedef } from "./entity.typedef";
import { linkTypedef } from "./link.typedef";
import { deprecatedEntityTypeTypedef } from "./entityType.typedef";
import { textTypedef } from "./text.typedef";
import { persistedUserTypedef } from "./knowledge/user.typedef";
import { embedTypeDef } from "./embed.typedef";
import { fileTypedef } from "./file.typedef";
import { impliedHistoryTypedef } from "./impliedHistory.typedef";
import { aggregationTypedef } from "./aggregation.typedef";
import { executeTaskTypedef } from "./taskExecution.typedef";
import { dataTypeTypedef } from "./ontology/data-type.typedef";
import { propertyTypeTypedef } from "./ontology/property-type.typedef";
import { entityTypeTypedef } from "./ontology/entity-type.typedef";
import { entityWithMetadataTypedef } from "./knowledge/entity.typedef";
import { persistedPageTypedef } from "./knowledge/page.typedef";
import { persistedCommentTypedef } from "./knowledge/comment.typedef";
import { persistedBlockTypedef } from "./knowledge/block.typedef";
import { subgraphTypedef } from "./subgraph.typedef";
import { blockprotocolTypedef } from "./blockprotocol.typedef";
import { persistedOrgTypedef } from "./knowledge/org.typedef";

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
  entityWithMetadataTypedef,
  persistedBlockTypedef,
  persistedPageTypedef,
  persistedCommentTypedef,
  persistedUserTypedef,
  persistedOrgTypedef,
];

// This needs to be called 'schema' to be picked up by codegen -
// It could alternatively be a default export.
export const schema = [
  baseSchema,
  blockprotocolTypedef,
  embedTypeDef,
  entityTypedef,
  linkTypedef,
  aggregationTypedef,
  deprecatedEntityTypeTypedef,
  impliedHistoryTypedef,
  textTypedef,
  fileTypedef,
  executeTaskTypedef,
  ...ontology,
  ...knowledge,
  subgraphTypedef,
];
