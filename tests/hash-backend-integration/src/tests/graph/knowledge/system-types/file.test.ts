import {
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
} from "@apps/hash-api/src/graph";
import {
  createFileFromExternalUrl,
  createFileFromUploadRequest,
} from "@apps/hash-api/src/graph/knowledge/system-types/file";
import { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { SYSTEM_TYPES } from "@apps/hash-api/src/graph/system-types";
import { StorageType } from "@apps/hash-api/src/storage";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";
import { OwnedById } from "@local/hash-subgraph/main";

import { createTestImpureGraphContext, createTestUser } from "../../../util";

jest.setTimeout(60000);

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

describe("File", () => {
  /* eslint-disable @typescript-eslint/unbound-method */
  const mediaType = "image";
  let testUser: User;

  beforeAll(async () => {
    const graphContext: ImpureGraphContext = createTestImpureGraphContext();
    await TypeSystemInitializer.initialize();
    await ensureSystemGraphIsInitialized({ logger, context: graphContext });

    testUser = await createTestUser(graphContext, "fileTest", logger);
  });

  it("createFileFromUploadRequest can create a file entity from a file", async () => {
    const graphContext: ImpureGraphContext = createTestImpureGraphContext();

    const fileKey = "mock-test-key";
    const downloadUrl = "mock-download-url";
    const uploadUrl = "mock-upload-url";

    graphContext.uploadProvider = {
      getFileEntityStorageKey: jest.fn(() => fileKey),
      presignDownload: jest.fn(() => Promise.resolve(downloadUrl)),
      presignUpload: jest.fn(() =>
        Promise.resolve({ url: uploadUrl, fields: {} }),
      ),
      storageType: StorageType.LocalFileSystem,
    };

    const file = await createFileFromUploadRequest(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      actorId: testUser.accountId,
      mediaType,
      size: 100,
    });

    expect(file.presignedPost.url).toEqual(uploadUrl);

    expect(
      (
        file.entity.properties[
          SYSTEM_TYPES.propertyType.fileUrl.metadata.recordId.baseUri
        ] as string
      ).endsWith(fileKey),
    ).toBeTruthy();

    expect(
      file.entity.properties[
        SYSTEM_TYPES.propertyType.fileMediaType.metadata.recordId.baseUri
      ],
    ).toEqual(mediaType);

    expect(graphContext.uploadProvider.getFileEntityStorageKey).toBeCalledTimes(
      1,
    );
    expect(graphContext.uploadProvider.presignUpload).toBeCalledTimes(1);
  });

  const externalUrl = "https://placekitten.com/200/300";

  it("createFileFromExternalUrl can create a file entity from an external link", async () => {
    const graphContext: ImpureGraphContext = createTestImpureGraphContext();

    const file = await createFileFromExternalUrl(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      actorId: testUser.accountId,
      mediaType,
      url: externalUrl,
    });

    expect(
      file.properties[
        SYSTEM_TYPES.propertyType.fileUrl.metadata.recordId.baseUri
      ],
    ).toEqual(externalUrl);

    expect(
      file.properties[
        SYSTEM_TYPES.propertyType.fileMediaType.metadata.recordId.baseUri
      ],
    ).toEqual(mediaType);

    expect(
      file.properties[
        SYSTEM_TYPES.propertyType.fileKey.metadata.recordId.baseUri
      ],
    ).toEqual({
      [SYSTEM_TYPES.propertyType.externalFileUrl.metadata.recordId.baseUri]:
        externalUrl,
    });
  });
});
