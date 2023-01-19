import { createKratosIdentity } from "@hashintel/hash-api/src/auth/ory-kratos";
import {
  createGraphClient,
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
} from "@hashintel/hash-api/src/graph";
import { createOrg } from "@hashintel/hash-api/src/graph/knowledge/system-types/org";
import {
  createUser,
  updateUserShortname,
} from "@hashintel/hash-api/src/graph/knowledge/system-types/user";
import { ensureSystemTypesExist } from "@hashintel/hash-api/src/graph/system-types";
import { systemUserAccountId } from "@hashintel/hash-api/src/graph/system-user";
import { StorageType } from "@hashintel/hash-api/src/storage";
import { getRequiredEnv } from "@hashintel/hash-api/src/util";
import { Logger } from "@local/hash-backend-utils/logger";

import { OrgSize } from "../graphql/api-types.gen";

const randomStringSuffix = () => {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  return new Array(6)
    .fill(undefined)
    .map(() => alphabet[Math.floor(Math.random() * alphabet.length)])
    .join("");
};

export const createTestImpureGraphContext = (): ImpureGraphContext => {
  const logger = new Logger({
    mode: "dev",
    level: "debug",
    serviceName: "integration-tests",
  });

  const graphApiHost = getRequiredEnv("HASH_GRAPH_API_HOST");
  const graphApiPort = parseInt(getRequiredEnv("HASH_GRAPH_API_PORT"), 10);

  const graphApi = createGraphClient(logger, {
    host: graphApiHost,
    port: graphApiPort,
  });
  return {
    graphApi,
    uploadProvider: {
      getFileEntityStorageKey: (_params: any) => {
        throw new Error(
          "File fetching not implemented in tests. Override with mock to test.",
        );
      },
      presignDownload: (_params: any) => {
        throw new Error(
          "File presign download not implemented in tests. Override with mock to test.",
        );
      },
      presignUpload: (_params: any) => {
        throw new Error(
          "File presign upload not implemented in tests. Override with mock to test.",
        );
      },
      storageType: StorageType.LocalFileSystem,
    },
  };
};

export const generateRandomShortname = (prefix?: string) =>
  `${prefix ?? ""}${randomStringSuffix()}`;

export const createTestUser = async (
  context: ImpureGraphContext,
  shortNamePrefix: string,
  logger: Logger,
) => {
  await ensureSystemGraphIsInitialized({ logger, context });

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

  const createdUser = await createUser(context, {
    emails: [`${shortname}@example.com`],
    kratosIdentityId,
    actorId: systemUserAccountId,
  }).catch((err) => {
    logger.error(`Error making UserModel for ${shortname}`);
    throw err;
  });

  return await updateUserShortname(context, {
    user: createdUser,
    updatedShortname: shortname,
    actorId: createdUser.accountId,
  }).catch((err) => {
    logger.error(`Error updating shortname for UserModel to ${shortname}`);
    throw err;
  });
};

export const createTestOrg = async (
  context: ImpureGraphContext,
  shortNamePrefix: string,
  logger: Logger,
) => {
  await ensureSystemTypesExist({ logger, context });

  const shortname = generateRandomShortname(shortNamePrefix);

  return await createOrg(context, {
    name: "Test org",
    shortname,
    providedInfo: {
      orgSize: OrgSize.ElevenToFifty,
    },
    actorId: systemUserAccountId,
  });
};
