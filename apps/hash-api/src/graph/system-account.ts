import { Logger } from "@local/hash-backend-utils/logger";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { AccountId, BaseUrl } from "@local/hash-subgraph";
import { versionedUrlFromComponents } from "@local/hash-subgraph/type-system-patch";

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
      /**
       * We want to use the first version of the `Organization` entity type,
       * so that the system account can be determined in early migration
       * steps where only the first version is available.
       */
      entityTypeId: versionedUrlFromComponents(
        systemEntityTypes.organization.entityTypeBaseUrl as BaseUrl,
        1,
      ),
    });

    systemAccountId = orgEntityType.metadata.provenance.edition.createdById;

    logger.debug(`Using existing system account id: ${systemAccountId}`);
  } catch {
    // We don't have any system types yet, so we need to create the system account, which will create them

    systemAccountId = await createAccount(context, authentication, {});
    logger.info(`Created system user account id: ${systemAccountId}`);
  }
};
