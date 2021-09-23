import fs from "fs";
import path from "path";
import matter from "gray-matter";

import simulationMap from "../resources/docs/url_map.json";

function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const addUuidGlossary = () => {
  const files = fs.readdirSync("../resources/glossary");

  for (const fileName of files) {
    const file = fs.readFileSync(`../resources/glossary/${fileName}`, "utf8");

    fs.writeFileSync(
      `./output/glossary/${fileName}`,
      file.replace("---", `---\nobjectId: ${uuidv4()}`)
    );
  }
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
      const inputPath = path.join(__dirname, dirPath, "/", file);
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

function ensureDirectoryExistence(filePath) {
  var dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname);
}

const addUuidDocs = () => {
  // fs.writeFileSync("./output/files.json", JSON.stringify(getAllFiles("../resources/docs/simulation", [])))
  const files = getAllFiles("../resources/docs/simulation", []);

  for (const file of files) {
    writeFile(file.inputPath, file.outputPath);
  }
};

const writeFile = (
  inputPath,
  outputPath,
  textData = `objectId: ${uuidv4()}`
) => {
  const file = fs.readFileSync(inputPath, "utf8");

  ensureDirectoryExistence(outputPath);

  if (file.startsWith("---")) {
    fs.writeFileSync(outputPath, file.replace("---", `---\n${textData}`));
  } else {
    fs.writeFileSync(outputPath, `---\n${textData}}\n---\n\n${file}`);
  }
};

const writeDocsFile = (urlObj) => {
  let inputPath = `../resources/docs/${urlObj.slug}.md`;
  let outputPath = `./output/${urlObj.slug}.md`;

  if (!fs.existsSync(inputPath)) {
    inputPath = `../resources/docs/${urlObj.slug}/README.md`;
    outputPath = `./output/${urlObj.slug}/README.md`;
  }

  writeFile(
    inputPath,
    outputPath,
    `title: ${urlObj.title}\nslug: ${urlObj.slug}\nobjectId: ${uuidv4()}`
  );
};

const addTitleToPage = () => {
  simulationMap.forEach((simulation) => {
    simulation.urldata.forEach((title) => {
      title.urldata.forEach((h1) => {
        writeDocsFile(h1);

        h1?.urldata?.forEach((h2) => {
          writeDocsFile(h2);

          h2?.urldata?.forEach((h3: any) => {
            writeDocsFile(h3);

            h3?.urldata?.forEach((h4) => {
              writeDocsFile(h4);
            });
          });
        });
      });
    });
  });
};

const generateAlgoliaJson = () => {
  const jsonData = [];

  const glossaryFiles = fs.readdirSync("../resources/glossary");

  const appendToJson = (matterData) => {
    const appendData = {
      ...matterData.data,
      objectId: undefined,
      content: matterData.content,
      objectID: matterData.data.objectId,
    };

    jsonData.push(appendData);
  };

  for (const glossaryFileName of glossaryFiles) {
    const file = fs.readFileSync(
      `../resources/glossary/${glossaryFileName}`,
      "utf8"
    );

    const grayMatterData = matter(file) as unknown as {
      content: string;
      data: {
        objectId: string;
        title?: string;
        description?: string;
        slug?: string;
        tags?: Array<string>;
      };
    };

    appendToJson(grayMatterData);
  }

  const docsFiles = getAllFiles("../resources/docs/simulation", []);

  for (const docsFile of docsFiles) {
    const file = fs.readFileSync(docsFile.inputPath, "utf8");

    const grayMatterData = matter(file) as unknown as {
      content: string;
      data: {
        objectId: string;
        title?: string;
        description?: string;
        slug?: string;
        tags?: Array<string>;
      };
    };

    appendToJson(grayMatterData);
  }

  return jsonData;
};

// fs.writeFileSync("./output/algoliaData.json", JSON.stringify(generateAlgoliaJson()))
// addTitleToPage();
// addUuidGlossary()
fs.writeFileSync(
  "./output/algoliaData.json",
  JSON.stringify(generateAlgoliaJson())
);
