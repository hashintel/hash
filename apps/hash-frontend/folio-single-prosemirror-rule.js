import { findPackageJSON } from "node:module";
import path from "node:path";

/**
 * @param {string} name
 * @param {string} importer the file, or directory ending in `/`, that imports `name`
 * @returns {string}
 */
const packageDirectory = (name, importer) => {
  const packageJson = findPackageJSON(name, importer);
  if (!packageJson) {
    throw new Error(`${name} has no package.json above ${importer}`);
  }
  return path.dirname(packageJson);
};

/**
 * The DOCX preview's engine, folio, needs newer ProseMirror packages than
 * HASH's own editor, so Yarn installs several copies of them inside folio's
 * tree. ProseMirror fails when two copies meet ("Adding different instances
 * of a keyed plugin"), so every module in folio's tree resolves them to the
 * copies folio-core uses. HASH's editor keeps its own.
 */
const folioSingleProseMirrorRule = () => {
  const folioReact = packageDirectory("@stll/folio-react", import.meta.url);
  const folioCore = packageDirectory("@stll/folio-core", `${folioReact}/`);

  const sharedWithHash = [
    "prosemirror-commands",
    "prosemirror-dropcursor",
    "prosemirror-inputrules",
    "prosemirror-keymap",
    "prosemirror-model",
    "prosemirror-state",
    "prosemirror-transform",
    "prosemirror-view",
  ];
  const folioOnly = [
    "prosemirror-gapcursor",
    "prosemirror-history",
    "prosemirror-tables",
    "y-prosemirror",
    "yjs",
  ];

  const alias = Object.fromEntries(
    [...sharedWithHash, ...folioOnly].map((name) => [
      name,
      packageDirectory(name, `${folioCore}/`),
    ]),
  );

  for (const name of sharedWithHash) {
    if (alias[name] === packageDirectory(name, import.meta.url)) {
      throw new Error(
        `folio and the frontend resolve ${name} to the same copy at ${alias[name]}, so folio's ProseMirror imports cannot be kept apart from the frontend's`,
      );
    }
  }

  return {
    include: [folioReact, folioCore, ...Object.values(alias)],
    resolve: { alias },
  };
};

export { folioSingleProseMirrorRule };
