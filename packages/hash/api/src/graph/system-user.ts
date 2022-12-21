import { systemUserShortname } from "@hashintel/hash-shared/environment";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { GraphApi } from "@hashintel/hash-graph-client";
import { types } from "@hashintel/hash-shared/ontology-types";
import { getEntities } from "@hashintel/hash-subgraph/src/stdlib/element/entity";
import { Subgraph, SubgraphRootTypes } from "@hashintel/hash-subgraph";
import {
  AccountEntityId,
  AccountId,
  extractAccountId,
} from "@hashintel/hash-shared/types";

import { extractBaseUri } from "@blockprotocol/type-system";
import { createKratosIdentity } from "../auth/ory-kratos";
import { getRequiredEnv } from "../util";
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
  graphApi: GraphApi;
  logger: Logger;
}) => {
  const { graphApi, logger } = params;
  const { data: existingUserEntitiesSubgraph } =
    await graphApi.getEntitiesByQuery({
      filter: {
        all: [
          { equal: [{ path: ["version"] }, { parameter: "latest" }] },
          {
            equal: [
              { path: ["type", "versionedUri"] },
              { parameter: types.entityType.user.entityTypeId },
            ],
          },
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
    });

  const existingUserEntities = getEntities(
    existingUserEntitiesSubgraph as Subgraph<SubgraphRootTypes["entity"]>,
  );

  const existingSystemUserEntity = existingUserEntities.find(
    ({ properties }) =>
      properties[
        extractBaseUri(types.propertyType.shortName.propertyTypeId)
      ] === systemUserShortname,
  );

  if (existingSystemUserEntity) {
    systemUserAccountId = extractAccountId(
      existingSystemUserEntity.metadata.editionId.baseId as AccountEntityId,
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
  graphApi: GraphApi;
  logger: Logger;
}) => {
  const { graphApi, logger } = params;

  const existingSystemUser = await getUserByShortname(
    { graphApi },
    {
      shortname: systemUserShortname,
    },
  );

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

    systemUser = await createUser(
      { graphApi },
      {
        shortname,
        actorId: systemUserAccountId,
        preferredName,
        emails: [emailAddress],
        kratosIdentityId,
        userAccountId: systemUserAccountId,
      },
    );

    logger.info(
      `System user available with shortname = "${systemUser.shortname}"`,
    );
  }
};
