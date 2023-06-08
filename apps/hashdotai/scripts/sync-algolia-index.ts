import fs from "node:fs";
import path from "node:path";

import algoliasearch from "algoliasearch";
import * as envalid from "envalid";
import matter from "gray-matter";

const monorepoDirPath = path.resolve(__dirname, "../../..");

type DocsFrontMatter = {
  content: string;
  data: {
    objectId: string;
    title?: string;
    description?: string;
    slug: string;
    tags?: Array<string>;
  };
};

const getFileInfos = (
  dirPath: string,
  arrayOfFiles: Array<{
    inputPath: string;
    outputPath: string;
    type: string;
  }>,
  type: string,
): {
  inputPath: string;
  outputPath: string;
  type: string;
}[] => {
  const files = fs.readdirSync(dirPath);

  let newArrayOfFiles = [...arrayOfFiles];

  for (const file of files) {
    if (fs.statSync(`${dirPath}/${file}`).isDirectory()) {
      newArrayOfFiles = getFileInfos(`${dirPath}/${file}`, arrayOfFiles, type);
    } else {
      const inputPath = path.join(dirPath, "/", file);
      const outputPath = `.\\output\\${path.join(
        "./output/",
        dirPath,
        "/",
        file,
      )}`;
      if (inputPath.endsWith(".md") || inputPath.endsWith(".mdx")) {
        newArrayOfFiles.push({ inputPath, outputPath, type });
      }
    }
  }

  return newArrayOfFiles;
};

type AlgoliaRecord = {
  objectId: undefined;
  content: string;
  objectID: string;
  type: string;
  title?: string;
  description?: string;
  slug?: string;
  tags?: Array<string>;
};

const generateAlgoliaRecords = (): AlgoliaRecord[] => {
  const getFormattedData = (matterData: DocsFrontMatter, type: string) => {
    const appendData = {
      ...matterData.data,
      objectId: undefined,
      content: matterData.content,
      objectID: `${type}/${matterData.data.slug}`,
      type,
    };

    return appendData;
  };

  const glossaryFiles = getFileInfos(
    path.resolve(monorepoDirPath, "apps/hashdotai/glossary"),
    [],
    "glossary",
  );
  const docsFiles = getFileInfos(
    path.resolve(monorepoDirPath, "apps/hashdotai/docs/simulation"),
    [],
    "docs",
  );

  const fileInfos = [...glossaryFiles, ...docsFiles];

  const jsonData = fileInfos.map((filePath) => {
    const file = fs.readFileSync(filePath.inputPath, "utf8");

    const grayMatterData = matter(file) as unknown as DocsFrontMatter;

    return getFormattedData(grayMatterData, filePath.type);
  });

  return jsonData;
};

const syncAlgoliaIndex = async () => {
  const env = envalid.cleanEnv(process.env, {
    ALGOLIA_PROJECT: envalid.str({
      desc: "Algolia app id",
      example: "A1B2C3D4C5D6",
      docs: "https://www.algolia.com/doc/api-client/getting-started/instantiate-client-index/javascript/?client=javascript",
    }),
    ALGOLIA_WRITE_KEY: envalid.str({
      desc: "Algolia app API key with write permissions (32-char HEX)",
      docs: "https://www.algolia.com/doc/api-client/getting-started/instantiate-client-index/javascript/?client=javascript",
    }),
  });

  const client = algoliasearch(env.ALGOLIA_PROJECT, env.ALGOLIA_WRITE_KEY);

  const index = client.initIndex("hash_learn");

  let oldIndexObjects: Array<{ objectID: string }> = [];

  await index.browseObjects({
    query: "", // Empty query will match all records
    filters: "type:docs OR type:glossary",
    attributesToRetrieve: ["objectID"],
    batch: (batch) => {
      oldIndexObjects = oldIndexObjects.concat(batch);
    },
  });

  const indexObjects: AlgoliaRecord[] = generateAlgoliaRecords();

  const indexObjectLookup: Record<string, AlgoliaRecord> = {};

  for (const indexObject of indexObjects) {
    indexObjectLookup[indexObject.objectID] = indexObject;
  }

  const objectIDsToDelete: string[] = [];

  for (const { objectID } of oldIndexObjects) {
    if (!indexObjectLookup[objectID]) {
      objectIDsToDelete.push(objectID);
    }
  }

  await index.deleteObjects(objectIDsToDelete);

  await index.saveObjects(indexObjects);
};

const main = async () => {
  try {
    await syncAlgoliaIndex();
    console.log("Algolia Indexes Updated.");
  } catch (error) {
    throw new Error(`Algolia Indexing Failed: ${JSON.stringify(error)}`);
  }
};

void main();
