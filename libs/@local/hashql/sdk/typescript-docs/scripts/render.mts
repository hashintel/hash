import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { ApiVariable } from "@microsoft/api-extractor-model";

import {
  bodyOf,
  callableSignatures,
  declarationLinks,
  inputSignatures,
  introOf,
  loadItems,
  moduleOverview,
  polishedMember,
  renderIndexSummary,
  renderMarkdown,
  rewriteProse,
} from "./transform.mts";

import type { ExampleResult } from "./transform.mts";

const directory = import.meta.dirname;
const { resolve } = path;
const root = resolve(directory, "..");
const input = resolve(root, "generators");
const content = resolve(root, "app/content/docs");
const output = resolve(content, "reference/program");

// oxlint-disable-next-line typescript/no-restricted-types -- Captured JSON is untrusted until every ExampleResult field is validated below.
const decodeExample = (value: unknown): ExampleResult => {
  if (
    typeof value !== "object" ||
    value === null ||
    !("code" in value) ||
    typeof value.code !== "string" ||
    !("stdout" in value) ||
    typeof value.stdout !== "string" ||
    !("stderr" in value) ||
    typeof value.stderr !== "string" ||
    !("exitCode" in value) ||
    typeof value.exitCode !== "number" ||
    !("sourceSha256" in value) ||
    typeof value.sourceSha256 !== "string" ||
    !("exampleSha256" in value) ||
    typeof value.exampleSha256 !== "string"
  ) {
    throw new Error("Invalid captured example record");
  }
  return {
    code: value.code,
    stdout: value.stdout,
    stderr: value.stderr,
    exitCode: value.exitCode,
    sourceSha256: value.sourceSha256,
    exampleSha256: value.exampleSha256,
  };
};

// oxlint-disable-next-line typescript/no-restricted-types -- JSON.parse has no schema; narrow the decoded container before reading its records.
const results: unknown = JSON.parse(
  await readFile(resolve(directory, "examples/results.json"), "utf8"),
);
if (
  typeof results !== "object" ||
  results === null ||
  !("input" in results) ||
  !("adaptCallable" in results)
) {
  throw new Error("Both captured examples are required");
}
const examples = {
  input: decodeExample(results.input),
  adaptCallable: decodeExample(results.adaptCallable),
};
const items = loadItems(resolve(input, "api-model/hashql.api.json"));
const symbols = new Map(
  items.map((item) => [item.displayName, `#${item.displayName}`]),
);
const files = new Map<string, string>([
  ["hashql.md", "#module-overview"],
  ["index.md", "/docs"],
]);
const pages = new Map<string, string>();
const filenames = await readdir(resolve(input, "api-documenter"));
const memberFilenames = filenames
  .toSorted()
  .filter(
    (filename) =>
      filename !== "index.md" &&
      filename !== "hashql.md" &&
      filename.endsWith(".md"),
  );
const sourceReads: Promise<string>[] = [];
for (const filename of memberFilenames) {
  sourceReads.push(
    readFile(resolve(input, "api-documenter", filename), "utf8"),
  );
}
const sources = await Promise.all(sourceReads);
for (const [index, filename] of memberFilenames.entries()) {
  const source = sources[index];
  if (source === undefined) {
    throw new Error(`Missing Documenter page: ${filename}`);
  }
  const member = items.find(
    (item) => filename === `hashql.${item.displayName.toLowerCase()}.md`,
  );
  const anchor =
    member?.displayName ??
    filename
      .slice("hashql.".length, -".md".length)
      .replaceAll(/[^A-Za-z0-9-]/gu, "-");
  files.set(filename, `#${anchor}`);
  pages.set(filename, source);
}
const inputs = inputSignatures(items, declarationLinks(items));
for (const signature of inputs) {
  const index = Number(signature.anchor.slice("input-".length));
  let filename = `hashql.input_${index - 1}.md`;
  if (index === 1) {
    filename = "hashql.input.md";
  }
  files.set(filename, `#${signature.anchor}`);
}
const adapted = items.find(
  (item): item is ApiVariable =>
    item instanceof ApiVariable && item.displayName === "adaptCallable",
);
if (adapted === undefined) {
  throw new Error("adaptCallable is absent from the API model");
}
const callSignatures = callableSignatures(adapted, declarationLinks(items));
const preamble = `import type { Type, TypeExpression } from "@local/hashql";\nimport type * as Input from ${JSON.stringify(resolve(input, "input/dist-fresh/program/Inputs.js"))};\nimport type { Expression, Adapted, Any, Inputs, Value } from ${JSON.stringify(resolve(input, "input/dist-fresh/program/Expression.js"))};`;

const polishedSections: Promise<string>[] = [];
for (const name of ["input", "adaptCallable"] as const) {
  const source = pages.get(`hashql.${name.toLowerCase()}.md`);
  if (source === undefined || source === "") {
    throw new Error(`Missing Documenter page: ${name}`);
  }
  const example = examples[name];
  const digest = createHash("sha256").update(source).digest("hex");
  if (
    example.sourceSha256 !== digest ||
    example.exampleSha256 !==
      createHash("sha256").update(example.code).digest("hex")
  ) {
    throw new Error(`Stale example capture: ${name}`);
  }
  let signatures = callSignatures;
  if (name === "input") {
    signatures = inputs;
  }
  polishedSections.push(
    polishedMember({
      name,
      source,
      signatures,
      preamble,
      example,
      files,
      symbols,
    }),
  );
}
const sections = await Promise.all(polishedSections);
for (const [filename, source] of pages) {
  if (!/^hashql\.(?:input(?:_\d+)?|adaptcallable)\.md$/u.test(filename)) {
    const anchor = files.get(filename)?.slice(1);
    if (anchor === undefined || anchor === "") {
      throw new Error(`Missing member anchor: ${filename}`);
    }
    const heading =
      items.find((item) => item.displayName === anchor)?.displayName ??
      /^## (?<title>.+)\r?$/mu.exec(source)?.groups?.title?.trim() ??
      anchor;
    const tree = rewriteProse(bodyOf(source), {
      files,
      symbols,
      section: anchor,
    });
    sections.push(
      `## Expression.${heading} [#${anchor}]\n\n${renderMarkdown(tree)}`,
    );
  }
}
const indexRows = [...new Set(items.map((item) => item.displayName))].map(
  (name) => {
    const source = pages.get(`hashql.${name.toLowerCase()}.md`);
    let summary = "";
    if (source !== undefined && source !== "") {
      const first = introOf(bodyOf(source)).children[0];
      if (first !== undefined) {
        summary = renderIndexSummary(first);
      }
    }
    return `| [\`${name}\`](#${name}) | ${summary} |`;
  },
);
const overview = moduleOverview(
  resolve(input, "input/src/program/Expression.ts"),
);
const page = `---
title: Expression
description: Symbolic HashQL values with semantic types and input requirements.
---

## Module overview [#module-overview]

${overview}

## Members [#members]

| Member | Description |
| --- | --- |
${indexRows.join("\n")}

${sections.join("\n")}`;
await mkdir(output, { recursive: true });
await writeFile(resolve(output, "Expression.mdx"), page);
await writeFile(
  resolve(root, "app/lib/reference-links.json"),
  `${JSON.stringify(Object.fromEntries(symbols), null, 2)}\n`,
);
await writeFile(
  resolve(output, "meta.json"),
  `${JSON.stringify({ title: "program", pages: ["Expression"] }, null, 2)}\n`,
);
await writeFile(
  resolve(content, "reference/meta.json"),
  `${JSON.stringify({ title: "API reference", pages: ["program"] }, null, 2)}\n`,
);
await writeFile(
  resolve(directory, "generated.json"),
  `${JSON.stringify({ page: "reference/program/Expression.mdx", moduleSource: "generators/input/src/program/Expression.ts", inputOverloads: inputs.length, callableSignatures: callSignatures.length, memberSections: sections.length, sha256: createHash("sha256").update(page).digest("hex") }, null, 2)}\n`,
);
process.stdout.write(
  `Generated Expression with ${inputs.length} input overloads, ${callSignatures.length} callable signatures and both captured examples.\n`,
);
