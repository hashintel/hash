import { createKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import type { ImpureGraphContext } from "@apps/hash-api/src/graph/context-types";
import { createOrg } from "@apps/hash-api/src/graph/knowledge/system-types/org";
import { createUser } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { systemAccountId } from "@apps/hash-api/src/graph/system-account";
import type { VersionedUrl } from "@blockprotocol/type-system";
import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { Logger } from "@local/hash-backend-utils/logger";
import type { TemporalClient } from "@local/hash-backend-utils/temporal";
import type { AuthenticationContext } from "@local/hash-graph-sdk/authentication-context";
import { vi } from "vitest";

export const textDataTypeId =
  "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1" as VersionedUrl;
const randomStringSuffix = () => {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  return new Array(6)
    .fill(undefined)
    .map(() => alphabet[Math.floor(Math.random() * alphabet.length)])
    .join("");
};

export const createTestImpureGraphContext = (): ImpureGraphContext<
  true,
  true
> => {
  const logger = new Logger({
    environment: "test",
    level: "debug",
    serviceName: "integration-tests",
  });

  const graphApiHost = getRequiredEnv("HASH_GRAPH_API_HOST");
  const graphApiPort = parseInt(getRequiredEnv("HASH_GRAPH_API_PORT"), 10);

  const graphApi = createGraphClient(logger, {
    host: graphApiHost,
    port: graphApiPort,
  });

  const mockedTemporalClient = {
    workflow: {
      execute: vi.fn(),
    },
  } as unknown as TemporalClient;

  return {
    graphApi,
    provenance: {
      actorType: "machine",
      origin: {
        type: "api",
      },
    },
    uploadProvider: {
      getFileEntityStorageKey: (_params) => {
        throw new Error(
          "File fetching not implemented in tests. Override with mock to test.",
        );
      },
      presignDownload: (_params) => {
        throw new Error(
          "File presign download not implemented in tests. Override with mock to test.",
        );
      },
      presignUpload: (_params) => {
        throw new Error(
          "File presign upload not implemented in tests. Override with mock to test.",
        );
      },
      storageType: "LOCAL_FILE_SYSTEM",
    },
    temporalClient: mockedTemporalClient,
  };
};

export const generateRandomShortname = (prefix?: string) =>
  `${prefix ?? ""}${randomStringSuffix()}`;

export const createTestUser = async (
  context: ImpureGraphContext<false, true>,
  shortNamePrefix: string,
  logger: Logger,
) => {
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
    { actorId: systemAccountId },
    {
      emails: [`${shortname}@example.com`],
      kratosIdentityId,
      shortname,
      displayName: shortname,
    },
  ).catch((err) => {
    logger.error(`Error making UserModel for ${shortname}`);
    throw err;
  });
};

export const createTestOrg = async (
  context: ImpureGraphContext<false, true>,
  authentication: AuthenticationContext,
  shortNamePrefix: string,
) => {
  const shortname = generateRandomShortname(shortNamePrefix);

  return createOrg(context, authentication, {
    name: "Test org",
    shortname,
  });
};

const afterHookTriggerTimeout = 5_000;

export const waitForAfterHookTriggerToComplete = () =>
  new Promise((resolve) => {
    setTimeout(resolve, afterHookTriggerTimeout);
  });
