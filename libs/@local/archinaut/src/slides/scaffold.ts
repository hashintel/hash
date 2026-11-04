/**
 * `archinaut slides new`: a deck folder with its metadata and a first
 * slide, and, the first time, a `tsconfig.json` at the slides root that
 * type-checks every deck against the site's slide API wherever the folder
 * lives.
 */

import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, sep } from "node:path";

const titleSlide = (title: string): string => `---
layout: title
title: ${JSON.stringify(title)}
subtitle: One sentence on what this deck shows.
author: Your name
notes: Say what the talk is about, and what the audience leaves with.
---
`;

const posixRelative = (from: string, to: string): string =>
  relative(from, to).split(sep).join("/");

/** The longest directory both paths are inside. */
const commonAncestor = (left: string, right: string): string => {
  const a = left.split(sep);
  const b = right.split(sep);
  const shared: string[] = [];
  for (let i = 0; i < Math.min(a.length, b.length) && a[i] === b[i]; i++) {
    shared.push(a[i] ?? "");
  }
  return shared.join(sep) || sep;
};

/** A tsconfig for the slides root, pointing the deck API and React at the site's copies. */
export const deckTsconfig = (root: string, siteRoot: string): string => {
  const site = (path: string): string =>
    posixRelative(root, join(siteRoot, path));
  const require = createRequire(join(siteRoot, "package.json"));
  const typesOf = (name: string): string =>
    posixRelative(
      root,
      dirname(require.resolve(`@types/${name}/package.json`)),
    );
  return `${JSON.stringify(
    {
      extends: site("tsconfig.json"),
      compilerOptions: {
        rootDir: posixRelative(root, commonAncestor(root, siteRoot)),
        paths: {
          "@archinaut/slides": [site("src/slides/index.ts")],
          react: [typesOf("react")],
          "react/*": [`${typesOf("react")}/*`],
          "react-dom": [typesOf("react-dom")],
          "react-dom/*": [`${typesOf("react-dom")}/*`],
        },
      },
      include: [
        "**/*.ts",
        "**/*.tsx",
        site("src/vite-env.d.ts"),
        site("src/content.d.ts"),
      ],
      exclude: ["**/node_modules"],
    },
    null,
    2,
  )}\n`;
};

const hasCode = (error: unknown, code: string): boolean =>
  error instanceof Error && "code" in error && error.code === code;

/** Creates `<root>/<name>/`; refuses to overwrite a deck. */
export const scaffoldDeck = async (options: {
  root: string;
  name: string;
  siteRoot: string;
}): Promise<{ directory: string; wroteTsconfig: boolean }> => {
  const { root, name, siteRoot } = options;
  const directory = join(root, name);
  mkdirSync(root, { recursive: true });
  try {
    mkdirSync(directory);
  } catch (error) {
    if (hasCode(error, "EEXIST")) {
      throw new Error(`${directory} already exists`);
    }
    throw error;
  }
  const title = name
    .replace(/[-_]+/gu, " ")
    .replace(/^./u, (first) => first.toUpperCase());
  const [, , wroteTsconfig] = await Promise.all([
    writeFile(
      join(directory, "deck.json"),
      `${JSON.stringify({ title, description: "" }, null, 2)}\n`,
    ),
    writeFile(join(directory, "0-title.mdx"), titleSlide(title)),
    // `wx` fails on an existing file, so a tsconfig already there stays.
    writeFile(join(root, "tsconfig.json"), deckTsconfig(root, siteRoot), {
      flag: "wx",
    }).then(
      () => true,
      (error: unknown) => {
        if (hasCode(error, "EEXIST")) {
          return false;
        }
        throw error;
      },
    ),
  ]);
  return { directory, wroteTsconfig };
};
