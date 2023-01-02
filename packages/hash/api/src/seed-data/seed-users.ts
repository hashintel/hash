import { Logger } from "@hashintel/hash-backend-utils/logger";
import { AxiosError } from "axios";

import { createKratosIdentity } from "../auth/ory-kratos";
import { GraphApi } from "../graph";
import {
  createUser,
  updateUserPreferredName,
  updateUserShortname,
  User,
} from "../graph/knowledge/system-types/user";
import { systemUserAccountId } from "../graph/system-user";
import { isDevEnv } from "../lib/env-config";

type SeededUser = {
  email: string;
  shortname: string;
  preferredName: string;
  isInstanceAdmin?: boolean;
  // If not set, default to "password"
  password?: string;
};

const devUsers: readonly SeededUser[] = [
  {
    email: "admin@example.com",
    shortname: "instance-admin",
    preferredName: "Instance Admin",
    isInstanceAdmin: true,
  },
  {
    email: "alice@example.com",
    shortname: "alice",
    preferredName: "Alice",
  },
  {
    email: "bob@example.com",
    shortname: "bob01",
    preferredName: "Bob",
  },
] as const;

export const ensureUsersAreSeeded = async ({
  graphApi,
  logger,
}: {
  graphApi: GraphApi;
  logger: Logger;
}): Promise<User[]> => {
  const createdUsers = [];

  // Only use `devUsers` if we are in a dev environment
  let usersToSeed = isDevEnv ? devUsers : [];

  // Or if we're explicitly setting users to seed.
  if (process.env.HASH_SEED_USERS) {
    try {
      /** @todo validate the JSON parsed from the environment. */
      usersToSeed = JSON.parse(process.env.HASH_SEED_USERS) as SeededUser[];
    } catch (error) {
      logger.error(
        "Could not parse environment variable `HASH_SEED_USERS` as JSON. Make sure it's formatted correctly.",
      );
    }
  }

  for (let index = 0; index < usersToSeed.length; index++) {
    const {
      email,
      shortname,
      preferredName,
      password = "password",
      isInstanceAdmin,
    } = usersToSeed[index]!;

    if (!(email && shortname && preferredName)) {
      logger.error(
        `User entry at index ${index} is missing email, shortname or preferredName!`,
      );
      continue;
    }
    const maybeNewIdentity = await createKratosIdentity({
      traits: { emails: [email] },
      credentials: {
        password: {
          config: {
            password,
          },
        },
      },
    }).catch((error: AxiosError) => {
      if (error.response?.status === 409) {
        // The user already exists on 409 CONFLICT, which is fine
        return null;
      } else {
        logger.warn(
          `Could not create seeded user identity, email = "${email}".`,
        );
        return Promise.reject(error);
      }
    });

    if (maybeNewIdentity !== null) {
      const { traits, id: kratosIdentityId } = maybeNewIdentity;
      const { emails } = traits;

      let user = await createUser(
        { graphApi },
        {
          emails,
          kratosIdentityId,
          actorId: systemUserAccountId,
          isInstanceAdmin,
        },
      );

      user = await updateUserShortname(
        { graphApi },
        {
          user,
          updatedShortname: shortname,
          actorId: systemUserAccountId,
        },
      );

      user = await updateUserPreferredName(
        { graphApi },
        {
          user,
          updatedPreferredName: preferredName,
          actorId: systemUserAccountId,
        },
      );

      createdUsers.push(user);
    }

    logger.info(`Seeded User available, email = "${email}".`);
  }

  return createdUsers;
};
