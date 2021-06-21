import { gql } from "apollo-server-express";

import { blockTypedef } from "./block.typedef";
import { entityTypedef } from "./entity.typedef";
import { namespaceTypedef } from "./namespace.typedef";
import { orgTypedef } from "./org.typedef";
import { pageTypedef } from "./page.typedef";
import { textTypedef } from "./text.typedef";
import { userTypedef } from "./user.typedef";

const baseSchema = gql`
  scalar Date
  scalar JSONObject

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

// This needs to be called 'schema' to be picked up by codegen -
// It could alternatively be a default export.
export const schema = [
  baseSchema,
  blockTypedef,
  entityTypedef,
  namespaceTypedef,
  orgTypedef,
  pageTypedef,
  textTypedef,
  userTypedef,
];
