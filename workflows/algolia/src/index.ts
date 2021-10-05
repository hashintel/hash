import fs from "fs";
import path from "path";
import matter from "gray-matter";
import algoliasearch from "algoliasearch";

type DocsFrontMatter = {
  content: string;
  data: {
    objectId: string;
    title?: string;
    description?: string;
    slug?: string;
    tags?: Array<string>;
  };
};

const getAllFiles = function (
  dirPath,
  arrayOfFiles: Array<{ inputPath: string; outputPath: string }>
) {
  const files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function (file) {
    if (file === "LICENSE.MD") {
      return;
    }

    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      const inputPath = path.join(dirPath, "/", file);
      const outputPath = `.\\output\\${path.join(
        "./output/",
        dirPath,
        "/",
        file
      )}`;
      arrayOfFiles.push({ inputPath, outputPath });
    }
  });

  return arrayOfFiles;
};

export const checkObjectIds = () => {
  const objectIds = [];

  const checkObjectId = (matterData: DocsFrontMatter, type = "glossary") => {
    if (!matterData.data.objectId) {
      throw new Error(
        `objectId missing on file ${type}/${matterData.data.slug}.`
      );
    }

    if (objectIds.includes(matterData.data.objectId)) {
      throw new Error(`objectId ${matterData.data.objectId} appeared twice.`);
    }

    objectIds.push(matterData.data.objectId);
  };

  const glossaryFiles = getAllFiles("../../resources/glossary", []);

  for (const glossaryFileName of glossaryFiles) {
    const file = fs.readFileSync(glossaryFileName.inputPath, "utf8");

    const grayMatterData = matter(file) as unknown as DocsFrontMatter;

    checkObjectId(grayMatterData);
  }

  const docsFiles = getAllFiles("../../resources/docs/simulation", []);

  for (const docsFile of docsFiles) {
    const file = fs.readFileSync(docsFile.inputPath, "utf8");

    const grayMatterData = matter(file) as unknown as DocsFrontMatter;

    checkObjectId(grayMatterData, "docs");
  }
};

export const generateAlgoliaJson = () => {
  const jsonData = [];
  const objectIds = [];

  const appendToJson = (matterData: DocsFrontMatter, type = "glossary") => {
    if (!matterData.data.objectId) {
      throw new Error(
        `objectId missing on file ${type}/${matterData.data.slug}.`
      );
    }

    if (objectIds.includes(matterData.data.objectId)) {
      throw new Error(`objectId ${matterData.data.objectId} appeared twice.`);
    }

    objectIds.push(matterData.data.objectId);

    const appendData = {
      ...matterData.data,
      objectId: undefined,
      content: matterData.content,
      objectID: matterData.data.objectId,
      type,
    };

    jsonData.push(appendData);
  };

  const glossaryFiles = getAllFiles("../../resources/glossary", []);

  for (const glossaryFileName of glossaryFiles) {
    const file = fs.readFileSync(glossaryFileName.inputPath, "utf8");

    const grayMatterData = matter(file) as unknown as DocsFrontMatter;

    appendToJson(grayMatterData);
  }

  const docsFiles = getAllFiles("../../resources/docs/simulation", []);

  for (const docsFile of docsFiles) {
    const file = fs.readFileSync(docsFile.inputPath, "utf8");

    const grayMatterData = matter(file) as unknown as DocsFrontMatter;

    appendToJson(grayMatterData, "docs");
  }

  return jsonData;
};

export const uploadAlgoliaData = async (records) => {
  const client = algoliasearch(
    process.env.ALGOLIA_PROJECT,
    process.env.AGOLIA_WRITE_KEY
  );

  const index = client.initIndex("hash_learn");

  return await index
    .saveObjects(records, { autoGenerateObjectIDIfNotExist: true })
    .catch(console.error);
};
