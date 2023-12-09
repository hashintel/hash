import { Logger } from "@local/hash-backend-utils/logger";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { AccountId } from "@local/hash-subgraph";

import { publicUserAccountId } from "../auth/public-user-account-id";
import { createAccount } from "./account-permission-management";
import { ImpureGraphContext } from "./context-types";
import {
  createMachineEntity,
  getMachineEntity,
} from "./knowledge/system-types/machine";
import { getOrgByShortname } from "./knowledge/system-types/org";
import { getEntityTypeById } from "./ontology/primitive/entity-type";

// eslint-disable-next-line import/no-mutable-exports
export let systemAccountId: AccountId;

const authentication = { actorId: publicUserAccountId };

/**
 * Ensure the `systemAccountId` exists by fetching it or creating it. Note this
 * method is designed to be run before the system types are initialized.
 */
export const ensureHashSystemAccountExists = async (params: {
  logger: Logger;
  context: ImpureGraphContext;
}) => {
  const { logger, context } = params;

  try {
    // The system account is the creator of the HASH system types
    const orgEntityType = await getEntityTypeById(context, authentication, {
      entityTypeId: systemEntityTypes.organization.entityTypeId,
    });

    systemAccountId =
      orgEntityType.metadata.custom.provenance.recordCreatedById;

    logger.info(`Using existing system account id: ${systemAccountId}`);
  } catch {
    // We don't have any system types yet, so we need to create the system account, which will create them

    systemAccountId = await createAccount(context, authentication, {});
    logger.info(`Created system user account id: ${systemAccountId}`);
  }

  /**
   * Ensure that the HASH system account has a machine entity associated with it.
   * This is normally handled in {@link getOrCreateOwningAccountGroupId}, but we may be on an instance
   *    that went through the initial migration before that function created entities to associate with machine actors.
   * In practice this is only relevant for the central HASH instance, and can be removed once it's run once,
   *    in favour of letting the `getOrCreateOwningAccountGroupId` function handle it for new instances.
   */
  try {
    await getMachineEntity(context, authentication, {
      identifier: "hash",
    });
  } catch {
    const foundOrg = await getOrgByShortname(
      context,
      { actorId: systemAccountId },
      {
        shortname: "hash",
      },
    );

    if (!foundOrg) {
      /** we don't have a HASH org yet, we can let {@link getOrCreateOwningAccountGroupId} handle it */
      return;
    }

    await createMachineEntity(context, {
      machineAccountId: systemAccountId,
      identifier: "hash",
      owningWebAccountGroupId: foundOrg.accountGroupId,
    });
  }
};
