import { NotFoundError } from "@local/hash-backend-utils/error";
import { getHashInstance } from "@local/hash-backend-utils/hash-instance";
import {
  createWebMachineActor,
  getWebMachineActorId,
} from "@local/hash-backend-utils/machine-actors";
import { AccountId, extractOwnedByIdFromEntityId } from "@local/hash-subgraph";

import { logger } from "../../../../logger";
import { createHashInstance } from "../../../knowledge/system-types/hash-instance";
import { systemAccountId } from "../../../system-account";
import {
  ensureSystemWebEntitiesExist,
  owningWebs,
} from "../../system-webs-and-entities";
import { MigrationFunction } from "../types";
import {
  getCurrentHashSystemEntityTypeId,
  getExistingUsersAndOrgs,
} from "../util";

const migrate: MigrationFunction = async ({
  authentication,
  context,
  migrationState,
}) => {
  /**
   * This migration creates entities that are required in later migration scripts.
   * Other system entities (belonging to non-hash webs) are created in {@link ensureSystemEntitiesExist}
   *
   * It also creates web-scoped machine actors for existing users and orgs,
   * which are required to be able to retrieve and update entities in later migration scripts.
   */

  const { name, websiteUrl } = owningWebs.hash;

  const currentMachineEntityTypeId = getCurrentHashSystemEntityTypeId({
    entityTypeKey: "machine",
    migrationState,
  });

  const currentOrganizationEntityTypeId = getCurrentHashSystemEntityTypeId({
    entityTypeKey: "organization",
    migrationState,
  });

  /**
   * Step 1: Create the system entities associated with the 'hash' web:
   * 1. The HASH org entity is required to create the HASH Instance entity in Step 2
   * 2. The 'hash' web machine actor is used in createWebMachineActor, required in Step 3
   */
  await ensureSystemWebEntitiesExist({
    context,
    name,
    websiteUrl,
    webShortname: "hash",
    machineEntityTypeId: currentMachineEntityTypeId,
    organizationEntityTypeId: currentOrganizationEntityTypeId,
  });

  /**
   * Step 2: Create the HASH Instance entity, which stores configuration settings for the instance.
   * This is required to be able to retrieve the admin account group later on.
   */
  const systemAccountAuthentication = { actorId: systemAccountId };
  try {
    await getHashInstance(context, systemAccountAuthentication);
  } catch (error) {
    if (error instanceof NotFoundError) {
      await createHashInstance(context, systemAccountAuthentication, {});
      logger.info("Created hashInstance entity");
    } else {
      throw error;
    }
  }

  /**
   * Step 3: create web machine actors for existing webs – these are bots with permissions to add other bots to each existing web,
   * and to create notifications that aren't tied to specific integrations (e.g. related to comments and @mentions).
   *
   * This step is only required to transition instances existing prior to Dec 2023, and can be deleted once they have been migrated.
   */

  const { users, orgs } = await getExistingUsersAndOrgs(
    context,
    authentication,
    {},
  );

  for (const user of users) {
    const userAccountId = extractOwnedByIdFromEntityId(
      user.metadata.recordId.entityId,
    );
    try {
      await getWebMachineActorId(context, authentication, {
        ownedById: userAccountId,
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        await createWebMachineActor(
          context,
          // We have to use the user's authority to add the machine to their web
          { actorId: userAccountId as AccountId },
          {
            ownedById: userAccountId,
            machineEntityTypeId: currentMachineEntityTypeId,
          },
        );
        logger.info(`Created web machine actor for user ${userAccountId}`);
      } else {
        throw new Error(
          `Unexpected error attempting to retrieve machine web actor for user ${user.metadata.recordId.entityId}`,
        );
      }
    }
  }

  for (const org of orgs) {
    const orgAccountGroupId = extractOwnedByIdFromEntityId(
      org.metadata.recordId.entityId,
    );
    try {
      await getWebMachineActorId(context, authentication, {
        ownedById: orgAccountGroupId,
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        const orgAdminAccountId = org.metadata.provenance.edition.createdById;

        await createWebMachineActor(
          context,
          // We have to use an org admin's authority to add the machine to their web
          { actorId: orgAdminAccountId },
          {
            ownedById: orgAccountGroupId,
            machineEntityTypeId: currentMachineEntityTypeId,
          },
        );
        logger.info(`Created web machine actor for org ${orgAccountGroupId}`);
      } else {
        throw new Error(
          `Unexpected error attempting to retrieve machine web actor for organization ${org.metadata.recordId.entityId}`,
        );
      }
    }
  }
  /** End mop-up step, which can be deleted once all existing instances have been migrated */

  return migrationState;
};

export default migrate;
