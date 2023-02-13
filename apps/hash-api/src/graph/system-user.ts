import { Logger } from "@local/hash-backend-utils/logger";
import { systemUserShortname } from "@local/hash-isomorphic-utils/environment";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import {
  AccountEntityId,
  AccountId,
  EntityRootType,
  extractAccountId,
  Subgraph,
} from "@local/hash-subgraph";
import { getEntities } from "@local/hash-subgraph/stdlib";
import { mapSubgraph } from "@local/hash-subgraph/temp";
import { extractBaseUri } from "@local/hash-subgraph/type-system-patch";

import { createKratosIdentity } from "../auth/ory-kratos";
import { getRequiredEnv } from "../util";
import { ImpureGraphContext } from "./index";
import {
  createUser,
  getUserByShortname,
  User,
} from "./knowledge/system-types/user";

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
    await graphApi.getEntitiesByQuery({
      filter: {
        equal: [
          { path: ["type", "versionedUri"] },
          { parameter: types.entityType.user.entityTypeId },
        ],
      },
      graphResolveDepths: {
        inheritsFrom: { outgoing: 0 },
        constrainsValuesOn: { outgoing: 0 },
        constrainsPropertiesOn: { outgoing: 0 },
        constrainsLinksOn: { outgoing: 0 },
        constrainsLinkDestinationsOn: { outgoing: 0 },
        isOfType: { outgoing: 0 },
        hasLeftEntity: { outgoing: 0, incoming: 0 },
        hasRightEntity: { outgoing: 0, incoming: 0 },
      },
      timeProjection: {
        pinned: {
          axis: "transactionTime",
          timestamp: null,
        },
        variable: {
          axis: "decisionTime",
          start: null,
          end: null,
        },
      },
    });

  const existingUserEntities = getEntities(
    mapSubgraph(existingUserEntitiesSubgraph) as Subgraph<EntityRootType>,
  );

  const existingSystemUserEntity = existingUserEntities.find(
    ({ properties }) =>
      properties[
        extractBaseUri(types.propertyType.shortName.propertyTypeId)
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
    systemUserAccountId = (await graphApi.createAccountId()).data as AccountId;
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

  const existingSystemUser = await getUserByShortname(context, {
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

    systemUser = await createUser(context, {
      shortname,
      actorId: systemUserAccountId,
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
