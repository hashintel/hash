import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";

import {
  PDFReader,
  SimpleDocumentStore,
  SimpleIndexStore,
  SimpleVectorStore,
  VectorStoreIndex,
} from "llamaindex";
import md5 from "md5";

import type { SimpleStorageContext } from "./simple-storage-context";
import {
  persistSimpleStorageContext,
  retrieveSimpleStorageContext,
} from "./simple-storage-context";

/** @todo: replace with logger */
const log = (message: string) => {
  // eslint-disable-next-line no-console
  console.log(message);
};

export const indexPdfFile = async (params: {
  fileUrl: string;
}): Promise<{ vectorStoreIndex: VectorStoreIndex }> => {
  const { fileUrl } = params;

  const hashedUrl = md5(fileUrl);

  const { simpleStorageContext } = await retrieveSimpleStorageContext({
    hash: hashedUrl,
  });

  if (!simpleStorageContext) {
    log("No existing storage context found. Creating new one...");

    const response = await fetch(fileUrl);

    if (!response.ok || !response.body) {
      throw new Error(`Failed to fetch ${fileUrl}: ${response.statusText}`);
    }

    const fileDirectory = `./storage/${hashedUrl}`;

    await mkdir(fileDirectory, { recursive: true });

    const filePath = `${fileDirectory}/file.pdf`;

    try {
      const fileStream = createWriteStream(filePath);
      await finished(
        Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(
          fileStream,
        ),
      );
    } catch (error) {
      await unlink(filePath);
      throw new Error(
        `Failed to write file to file system: ${(error as Error).message}`,
      );
    }

    log("PDF File downloaded successfully");

    const documents = await new PDFReader().loadData(filePath);

    log(`Loaded PDF File as ${documents.length} documents`);

    const storageContext: SimpleStorageContext = {
      vectorStore: new SimpleVectorStore(),
      docStore: new SimpleDocumentStore(),
      indexStore: new SimpleIndexStore(),
    };

    const vectorStoreIndex = await VectorStoreIndex.fromDocuments(documents, {
      storageContext,
    });

    log(`Indexed PDF File successfully as ${documents.length} documents`);

    await persistSimpleStorageContext({
      hash: hashedUrl,
      simpleStorageContext: storageContext,
    });

    return { vectorStoreIndex };
  }

  log("Retrieved existing storage context");

  const vectorStoreIndex = await VectorStoreIndex.init({
    storageContext: simpleStorageContext,
  });

  return { vectorStoreIndex };
};
