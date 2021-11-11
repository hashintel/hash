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
  arrayOfFiles: Array<{ inputPath: string; outputPath: string; type: string }>,
  type
) {
  const files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function (file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles, type);
    } else {
      const inputPath = path.join(dirPath, "/", file);
      const outputPath = `.\\output\\${path.join(
        "./output/",
        dirPath,
        "/",
        file
      )}`;
      arrayOfFiles.push({ inputPath, outputPath, type });
    }
  });

  return arrayOfFiles;
};

export const generateAlgoliaJson = () => {
  const getFormattedData = (matterData: DocsFrontMatter, type) => {
    const appendData = {
      ...matterData.data,
      objectId: undefined,
      content: matterData.content,
      objectID: `${type}/${matterData.data.slug}`,
      type,
    };

    return appendData;
  };

  const glossaryFiles = getAllFiles(
    "../../../resources/glossary",
    [],
    "glossary"
  );
  const docsFiles = getAllFiles(
    "../../../resources/docs/simulation",
    [],
    "docs"
  );

  const files = [...glossaryFiles, ...docsFiles];

  const jsonData = files.map((filePath) => {
    const file = fs.readFileSync(filePath.inputPath, "utf8");

    const grayMatterData = matter(file) as unknown as DocsFrontMatter;

    return getFormattedData(grayMatterData, filePath.type);
  });

  return jsonData;
};

export const uploadAlgoliaData = async (records) => {
  const client = algoliasearch(
    process.env.ALGOLIA_PROJECT,
    process.env.AGOLIA_WRITE_KEY
  );

  const index = client.initIndex("hash_learn_testing1");

  return await index
    .saveObjects(records, { autoGenerateObjectIDIfNotExist: true })
    .catch(console.error);
};

export const deleteDocsIndex = async () => {
  const client = algoliasearch(
    process.env.ALGOLIA_PROJECT,
    process.env.AGOLIA_WRITE_KEY
  );

  const index = client.initIndex("hash_learn_testing1");

  return await index
    .deleteBy({ filters: "type:docs OR type:glossary" })
    .catch(console.error);
};
