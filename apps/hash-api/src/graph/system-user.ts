import { Logger } from "@local/hash-backend-utils/logger";
import { systemUserShortname } from "@local/hash-isomorphic-utils/environment";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import {
  AccountEntityId,
  AccountId,
  EntityRootType,
  extractAccountId,
  Subgraph,
} from "@local/hash-subgraph";
import { getEntities } from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

import { createKratosIdentity } from "../auth/ory-kratos";
import { publicUserAccountId } from "../graphql/context";
import { getRequiredEnv } from "../util";
import { ImpureGraphContext } from "./index";
import {
  createUser,
  getUserByShortname,
  User,
} from "./knowledge/system-types/user";
import {
  createAccount,
  createAccountGroup,
  createWeb,
} from "./knowledge/system-types/account.fields";

// eslint-disable-next-line import/no-mutable-exports
export let systemUserAccountId: AccountId;

/**
 * Ensure the `systemUserAccountId` exists by fetching it or creating it. Note this
 * method is designed to be run before the system types are initialized.
 */
export const ensureSystemUserAccountIdExists = async (params: {
  logger: Logger;
  context: ImpureGraphContext;
}) => {
  const {
    logger,
    context: { graphApi },
  } = params;

  const { data: existingUserEntitiesSubgraph } =
    await graphApi.getEntitiesByQuery(publicUserAccountId, {
      filter: generateVersionedUrlMatchingFilter(
        types.entityType.user.entityTypeId,
        { ignoreParents: true },
      ),
      graphResolveDepths: zeroedGraphResolveDepths,
      temporalAxes: currentTimeInstantTemporalAxes,
    });

  const existingUserEntities = getEntities(
    existingUserEntitiesSubgraph as Subgraph<EntityRootType>,
  );

  const existingSystemUserEntity = existingUserEntities.find(
    ({ properties }) =>
      properties[
        extractBaseUrl(types.propertyType.shortname.propertyTypeId)
      ] === systemUserShortname,
  );

  if (existingSystemUserEntity) {
    systemUserAccountId = extractAccountId(
      existingSystemUserEntity.metadata.recordId.entityId as AccountEntityId,
    );
    logger.info(
      `Using existing system user account id: ${systemUserAccountId}`,
    );
  } else {
    // The account id generated here is the very origin on all `AccountId` instances.
    systemUserAccountId = await createAccount(
      params.context,
      { actorId: publicUserAccountId },
      {},
    );
    await createWeb(
      params.context,
      { actorId: systemUserAccountId },
      { owner: systemUserAccountId },
    );
    logger.info(`Created system user account id: ${systemUserAccountId}`);
  }
};

// eslint-disable-next-line import/no-mutable-exports
export let systemUser: User;

/**
 * Ensure the `systemUser` exists by fetching it or creating it using
 * the `systemUserAccountId`. Note this method must be run after the
 * `systemUserAccountId` and the system types have been initialized.
 */
export const ensureSystemUserExists = async (params: {
  logger: Logger;
  context: ImpureGraphContext;
}) => {
  const { logger, context } = params;
  const authentication = { actorId: systemUserAccountId };

  const existingSystemUser = await getUserByShortname(context, authentication, {
    shortname: systemUserShortname,
  });

  if (existingSystemUser) {
    systemUser = existingSystemUser;
  } else {
    const shortname = systemUserShortname;
    const preferredName = getRequiredEnv("SYSTEM_USER_PREFERRED_NAME");
    const emailAddress = getRequiredEnv("SYSTEM_USER_EMAIL_ADDRESS");
    const password = getRequiredEnv("SYSTEM_USER_PASSWORD");

    const { id: kratosIdentityId } = await createKratosIdentity({
      traits: {
        shortname,
        emails: [emailAddress],
      },
      credentials: { password: { config: { password } } },
    });

    systemUser = await createUser(context, authentication, {
      shortname,
      preferredName,
      emails: [emailAddress],
      kratosIdentityId,
      userAccountId: systemUserAccountId,
    });

    logger.info(
      `System user available with shortname = "${systemUser.shortname}"`,
    );
  }
};
