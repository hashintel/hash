import { Logger } from "@local/hash-backend-utils/logger";
import { systemTypes } from "@local/hash-isomorphic-utils/ontology-types";
import { AccountId } from "@local/hash-subgraph";

import { publicUserAccountId } from "../graphql/context";
import { ImpureGraphContext } from "./index";
import { createAccount } from "./knowledge/system-types/account.fields";
import { getEntityTypeById } from "./ontology/primitive/entity-type";

// eslint-disable-next-line import/no-mutable-exports
export let systemAccountId: AccountId;

const authentication = { actorId: publicUserAccountId };

/**
 * Ensure the `systemAccountId` exists by fetching it or creating it. Note this
 * method is designed to be run before the system types are initialized.
 */
export const ensureSystemAccountExists = async (params: {
  logger: Logger;
  context: ImpureGraphContext;
}) => {
  const { logger, context } = params;

  try {
    // The system account is the creator of the system types
    const orgEntityType = await getEntityTypeById(context, authentication, {
      entityTypeId: systemTypes.entityType.org.entityTypeId,
    });

    logger.info(`Using existing system account id: ${systemAccountId}`);
    systemAccountId =
      orgEntityType.metadata.custom.provenance.recordCreatedById;
  } catch {
    // We don't have any system types yet, so we need to create the system account, which will create them

    systemAccountId = await createAccount(context, authentication, {});
    logger.info(`Created system user account id: ${systemAccountId}`);
  }
};
