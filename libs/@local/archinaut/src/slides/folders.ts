/** Reading the slides directory: which decks, which slides, in what order. */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type { ArchinautConfig } from "../config";

export interface DeckSlideFile {
  /** From the file name, `3-memory.tsx` → `memory`; a slide's static `id` may override it. */
  id: string;
  kind: "mdx" | "tsx";
  /** Absolute path of the slide module. */
  file: string;
}

/**
 * The mark in each slide's top-left corner: the site's logo, unless
 * `deck.json` names HASH's wordmark (`"logo": "hash"`), an image in the
 * deck folder (`"logo": "partner.svg"`) or none (`"logo": false`).
 */
export type DeckFolderLogo =
  | { kind: "site" }
  | { kind: "hash" }
  | { kind: "none" }
  | { kind: "file"; file: string };

/** Whose deck it is: the instance's, from its slides directory, or an example archinaut ships. */
export type DeckOrigin = "instance" | "example";

export interface DeckFolder {
  /** The folder's name; an example's is prefixed `example-`, so it never takes an instance deck's id. */
  id: string;
  origin: DeckOrigin;
  title: string;
  description: string;
  logo: DeckFolderLogo;
  /** Absolute path of the deck's folder. */
  directory: string;
  /** `deck.css` in the folder, loaded with the deck: fonts, tokens, anything every slide shares. */
  stylesheet: string | null;
  slides: DeckSlideFile[];
}

/** Where the decks are, absolute: `--slides` when given, else the config's `slidesDirectory`. */
export const slidesRoot = (config: ArchinautConfig): string | null =>
  config.slidesDirectory === undefined
    ? null
    : resolve(config.root, config.slidesDirectory);

/** The example decks, beside the slide API they are written against. */
export const examplesRoot = fileURLToPath(
  new URL("../../site/examples", import.meta.url),
);

const slidePattern = /^(\d+[a-z]*)-([^.]+)\.(tsx|mdx)$/u;

/** Natural order on the prefix: `1`, `1a`, `2`, `10`. */
const compareSlideFiles = (left: string, right: string): number =>
  left.localeCompare(right, "en", { numeric: true });

const logoOf = (
  directory: string,
  id: string,
  logo: unknown,
): DeckFolderLogo => {
  if (logo === undefined) {
    return { kind: "site" };
  }
  if (logo === false) {
    return { kind: "none" };
  }
  if (logo === "hash") {
    return { kind: "hash" };
  }
  const file = typeof logo === "string" ? resolve(directory, logo) : null;
  if (
    file === null ||
    !file.startsWith(`${directory}${sep}`) ||
    !existsSync(file)
  ) {
    throw new Error(
      `deck "${id}": "logo" must be false, "hash" or the path of an image in the deck folder, not ${JSON.stringify(logo)}`,
    );
  }
  return { kind: "file", file };
};

const readDeckMeta = (
  directory: string,
  id: string,
): Pick<DeckFolder, "title" | "description" | "logo"> => {
  const metaPath = join(directory, "deck.json");
  const meta = existsSync(metaPath)
    ? (JSON.parse(readFileSync(metaPath, "utf8")) as Partial<
        Record<"title" | "description", string> & { logo: unknown }
      >)
    : {};
  return {
    title: meta.title ?? id,
    description: meta.description ?? "",
    logo: logoOf(directory, id, meta.logo),
  };
};

const slidesIn = (directory: string): DeckSlideFile[] =>
  readdirSync(directory)
    .filter((name) => slidePattern.test(name))
    .sort(compareSlideFiles)
    .map((name) => {
      const [, , id = name, extension] = slidePattern.exec(name) ?? [];
      return {
        id,
        kind: extension === "mdx" ? "mdx" : "tsx",
        file: join(directory, name),
      };
    });

/** Every deck under `root` with at least one slide; none when the folder is absent. */
export const listDecks = (
  root: string | null,
  origin: DeckOrigin = "instance",
): DeckFolder[] => {
  if (root === null || !existsSync(root)) {
    return [];
  }
  return readdirSync(root, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.name.startsWith(".") &&
        entry.name !== "node_modules",
    )
    .map((entry) => {
      const directory = join(root, entry.name);
      const stylesheet = join(directory, "deck.css");
      const id = origin === "example" ? `example-${entry.name}` : entry.name;
      return {
        id,
        origin,
        directory,
        ...readDeckMeta(directory, id),
        stylesheet: existsSync(stylesheet) ? stylesheet : null,
        slides: slidesIn(directory),
      };
    })
    .filter((deck) => deck.slides.length > 0)
    .sort((left, right) => left.id.localeCompare(right.id));
};

/** The instance's decks, then the examples. */
export const listAllDecks = (instanceRoot: string | null): DeckFolder[] => {
  const instance = listDecks(instanceRoot);
  const examples = listDecks(examplesRoot, "example");
  const exampleIds = new Set(examples.map((deck) => deck.id));
  const clash = instance.find((deck) => exampleIds.has(deck.id));
  if (clash !== undefined) {
    throw new Error(
      `${clash.directory} has an example deck's id, "${clash.id}"; rename the folder`,
    );
  }
  return [...instance, ...examples];
};
