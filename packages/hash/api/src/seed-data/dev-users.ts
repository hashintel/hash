import { Logger } from "@hashintel/hash-backend-utils/logger";
import { AxiosError } from "axios";

import { GraphApi } from "../graph";
import { UserModel } from "../model";
import { systemAccountId } from "../model/util";
import { createKratosIdentity } from "../auth/ory-kratos";
import { isDevEnv } from "../lib/env-config";

type DevelopmentUser = {
  email: string;
  shortname: string;
  preferredName: string;
  isInstanceAdmin?: boolean;
  // If not set, default to "password"
  password?: string;
};

const devUsers: readonly DevelopmentUser[] = [
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

export const ensureDevUsersAreSeeded = async ({
  graphApi,
  logger,
}: {
  graphApi: GraphApi;
  logger: Logger;
}): Promise<UserModel[]> => {
  const createdUsers = [];

  // Only use `devUsers` if we are in a dev environment
  let usersToSeed = isDevEnv ? devUsers : [];

  // Or if we're explicitly setting users to seed.
  if (process.env.HASH_SEED_USERS) {
    try {
      usersToSeed = JSON.parse(
        process.env.HASH_SEED_USERS,
      ) as DevelopmentUser[];
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
          `Could not create development user identity, email = "${email}".`,
        );
        return Promise.reject(error);
      }
    });

    if (maybeNewIdentity !== null) {
      const { traits, id: kratosIdentityId } = maybeNewIdentity;
      const { emails } = traits;

      let user = await UserModel.createUser(graphApi, {
        emails,
        kratosIdentityId,
        actorId: systemAccountId,
        isInstanceAdmin,
      });

      user = await user.updateShortname(graphApi, {
        updatedShortname: shortname,
        actorId: systemAccountId,
      });

      user = await user.updatePreferredName(graphApi, {
        updatedPreferredName: preferredName,
        actorId: systemAccountId,
      });

      createdUsers.push(user);
    }

    logger.info(`Development User available, email = "${email}".`);
  }

  return createdUsers;
};
