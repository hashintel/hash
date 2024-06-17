import { isSelfHostedInstance } from "@local/hash-isomorphic-utils/instance";

import {
  createUser,
  getUserByKratosIdentityId,
} from "../../../knowledge/system-types/user";
import type { MigrationFunction } from "../types";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  if (isSelfHostedInstance) {
    /**
     * Fix is only relevant to hosted HASH, i.e. the instance at https://[app].hash.ai
     */
    return migrationState;
  }

  const incompleteUsers = process.env.INCOMPLETE_USER_ACCOUNTS;

  if (!incompleteUsers) {
    return migrationState;
  }

  try {
    const incompleteUserSets = JSON.parse(incompleteUsers) as [
      string,
      string,
    ][];
    for (const user of incompleteUserSets) {
      const kratosIdentityId = user[0];

      const existingUser = await getUserByKratosIdentityId(
        context,
        authentication,
        {
          kratosIdentityId,
        },
      );
      if (!existingUser) {
        await createUser(context, authentication, {
          emails: [user[1]],
          kratosIdentityId,
        });
      }
    }

    return migrationState;
  } catch (err) {
    throw new Error(
      `Could not parse incomplete user accounts: ${(err as Error).message}`,
    );
  }
};

export default migrate;
