/**
 * `archinaut slides new`: a deck folder with its metadata and a first
 * slide, and, the first time, a `tsconfig.json` at the slides root that
 * type-checks every deck against the site's slide API wherever the folder
 * lives.
 */

import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, sep } from "node:path";

const titleSlide = (
  title: string,
): string => `export const title = ${JSON.stringify(title)};
export const notes = {
  default: "Say what the talk is about.",
  byStep: { 1: "Say what the audience leaves with." },
};
export const steps = 2;

# ${title}

<Reveal at={1}>One sentence on what this deck shows.</Reveal>
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

/** Creates `<root>/<name>/`; refuses to overwrite a deck. */
export const scaffoldDeck = async (options: {
  root: string;
  name: string;
  siteRoot: string;
}): Promise<{ directory: string; wroteTsconfig: boolean }> => {
  const { root, name, siteRoot } = options;
  const directory = join(root, name);
  if (existsSync(directory)) {
    throw new Error(`${directory} already exists`);
  }
  mkdirSync(directory, { recursive: true });
  const title = name
    .replace(/[-_]+/gu, " ")
    .replace(/^./u, (first) => first.toUpperCase());
  const tsconfigPath = join(root, "tsconfig.json");
  const wroteTsconfig = !existsSync(tsconfigPath);
  await Promise.all([
    writeFile(
      join(directory, "deck.json"),
      `${JSON.stringify({ title, description: "" }, null, 2)}\n`,
    ),
    writeFile(join(directory, "0-title.mdx"), titleSlide(title)),
    wroteTsconfig
      ? writeFile(tsconfigPath, deckTsconfig(root, siteRoot))
      : Promise.resolve(),
  ]);
  return { directory, wroteTsconfig };
};
