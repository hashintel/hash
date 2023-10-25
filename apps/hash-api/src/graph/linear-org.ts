import { Logger } from "@local/hash-backend-utils/logger";

import { ImpureGraphContext } from "./index";
import { createOrg, getOrgByShortname } from "./knowledge/system-types/org";
import { systemAccountId } from "./system-accounts";

const linearOrgShortname = "linear";

/**
 * Ensure the linear org exists by fetching it or creating it using
 * the `linearUserAccountId`. Note this method must be run after the
 * `linearUserAccountId` and the linear types have been initialized.
 */
export const ensureLinearOrgExists = async (params: {
  logger: Logger;
  context: ImpureGraphContext;
}) => {
  const { logger, context } = params;
  const authentication = { actorId: systemAccountId };

  const existingLinearOrg = await getOrgByShortname(context, authentication, {
    shortname: linearOrgShortname,
  });

  if (existingLinearOrg) {
    return existingLinearOrg;
  } else {
    const shortname = linearOrgShortname;
    const name = "Linear";

    const linearOrg = await createOrg(context, authentication, {
      shortname,
      name,
    });

    logger.info(
      `Linear org available with shortname = "${linearOrg.shortname}"`,
    );

    return linearOrg;
  }
};
