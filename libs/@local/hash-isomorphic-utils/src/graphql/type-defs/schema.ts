import { gql } from "graphql-tag";

import { blockprotocolTypedef } from "./blockprotocol.typedef.js";
import { embedTypeDef } from "./embed.typedef.js";
import { generationTypedef } from "./generation.typedef.js";
import { linearTypedef } from "./integration/linear.typedef.js";
import { blockTypedef } from "./knowledge/block.typedef.js";
import { blockCollectionTypedef } from "./knowledge/block-collection.typedef.js";
import { commentTypedef } from "./knowledge/comment.typedef.js";
import { dashboardTypedef } from "./knowledge/dashboard.typedef.js";
import { entityTypedef } from "./knowledge/entity.typedef.js";
import { fileTypedef } from "./knowledge/file.typedef.js";
import { flowTypedef } from "./knowledge/flow.typedef.js";
import { hashInstanceTypedef } from "./knowledge/hash-instance.typedef.js";
import { orgTypedef } from "./knowledge/org.typedef.js";
import { pageTypedef } from "./knowledge/page.typedef.js";
import { userTypedef } from "./knowledge/user.typedef.js";
import { dataTypeTypedef } from "./ontology/data-type.typedef.js";
import { entityTypeTypedef } from "./ontology/entity-type.typedef.js";
import { propertyTypeTypedef } from "./ontology/property-type.typedef.js";
import { subgraphTypedef } from "./subgraph.typedef.js";

const baseSchema = gql`
  scalar Date
  scalar JSONObject
  scalar TextToken
  # Branded types
  scalar WebId
  scalar AccountId
  scalar AccountGroupId
  scalar AuthorizationSubjectId

  type Query

  type Mutation

  # Apollo implements this, but we need to declare it for editor tooling
  directive @oneOf on INPUT_OBJECT
`;

const ontology = [dataTypeTypedef, propertyTypeTypedef, entityTypeTypedef];

const knowledge = [
  blockCollectionTypedef,
  blockTypedef,
  commentTypedef,
  dashboardTypedef,
  entityTypedef,
  fileTypedef,
  flowTypedef,
  hashInstanceTypedef,
  orgTypedef,
  pageTypedef,
  userTypedef,
];

// This needs to be called 'schema' to be picked up by codegen -
// It could alternatively be a default export.
export const schema = [
  baseSchema,
  blockprotocolTypedef,
  embedTypeDef,
  generationTypedef,
  ...ontology,
  ...knowledge,
  linearTypedef,
  subgraphTypedef,
];
