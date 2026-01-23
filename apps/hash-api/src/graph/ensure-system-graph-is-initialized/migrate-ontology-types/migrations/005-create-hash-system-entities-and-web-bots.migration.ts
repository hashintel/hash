import { extractWebIdFromEntityId } from "@blockprotocol/type-system";
import { NotFoundError } from "@local/hash-backend-utils/error";
import { getHashInstance } from "@local/hash-backend-utils/hash-instance";
import {
  createMachineActorEntity,
  getWebMachineEntity,
  getWebMachineId,
} from "@local/hash-backend-utils/machine-actors";

import { logger } from "../../../../logger";
import { createHashInstance } from "../../../knowledge/system-types/hash-instance";
import { systemAccountId } from "../../../system-account";
import {
  ensureSystemWebEntitiesExist,
  owningWebs,
} from "../../system-webs-and-entities";
import type { MigrationFunction } from "../types";
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

  const { name, websiteUrl } = owningWebs.h;

  const currentMachineEntityTypeId = getCurrentHashSystemEntityTypeId({
    entityTypeKey: "machine",
    migrationState,
  });

  const currentOrganizationEntityTypeId = getCurrentHashSystemEntityTypeId({
    entityTypeKey: "organization",
    migrationState,
  });

  const currentHashInstanceEntityTypeId = getCurrentHashSystemEntityTypeId({
    entityTypeKey: "hashInstance",
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
    webShortname: "h",
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
      await createHashInstance(context, systemAccountAuthentication, {
        hashInstanceEntityTypeId: currentHashInstanceEntityTypeId,
      });
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

  for (const principal of users.concat(orgs)) {
    const webId = extractWebIdFromEntityId(
      principal.metadata.recordId.entityId,
    );
    const webMachine = await getWebMachineEntity(context, authentication, {
      webId,
    });
    if (!webMachine) {
      const machineId = await getWebMachineId(context, authentication, {
        webId,
      }).then((maybeMachineId) => {
        if (!maybeMachineId) {
          throw new NotFoundError(`Failed to get machine for web ID: ${webId}`);
        }
        return maybeMachineId;
      });

      await createMachineActorEntity(context, {
        identifier: `system-${webId}`,
        logger,
        actor: { actorType: "machine", id: machineId },
        webId,
        displayName: "HASH",
        machineEntityTypeId: currentMachineEntityTypeId,
      });

      logger.info(
        `Created missing web machine entity with ID: ${principal.metadata.recordId.entityId}`,
      );
    }
  }
  /** End mop-up step, which can be deleted once all existing instances have been migrated */

  return migrationState;
};

export default migrate;
