import { createKratosIdentity } from "@hashintel/hash-api/src/auth/ory-kratos";
import {
  ensureSystemGraphIsInitialized,
  GraphApi,
  ImpureGraphContext,
} from "@hashintel/hash-api/src/graph";
import { createOrg } from "@hashintel/hash-api/src/graph/knowledge/system-types/org";
import {
  createUser,
  updateUserShortname,
} from "@hashintel/hash-api/src/graph/knowledge/system-types/user";
import { ensureSystemTypesExist } from "@hashintel/hash-api/src/graph/system-types";
import { systemUserAccountId } from "@hashintel/hash-api/src/graph/system-user";
import { StorageType } from "@hashintel/hash-api/src/graphql/api-types.gen";
import { PresignedPostUpload } from "@hashintel/hash-api/src/storage";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import { OrgSize } from "../graphql/api-types.gen";

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
  await ensureSystemGraphIsInitialized({ graphApi, logger });

  const graphContext: ImpureGraphContext = {
    graphApi,
    storage: {
      getFileEntityStorageKey: (_params) => "n/a",
      presignDownload: (_params) => Promise.resolve("n/a"),
      presignUpload: (_params) => Promise.resolve({} as PresignedPostUpload),
      storageType: StorageType.LocalFileSystem,
    },
  };

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

  const createdUser = await createUser(graphContext, {
    emails: [`${shortname}@example.com`],
    kratosIdentityId,
    actorId: systemUserAccountId,
  }).catch((err) => {
    logger.error(`Error making UserModel for ${shortname}`);
    throw err;
  });

  return await updateUserShortname(graphContext, {
    user: createdUser,
    updatedShortname: shortname,
    actorId: createdUser.accountId,
  }).catch((err) => {
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

  return await createOrg(
    { graphApi },
    {
      name: "Test org",
      shortname,
      providedInfo: {
        orgSize: OrgSize.ElevenToFifty,
      },
      actorId: systemUserAccountId,
    },
  );
};
