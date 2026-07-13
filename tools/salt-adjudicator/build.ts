import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build as esbuild } from "esbuild";

import {
  createStudy,
  parseCardsJsonl,
  serializePayload,
  sha256Hex,
} from "./src/core.ts";
import { partitionQualificationCards } from "./src/study-planning.ts";

const toolRoot = dirname(fileURLToPath(import.meta.url));
const sourceRoot = resolve(toolRoot, "src");

const read = (path: string): Promise<string> =>
  readFile(resolve(toolRoot, path), "utf8");

const bundleBrowserApplication = async (): Promise<string> => {
  const result = await esbuild({
    bundle: true,
    charset: "utf8",
    entryPoints: [resolve(sourceRoot, "app.tsx")],
    format: "iife",
    jsx: "automatic",
    jsxImportSource: "preact",
    legalComments: "none",
    logLevel: "silent",
    minify: true,
    platform: "browser",
    sourcemap: false,
    target: ["es2022"],
    treeShaking: true,
    write: false,
  });
  const output = result.outputFiles[0];
  if (!output) {
    throw new Error("esbuild did not produce a browser bundle.");
  }
  return output.text.replace(/[ \t]+$/gmu, "");
};

const parseOutputPath = (): string => {
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

const build = async (): Promise<void> => {
  const [htmlSource, cssSource, script, demoCardsText, qualificationText] =
    await Promise.all([
      readFile(resolve(sourceRoot, "index.html"), "utf8"),
      readFile(resolve(sourceRoot, "styles.css"), "utf8"),
      bundleBrowserApplication(),
      read("fixtures/demo-cards.jsonl"),
      read("fixtures/demo-qualification.jsonl"),
    ]);

  const demoSourcePool = parseCardsJsonl(demoCardsText);
  const qualificationReferences = parseCardsJsonl(qualificationText, {
    qualification: true,
  });
  const { eligibleCards: demoCards, qualificationCards } =
    partitionQualificationCards(
      demoSourcePool,
      qualificationReferences.map((card) => ({
        relationId: card.relation_id,
        answer: card.answer,
        rationale: card.rationale,
      })),
    );
  const { study: demoStudy, codeSheet } = createStudy({
    cards: demoCards,
    qualificationCards,
    annotatorIds: ["DEMO"],
    seed: "salt-demo-v1",
    coverageTarget: 1,
    sliceSize: demoCards.length,
    rubricVersion: "v1",
    title: "SALT demonstration study",
  });

  const buildHash = sha256Hex(
    [htmlSource, cssSource, script].join("\u001e"),
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
      () => `<style>\n${cssSource}\n</style>`,
    )
    .replace(
      /<script id="salt-study" type="application\/json">[\s\S]*?<\/script>/u,
      () =>
        `<script id="salt-study" type="application/json">${payload}</script>`,
    )
    .replace(
      /<script type="module" src="\.\/app\.tsx?"><\/script>/u,
      () =>
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
