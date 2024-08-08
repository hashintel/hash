import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import {
  createFileFromExternalUrl,
  createFileFromUploadRequest,
} from "@apps/hash-api/src/graph/knowledge/system-types/file";
import type { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { Logger } from "@local/hash-backend-utils/logger";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { Timestamp } from "@local/hash-graph-types/temporal-versioning";
import type { OwnedById } from "@local/hash-graph-types/web";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { resetGraph } from "../../../test-server";
import { createTestImpureGraphContext, createTestUser } from "../../../util";

const logger = new Logger({
  environment: "test",
  level: "debug",
  serviceName: "integration-tests",
});

describe("File", () => {
  let testUser: User;

  beforeAll(async () => {
    const graphContext = createTestImpureGraphContext();
    await ensureSystemGraphIsInitialized({ logger, context: graphContext });

    testUser = await createTestUser(graphContext, "fileTest", logger);

    return async () => {
      await deleteKratosIdentity({
        kratosIdentityId: testUser.kratosIdentityId,
      });

      await resetGraph();
    };
  });

  it("createFileFromUploadRequest can create a file entity from a file", async () => {
    const graphContext = createTestImpureGraphContext();
    const authentication = { actorId: testUser.accountId };

    const entityId = "abc~123" as EntityId;
    const editionIdentifier = "ed123" as Timestamp;
    const fileKey = `${entityId}/${editionIdentifier}/mock-test-key` as const;
    const downloadUrl = "mock-download-url";
    const uploadUrl = "mock-upload-url";

    graphContext.uploadProvider = {
      getFileEntityStorageKey: vi.fn(() => fileKey),
      presignDownload: vi.fn(() => Promise.resolve(downloadUrl)),
      presignUpload: vi.fn(() =>
        Promise.resolve({
          fileStorageProperties: {
            value: {
              "https://hash.ai/@hash/types/property-type/file-storage-key/": {
                value: fileKey,
                metadata: {
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                },
              },
              "https://hash.ai/@hash/types/property-type/file-storage-provider/":
                {
                  value: "LOCAL_FILE_SYSTEM",
                  metadata: {
                    dataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                  },
                },
            },
          } as const,
          presignedPut: { url: uploadUrl },
        }),
      ),
      storageType: "LOCAL_FILE_SYSTEM",
    };

    const file = await createFileFromUploadRequest(
      graphContext,
      authentication,
      {
        name: "test-file",
        fileEntityCreationInput: { ownedById: testUser.accountId as OwnedById },
        size: 100,
      },
    );

    expect(file.presignedPut.url).toEqual(uploadUrl);

    expect(
      file.entity.properties[
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/"
      ].endsWith(fileKey),
    ).toBeTruthy();

    expect(graphContext.uploadProvider.getFileEntityStorageKey).toBeCalledTimes(
      1,
    );
    expect(graphContext.uploadProvider.presignUpload).toBeCalledTimes(1);
  });

  const externalUrl = "https://placekitten.com/200/300";

  it("createFileFromExternalUrl can create a file entity from an external link", async () => {
    const graphContext = createTestImpureGraphContext();
    const authentication = { actorId: testUser.accountId };

    const file = await createFileFromExternalUrl(graphContext, authentication, {
      fileEntityCreationInput: { ownedById: testUser.accountId as OwnedById },
      url: externalUrl,
    });

    expect(
      file.properties[
        "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/"
      ],
    ).toEqual(externalUrl);
  });
});
