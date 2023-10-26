import { createKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import {
  createGraphClient,
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
} from "@apps/hash-api/src/graph";
import { createOrg } from "@apps/hash-api/src/graph/knowledge/system-types/org";
import { createUser } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { ensureSystemTypesExist } from "@apps/hash-api/src/graph/system-types";
import {
  AuthenticationContext,
  publicUserAccountId,
} from "@apps/hash-api/src/graphql/context";
import { StorageType } from "@apps/hash-api/src/storage";
import { getRequiredEnv } from "@apps/hash-api/src/util";
import { VersionedUrl } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";

import { OrgSize } from "../graphql/api-types.gen";

export const textDataTypeId =
  "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1" as VersionedUrl;
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
    logger.error(
      `Error when creating Kratos Identity, ${shortname}: ${
        (err as Error).message
      }`,
    );
    throw err;
  });

  const kratosIdentityId = identity.id;

  return createUser(
    context,
    { actorId: publicUserAccountId },
    {
      emails: [`${shortname}@example.com`],
      kratosIdentityId,
      shortname,
      preferredName: shortname,
    },
  ).catch((err) => {
    logger.error(`Error making UserModel for ${shortname}`);
    throw err;
  });
};

export const createTestOrg = async (
  context: ImpureGraphContext,
  authentication: AuthenticationContext,
  shortNamePrefix: string,
  logger: Logger,
) => {
  await ensureSystemTypesExist({ logger, context });

  const shortname = generateRandomShortname(shortNamePrefix);

  return createOrg(context, authentication, {
    name: "Test org",
    shortname,
    providedInfo: {
      orgSize: OrgSize.ElevenToFifty,
    },
  });
};
