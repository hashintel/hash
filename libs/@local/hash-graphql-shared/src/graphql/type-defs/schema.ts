import { gql } from "apollo-server-express";

import { blockprotocolTypedef } from "./blockprotocol.typedef";
import { embedTypeDef } from "./embed.typedef";
import { linearTypedef } from "./integration/linear.typedef";
import { blockTypedef } from "./knowledge/block.typedef";
import { blockCollectionTypedef } from "./knowledge/block-collection.typedef";
import { commentTypedef } from "./knowledge/comment.typedef";
import { entityTypedef } from "./knowledge/entity.typedef";
import { fileTypedef } from "./knowledge/file.typedef";
import { hashInstanceTypedef } from "./knowledge/hash-instance.typedef";
import { orgTypedef } from "./knowledge/org.typedef";
import { pageTypedef } from "./knowledge/page.typedef";
import { userTypedef } from "./knowledge/user.typedef";
import { dataTypeTypedef } from "./ontology/data-type.typedef";
import { entityTypeTypedef } from "./ontology/entity-type.typedef";
import { propertyTypeTypedef } from "./ontology/property-type.typedef";
import { subgraphTypedef } from "./subgraph.typedef";

const baseSchema = gql`
  scalar Date
  scalar JSONObject
  scalar TextToken
  # Branded types
  scalar OwnedById
  scalar AccountId
  scalar AccountGroupId
  scalar AuthorizationSubjectId

  type Query

  type Mutation
`;

const ontology = [dataTypeTypedef, propertyTypeTypedef, entityTypeTypedef];

const knowledge = [
  entityTypedef,
  blockTypedef,
  pageTypedef,
  blockCollectionTypedef,
  commentTypedef,
  userTypedef,
  orgTypedef,
  hashInstanceTypedef,
  fileTypedef,
];

// This needs to be called 'schema' to be picked up by codegen -
// It could alternatively be a default export.
export const schema = [
  baseSchema,
  blockprotocolTypedef,
  embedTypeDef,
  ...ontology,
  ...knowledge,
  linearTypedef,
  subgraphTypedef,
];
