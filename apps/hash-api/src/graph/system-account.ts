import type { MachineId } from "@blockprotocol/type-system";
import type { Logger } from "@local/hash-backend-utils/logger";

import type { ImpureGraphContext } from "./context-types";

// eslint-disable-next-line import/no-mutable-exports
export let systemAccountId: MachineId;

/**
 * Ensure the `systemAccountId` exists by fetching it or creating it. Note this
 * method is designed to be run before the system types are initialized.
 */
export const ensureHashSystemAccountExists = async (params: {
  logger: Logger;
  context: ImpureGraphContext;
}) => {
  const { logger, context } = params;

  systemAccountId = await context.graphApi
    .getOrCreateSystemAccount()
    .then(({ data: machineId }) => machineId as MachineId);

  logger.info(`Using system account ${systemAccountId}`);
};
