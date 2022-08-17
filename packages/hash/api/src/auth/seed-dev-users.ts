import { Logger } from "@hashintel/hash-backend-utils/logger";
import { AxiosError } from "axios";

import { GraphApi } from "../graph";
import { UserModel } from "../model";
import { adminKratosSdk, KratosUserIdentityTraits } from "./ory-kratos";

/** @todo shortname and fullName is currenlty unused,
      these need to be added to the UserModel creation step. */
type DevelopmentUser = {
  email: string;
  shortname: string;
  fullName: string;
};

const devUsers: readonly DevelopmentUser[] = [
  {
    email: "alice@example.com",
    shortname: "alice",
    fullName: "Alice Alison",
  },
  {
    email: "bob@example.com",
    shortname: "bob",
    fullName: "Bob Bobson",
  },
] as const;

const devPassword = "password";

export const seedDevUsers = async ({
  graphApi,
  logger,
}: {
  graphApi: GraphApi;
  logger: Logger;
}) => {
  for (const { email } of devUsers) {
    const maybeNewIdentity = await adminKratosSdk
      .adminCreateIdentity({
        schema_id: "default",
        traits: <KratosUserIdentityTraits>{
          emails: [email],
        },
        credentials: {
          password: {
            config: {
              password: devPassword,
            },
          },
        },
      })
      .then(async (response) => response.data)
      .catch((error: AxiosError) => {
        if (error.response?.status === 409) {
          // The user already exists on 409 CONFLICT, which is fine
          return Promise.resolve(null);
        } else {
          logger.warn(
            `Could not create development user identity, email = "${email}".`,
          );
          return Promise.reject(error);
        }
      });

    if (maybeNewIdentity !== null) {
      const { traits, id: kratosIdentityId } = maybeNewIdentity;
      const { emails } = traits as KratosUserIdentityTraits;
      // @todo use `shortname` and `fullName` when creating the Graph user entity.
      await UserModel.createUser(graphApi, {
        emails,
        kratosIdentityId,
      });
    }

    logger.info(
      `Development user available, email = "${email}" password = "${devPassword}".`,
    );
  }
};
