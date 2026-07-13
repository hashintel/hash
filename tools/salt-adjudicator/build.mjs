import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createStudy,
  parseCardsJsonl,
  serializePayload,
  sha256Hex,
} from "./src/core.mjs";

const toolRoot = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(toolRoot, "src");

const read = (path) => readFile(resolve(toolRoot, path), "utf8");

const parseOutputPath = () => {
  const outputFlagIndex = process.argv.indexOf("--out");
  if (outputFlagIndex === -1) {
    return resolve(toolRoot, "salt-adjudicator.html");
  }
  const requestedPath = process.argv[outputFlagIndex + 1];
  if (!requestedPath) {
    throw new Error("--out requires a file path.");
  }
  return resolve(process.cwd(), requestedPath);
};

const removeModuleSyntax = (coreSource, appSource) => {
  const flattenedCore = coreSource.replace(/^export\s+/gmu, "");
  const flattenedApp = appSource.replace(
    /^import\s*\{[\s\S]*?\}\s*from\s*["']\.\/core\.mjs["'];?\s*/u,
    "",
  );
  return `(() => {
"use strict";

${flattenedCore}

${flattenedApp}
})();
`;
};

const build = async () => {
  const [
    htmlSource,
    cssSource,
    coreSource,
    appSource,
    demoCardsText,
    qualificationText,
  ] = await Promise.all([
    readFile(resolve(sourceRoot, "index.html"), "utf8"),
    readFile(resolve(sourceRoot, "styles.css"), "utf8"),
    readFile(resolve(sourceRoot, "core.mjs"), "utf8"),
    readFile(resolve(sourceRoot, "app.mjs"), "utf8"),
    read("fixtures/demo-cards.jsonl"),
    read("fixtures/demo-qualification.jsonl"),
  ]);

  const demoCards = parseCardsJsonl(demoCardsText);
  const qualificationCards = parseCardsJsonl(qualificationText, {
    qualification: true,
  });
  const { study: demoStudy, codeSheet } = createStudy({
    cards: demoCards,
    qualificationCards,
    annotatorIds: ["DEMO"],
    seed: "salt-demo-v1",
    coverageTarget: 1,
    sliceSize: demoCards.length,
    rubricVersion: "v0.3-demo",
    coincidentTarget: 3,
    title: "SALT demonstration study",
  });

  const script = removeModuleSyntax(coreSource, appSource);
  const buildHash = sha256Hex(
    [htmlSource, cssSource, coreSource, appSource].join("\u001e"),
  ).slice(0, 12);
  const payload = serializePayload({
    kind: "generic",
    schema_version: "salt-study-v1",
    build_hash: buildHash,
    demo_study: demoStudy,
    demo_code: codeSheet[0].code,
  });

  const html = htmlSource
    .replace(
      /<link rel="stylesheet" href="\.\/styles\.css" \/>/u,
      `<style>\n${cssSource}\n</style>`,
    )
    .replace(
      /<script id="salt-study" type="application\/json">[\s\S]*?<\/script>/u,
      `<script id="salt-study" type="application/json">${payload}</script>`,
    )
    .replace(
      /<script type="module" src="\.\/app\.mjs"><\/script>/u,
      `<script>\n${script.replaceAll("</script", "<\\/script")}\n</script>`,
    );

  if (
    /<script\b[^>]*\bsrc=/iu.test(html) ||
    /<link\b[^>]*\bhref=/iu.test(html) ||
    /<script\b[^>]*\btype=["']module["']/iu.test(html)
  ) {
    throw new Error("The built document still contains external source links.");
  }

  const outputPath = parseOutputPath();
  await writeFile(outputPath, html);
  process.stdout.write(
    `Built ${outputPath} (${Buffer.byteLength(html).toLocaleString()} bytes, ${buildHash})\n`,
  );
};

await build();
