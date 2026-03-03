import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { type StorageContext, storageContextFromDefaults } from "llamaindex";

import { logger } from "../../../../shared/activity-logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseFilePath = path.join(__dirname, "/var/tmp_files");

export interface Storage extends StorageContext {
  directory: string;
}

const directory = ({ hash }: { hash: string }) => {
  return `${baseFilePath}/storage/${hash}`;
};

export const createStorageContext = async ({ hash }: { hash: string }) => {
  const directoryPath = directory({ hash });

  try {
    await fs.mkdir(directoryPath, { recursive: true });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      logger.info(
        `Unable to create directory ${directoryPath}: ${(error as Error).message}`,
      );
    }
  }

  const context = await storageContextFromDefaults({
    persistDir: directoryPath,
  });

  return { ...context, directory: directoryPath };
};

const ensurePromise = <T>(value: T | Promise<T>): Promise<T> =>
  value instanceof Promise ? value : Promise.resolve(value);

export const persistStorageContext = ({
  storageContext: { vectorStores, docStore, indexStore },
}: {
  storageContext: StorageContext;
}) => {
  const promises: Promise<void>[] = [];

  const pushPersist = (store: object | undefined) => {
    if (store && "persist" in store) {
      const persist = store.persist as () => Promise<void> | void;
      promises.push(ensurePromise(persist()));
    }
  };

  for (const store of Object.values(vectorStores)) {
    pushPersist(store);
  }
  /** @todo: figure out why this doesn't get created */
  pushPersist(docStore);
  pushPersist(indexStore);

  return Promise.all(promises);
};
