import { gql } from "apollo-server-express";

import { accountTypedef } from "./account.typedef";
import { blockTypedef } from "./block.typedef";
import { entityTypedef } from "./entity.typedef";
import { entityTypeTypedef } from "./entityType.typedef";
import { orgEmailInvitationTypedef } from "./orgEmailInvitation.typedef";
import { orgInvitationLinkTypedef } from "./orgInvitationLink.typdef";
import { orgTypedef } from "./org.typedef";
import { pageTypedef } from "./page.typedef";
import { textTypedef } from "./text.typedef";
import { userTypedef } from "./user.typedef";
import { embedTypeDef } from "./embed.typedef";
import { impliedHistoryTypedef } from "./impliedHistory.typedef"

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
  accountTypedef,
  baseSchema,
  blockTypedef,
  embedTypeDef,
  entityTypedef,
  entityTypeTypedef,
  impliedHistoryTypedef,
  orgEmailInvitationTypedef,
  orgInvitationLinkTypedef,
  orgTypedef,
  pageTypedef,
  textTypedef,
  userTypedef,
];
