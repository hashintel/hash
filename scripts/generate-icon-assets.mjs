import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { StaticHashIcon } from "@hashintel/ds-icons/static";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inventory = JSON.parse(
  await fs.readFile(new URL("./icon-assets.json", import.meta.url), "utf8"),
);
const check = process.argv.includes("--check");
const outdated = [];
for (const { file, ...props } of inventory) {
  const prefix = `icon-${createHash("sha256").update(file).digest("hex").slice(0, 10)}`;
  let svg = renderToStaticMarkup(createElement(StaticHashIcon, props));
  for (const [, id] of [...svg.matchAll(/ id="([^"]+)"/g)]) {
    svg = svg
      .replaceAll(`id="${id}"`, `id="${prefix}-${id}"`)
      .replaceAll(`url(#${id})`, `url(#${prefix}-${id})`);
  }
  const destination = path.join(root, file);
  const content = `${svg}\n`;
  if (check) {
    if ((await fs.readFile(destination, "utf8")) !== content) {
      outdated.push(file);
    }
  } else {
    await fs.writeFile(destination, content);
  }
}

if (outdated.length > 0) {
  throw new Error(
    `Regenerate icon assets with yarn codegen:icon-assets:\n${outdated.join("\n")}`,
  );
}
