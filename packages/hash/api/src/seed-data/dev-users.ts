import { Logger } from "@hashintel/hash-backend-utils/logger";
import { AxiosError } from "axios";

import { GraphApi } from "../graph";
import { UserModel } from "../model";
import { systemAccountId } from "../model/util";
import { createKratosIdentity } from "../auth/ory-kratos";

type DevelopmentUser = {
  email: string;
  shortname: string;
  preferredName: string;
  isInstanceAdmin?: boolean;
};

const devUsers: readonly DevelopmentUser[] = [
  {
    email: "admin@example.com",
    shortname: "instance-admin",
    preferredName: "Instance Admin",
    /** @todo: bring back instance admins when links are working again */
    // isInstanceAdmin: true,
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

const devPassword = "password";

export const ensureDevUsersAreSeeded = async ({
  graphApi,
  logger,
}: {
  graphApi: GraphApi;
  logger: Logger;
}): Promise<UserModel[]> => {
  const createdUsers = [];

  for (const { email, shortname, preferredName, isInstanceAdmin } of devUsers) {
    const maybeNewIdentity = await createKratosIdentity({
      traits: { emails: [email] },
      credentials: {
        password: {
          config: {
            password: devPassword,
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

    logger.info(
      `Development User available, email = "${email}" password = "${devPassword}".`,
    );
  }

  return createdUsers;
};
