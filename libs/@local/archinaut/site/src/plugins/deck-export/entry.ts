/**
 * The entry module of an exported deck: every slide of the deck imported up
 * front, so the file needs nothing at run time, then the player mounted
 * over them. The module claims a path in `src/slides/export/`, so its
 * import of the player resolves as a neighbour's would.
 */

import { relative } from "node:path";

import { codeLiteral } from "../code-literal.ts";

import type { DeckFolder } from "../../../../src/slides/folders.ts";
import type { SlideShape } from "../../slides/deck/slide-shape.ts";

const deckSpecifier = (slidesRoot: string, file: string): string =>
  codeLiteral(`@decks/${relative(slidesRoot, file)}`);

export const exportEntrySource = ({
  deck,
  slidesRoot,
  shape,
}: {
  deck: DeckFolder;
  slidesRoot: string;
  shape: SlideShape;
}): string => {
  const imports = [
    `import { mountExportedDeck } from "./mount.tsx";`,
    ...(deck.stylesheet === null
      ? []
      : [`import ${deckSpecifier(slidesRoot, deck.stylesheet)};`]),
    ...(deck.logo.kind === "file"
      ? [`import logo from ${deckSpecifier(slidesRoot, deck.logo.file)};`]
      : []),
    ...deck.slides.map(
      (slide, index) =>
        `import * as slide${index} from ${deckSpecifier(slidesRoot, slide.file)};`,
    ),
  ];
  const logo =
    deck.logo.kind === "file"
      ? `{ kind: "image", src: logo }`
      : codeLiteral(deck.logo);
  const slides = deck.slides.map(
    (slide, index) =>
      `{ id: ${codeLiteral(slide.id)}, kind: ${codeLiteral(slide.kind)}, module: slide${index} }`,
  );
  return `${imports.join("\n")}

mountExportedDeck({
  logo: ${logo},
  shape: ${codeLiteral(shape)},
  slides: [${slides.join(", ")}],
});
`;
};
