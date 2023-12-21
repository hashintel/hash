import { Logger } from "@local/hash-backend-utils/logger";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { AccountId } from "@local/hash-subgraph";

import { publicUserAccountId } from "../auth/public-user-account-id";
import { createAccount } from "./account-permission-management";
import { ImpureGraphContext } from "./context-types";
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

    systemAccountId = orgEntityType.metadata.provenance.createdById;

    logger.debug(`Using existing system account id: ${systemAccountId}`);
  } catch {
    // We don't have any system types yet, so we need to create the system account, which will create them

    systemAccountId = await createAccount(context, authentication, {});
    logger.info(`Created system user account id: ${systemAccountId}`);
  }
};
