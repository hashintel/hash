/**
 * The entry module of an exported deck: every slide of the deck imported up
 * front, so the file needs nothing at run time, then the player mounted
 * over them. The module claims a path in `src/slides/export/`, so its
 * import of the player resolves as a neighbour's would.
 */

import { codeLiteral } from "../code-literal.ts";
import { deckFileSpecifier } from "../deck-specifier.ts";

import type { DeckFolder } from "../../../../src/slides/folders.ts";
import type { SlideShape } from "../../slides/deck/slide-shape.ts";

export const exportEntrySource = ({
  deck,
  slidesRoot,
  shape,
}: {
  deck: DeckFolder;
  slidesRoot: string | null;
  shape: SlideShape;
}): string => {
  const deckSpecifier = (file: string): string =>
    codeLiteral(deckFileSpecifier(deck, slidesRoot, file));
  const imports = [
    `import { mountExportedDeck } from "./mount.tsx";`,
    ...(deck.stylesheet === null
      ? []
      : [`import ${deckSpecifier(deck.stylesheet)};`]),
    ...(deck.logo.kind === "file"
      ? [`import logo from ${deckSpecifier(deck.logo.file)};`]
      : []),
    ...deck.slides.map(
      (slide, index) =>
        `import * as slide${index} from ${deckSpecifier(slide.file)};`,
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
