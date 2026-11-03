/** Reading the slides directory: which decks, which slides, in what order. */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { ArchinautConfig } from "../config";

export interface DeckSlideFile {
  /** From the file name, `3-memory.tsx` → `memory`; a slide's static `id` may override it. */
  id: string;
  kind: "mdx" | "tsx";
  /** Absolute path of the slide module. */
  file: string;
}

export interface DeckFolder {
  id: string;
  title: string;
  description: string;
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

const slidePattern = /^(\d+[a-z]*)-([^.]+)\.(tsx|mdx)$/u;

/** Natural order on the prefix: `1`, `1a`, `2`, `10`. */
const compareSlideFiles = (left: string, right: string): number =>
  left.localeCompare(right, "en", { numeric: true });

const readDeckMeta = (
  directory: string,
  id: string,
): Pick<DeckFolder, "title" | "description"> => {
  const metaPath = join(directory, "deck.json");
  const meta = existsSync(metaPath)
    ? (JSON.parse(readFileSync(metaPath, "utf8")) as Partial<
        Record<"title" | "description", string>
      >)
    : {};
  return {
    title: meta.title ?? id,
    description: meta.description ?? "",
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
export const listDecks = (root: string | null): DeckFolder[] => {
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
      return {
        id: entry.name,
        directory,
        ...readDeckMeta(directory, entry.name),
        stylesheet: existsSync(stylesheet) ? stylesheet : null,
        slides: slidesIn(directory),
      };
    })
    .filter((deck) => deck.slides.length > 0)
    .sort((left, right) => left.id.localeCompare(right.id));
};
