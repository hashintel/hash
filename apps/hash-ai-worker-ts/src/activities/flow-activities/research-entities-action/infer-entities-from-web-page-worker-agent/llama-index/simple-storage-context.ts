import { access, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Subtype } from "@local/advanced-types/subtype";
import type { StorageContext } from "llamaindex";
import {
  SimpleDocumentStore,
  SimpleIndexStore,
  SimpleVectorStore,
} from "llamaindex";

export type SimpleStorageContext = Subtype<
  StorageContext,
  {
    docStore: SimpleDocumentStore;
    indexStore: SimpleIndexStore;
    vectorStore: SimpleVectorStore;
  }
>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const baseFilePath = join(__dirname, "/var/tmp_files");

const generateSimpleStorageContextFilePaths = (params: { hash: string }) => {
  const { hash } = params;

  const directoryPath = `${baseFilePath}/storage/${hash}`;

  return {
    directoryPath,
    vectorStorePath: `${directoryPath}/vector-store.json`,
    docStorePath: `${directoryPath}/doc-store.json`,
    indexStorePath: `${directoryPath}/index-store.json`,
  };
};

export const retrieveSimpleStorageContext = async (params: {
  hash: string;
}): Promise<{ simpleStorageContext: SimpleStorageContext | undefined }> => {
  const { hash } = params;

  const { directoryPath, vectorStorePath, docStorePath, indexStorePath } =
    generateSimpleStorageContextFilePaths({ hash });

  try {
    // Check directory exists
    await access(directoryPath);

    await Promise.all([
      access(vectorStorePath),
      // access(docStorePath),
      access(indexStorePath),
    ]);

    const simpleStorageContext: SimpleStorageContext = {
      vectorStore: await SimpleVectorStore.fromPersistPath(vectorStorePath),
      docStore: await SimpleDocumentStore.fromPersistPath(docStorePath),
      indexStore: await SimpleIndexStore.fromPersistPath(indexStorePath),
    };

    return { simpleStorageContext };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      `Failed to retrieve storage context: ${(error as Error).message}`,
    );
    return { simpleStorageContext: undefined };
  }
};

export const persistSimpleStorageContext = async (params: {
  hash: string;
  simpleStorageContext: SimpleStorageContext;
}) => {
  const { hash, simpleStorageContext } = params;

  const { vectorStore, docStore, indexStore } = simpleStorageContext;

  const { directoryPath, vectorStorePath, docStorePath, indexStorePath } =
    generateSimpleStorageContextFilePaths({ hash });

  try {
    await access(directoryPath);
  } catch {
    // If the directory does not exist, create it recursively
    await mkdir(directoryPath, { recursive: true });
  }

  await vectorStore.persist(vectorStorePath);
  /** @todo: figure out why this doesn't get created */
  await docStore.persist(docStorePath);
  await indexStore.persist(indexStorePath);
};
