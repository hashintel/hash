import { Logger } from "@local/hash-backend-utils/logger";

import { createKratosIdentity } from "../auth/ory-kratos";
import { ImpureGraphContext } from "./index";
import { createUser, getUserByShortname } from "./knowledge/system-types/user";
import { systemUserAccountId } from "./system-user";

const linearUserShortname = "linear";

/**
 * Ensure the `linearUser` exists by fetching it or creating it using
 * the `linearUserAccountId`. Note this method must be run after the
 * `linearUserAccountId` and the linear types have been initialized.
 */
export const ensureLinearUserExists = async (params: {
  logger: Logger;
  context: ImpureGraphContext;
}) => {
  const { logger, context } = params;

  const existingLinearUser = await getUserByShortname(context, {
    shortname: linearUserShortname,
  });

  if (existingLinearUser) {
    return existingLinearUser;
  } else {
    const shortname = linearUserShortname;
    const preferredName = "Linear";
    const emailAddress = "linear@example.com";
    const password = "linear";

    const { id: kratosIdentityId } = await createKratosIdentity({
      traits: {
        shortname,
        emails: [emailAddress],
      },
      credentials: { password: { config: { password } } },
    });

    const linearUser = await createUser(context, {
      shortname,
      actorId: systemUserAccountId,
      preferredName,
      emails: [emailAddress],
      kratosIdentityId,
    });

    logger.info(
      `Linear user available with shortname = "${linearUser.shortname}"`,
    );

    return linearUser;
  }
};
