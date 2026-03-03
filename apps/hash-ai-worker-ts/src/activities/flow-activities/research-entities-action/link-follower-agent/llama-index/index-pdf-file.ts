import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import stream from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";

import { PDFReader } from "@llamaindex/readers/pdf";
import { VectorStoreIndex } from "llamaindex";
import md5 from "md5";

import { logger } from "../../../../shared/activity-logger.js";
import {
  createStorageContext,
  persistStorageContext,
} from "./simple-storage-context.js";

const fileExists = async (path: string) => {
  try {
    await fs.access(path, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

export const indexPdfFile = async (params: {
  fileUrl: string;
}): Promise<{ vectorStoreIndex: VectorStoreIndex }> => {
  const { fileUrl } = params;

  const hashedUrl = md5(fileUrl);

  const storageContext = await createStorageContext({
    hash: hashedUrl,
  });

  const filePath = `${storageContext.directory}/file.pdf`;
  const exists = await fileExists(filePath);

  let vectorStoreIndex;

  if (exists) {
    logger.info("Retrieved existing storage context");

    vectorStoreIndex = await VectorStoreIndex.init({
      storageContext,
    });
  } else {
    logger.info("File has not been indexed yet. Downloading...");

    const response = await fetch(fileUrl);

    if (!response.ok || !response.body) {
      throw new Error(`Failed to fetch ${fileUrl}: ${response.statusText}`);
    }

    try {
      const fileStream = createWriteStream(filePath);
      await stream.finished(
        Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(
          fileStream,
        ),
      );
    } catch (error) {
      await fs.unlink(filePath);
      throw new Error(
        `Failed to write file to file system: ${(error as Error).message}`,
      );
    }

    logger.info("PDF File downloaded successfully");

    const documents = await new PDFReader().loadData(filePath);

    logger.info(`Loaded PDF File as ${documents.length} documents`);

    vectorStoreIndex = await VectorStoreIndex.fromDocuments(documents, {
      storageContext,
    });

    if (process.env.NODE_ENV === "development") {
      /**
       * In development, cache the storage context for faster iteration
       * when testing the same PDF file.
       */
      await persistStorageContext({
        storageContext,
      });
    } else {
      /**
       * In production, remove the PDF file from disk once it's been
       * indexed in the simple vector store.
       */
      await fs.rm(filePath);
    }
  }

  return { vectorStoreIndex };
};
