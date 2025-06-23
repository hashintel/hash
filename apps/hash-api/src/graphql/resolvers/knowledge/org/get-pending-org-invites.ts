import {
  type Entity,
  type EntityId,
  entityIdFromComponents,
  extractEntityUuidFromEntityId,
  type WebId,
} from "@blockprotocol/type-system";
import {
  createDefaultAuthorizationRelationships,
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import type { MutationInviteUserToOrgArgs } from "@local/hash-isomorphic-utils/graphql/api-types.gen";
import {
  systemDataTypes,
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  InvitedUser,
  IsInvitedTo,
} from "@local/hash-isomorphic-utils/system-types/inviteduser";
import { ApolloError } from "apollo-server-errors";

import {
  createEntity,
  getEntities,
} from "../../../../graph/knowledge/primitive/entity";
import { createLinkEntity } from "../../../../graph/knowledge/primitive/link-entity";
import {
  getOrgById,
  type Org,
} from "../../../../graph/knowledge/system-types/org";
import {
  getUserByEmail,
  getUserByShortname,
  type User,
} from "../../../../graph/knowledge/system-types/user";
import { systemAccountId } from "../../../../graph/system-account";
import type { ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";

const invitationDurationInDays = 30;

export const getPendingOrgInvites: ResolverFn<
  Promise<boolean>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationInviteUserToOrgArgs
> = async (_, { userEmail, userShortname, orgWebId }, graphQLContext) => {
  const { authentication } = graphQLContext;

  const context = graphQLContextToImpureGraphContext(graphQLContext);

  // @TODO

  return true;
};
