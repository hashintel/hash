import { createKratosIdentity } from "@hashintel/hash-api/src/auth/ory-kratos";
import {
  ensureHashAppIsInitialized,
  GraphApi,
} from "@hashintel/hash-api/src/graph";
import { OrgModel, UserModel } from "@hashintel/hash-api/src/model";
import { ensureSystemTypesExist } from "@hashintel/hash-api/src/graph/system-types";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { systemUserAccountId } from "@hashintel/hash-api/src/graph/system-user";
import { OrgSize } from "../graphql/apiTypes.gen";

const randomStringSuffix = () => {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  return new Array(6)
    .fill(undefined)
    .map(() => alphabet[Math.floor(Math.random() * alphabet.length)])
    .join("");
};

export const generateRandomShortname = (prefix?: string) =>
  `${prefix ?? ""}${randomStringSuffix()}`;

export const createTestUser = async (
  graphApi: GraphApi,
  shortNamePrefix: string,
  logger: Logger,
) => {
  await ensureHashAppIsInitialized({ graphApi, logger });

  const shortname = generateRandomShortname(shortNamePrefix);

  const identity = await createKratosIdentity({
    traits: {
      shortname,
      emails: [`${shortname}@example.com`],
    },
  }).catch((err) => {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- error stringification may need improvement
    logger.error(`Error when creating Kratos Identity, ${shortname}: ${err}`);
    throw err;
  });

  const kratosIdentityId = identity.id;

  const createdUser = await UserModel.createUser(graphApi, {
    emails: [`${shortname}@example.com`],
    kratosIdentityId,
    actorId: systemUserAccountId,
  }).catch((err) => {
    logger.error(`Error making UserModel for ${shortname}`);
    throw err;
  });

  return await createdUser
    .updateShortname(graphApi, {
      updatedShortname: shortname,
      actorId: createdUser.getEntityUuid(),
    })
    .catch((err) => {
      logger.error(`Error updating shortname for UserModel to ${shortname}`);
      throw err;
    });
};

export const createTestOrg = async (
  graphApi: GraphApi,
  shortNamePrefix: string,
  logger: Logger,
) => {
  await ensureSystemTypesExist({ graphApi, logger });

  const shortname = generateRandomShortname(shortNamePrefix);

  return await OrgModel.createOrg(graphApi, {
    name: "Test org",
    shortname,
    providedInfo: {
      orgSize: OrgSize.ElevenToFifty,
    },
    actorId: systemUserAccountId,
  });
};
