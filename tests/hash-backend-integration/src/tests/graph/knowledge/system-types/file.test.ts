import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import {
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
} from "@apps/hash-api/src/graph";
import {
  createFileFromExternalUrl,
  createFileFromUploadRequest,
} from "@apps/hash-api/src/graph/knowledge/system-types/file";
import { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { StorageType } from "@apps/hash-api/src/storage";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";
import { OwnedById } from "@local/hash-subgraph";

import { resetGraph } from "../../../test-server";
import { createTestImpureGraphContext, createTestUser } from "../../../util";

jest.setTimeout(60000);

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

describe("File", () => {
  /* eslint-disable @typescript-eslint/unbound-method */
  let testUser: User;

  beforeAll(async () => {
    const graphContext: ImpureGraphContext = createTestImpureGraphContext();
    await TypeSystemInitializer.initialize();
    await ensureSystemGraphIsInitialized({ logger, context: graphContext });

    testUser = await createTestUser(graphContext, "fileTest", logger);
  });

  afterAll(async () => {
    await deleteKratosIdentity({
      kratosIdentityId: testUser.kratosIdentityId,
    });

    await resetGraph();
  });

  it("createFileFromUploadRequest can create a file entity from a file", async () => {
    const graphContext: ImpureGraphContext = createTestImpureGraphContext();
    const authentication = { actorId: testUser.accountId };

    const fileKey = "mock-test-key";
    const downloadUrl = "mock-download-url";
    const uploadUrl = "mock-upload-url";

    graphContext.uploadProvider = {
      getFileEntityStorageKey: jest.fn(() => fileKey),
      presignDownload: jest.fn(() => Promise.resolve(downloadUrl)),
      presignUpload: jest.fn(() => Promise.resolve({ url: uploadUrl })),
      storageType: StorageType.LocalFileSystem,
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
    const graphContext: ImpureGraphContext = createTestImpureGraphContext();
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
