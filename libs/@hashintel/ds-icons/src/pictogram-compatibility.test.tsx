import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { hashIconPack } from "./hash-icon";

describe("existing pictograms", () => {
  it.each([
    ["circlePlus", "circlePlus"],
    ["squarePlus", "squarePlus"],
    ["inputPipe", "inputField"],
    ["diagramProject", "diagramBranch"],
    ["diagramNodes", "triangleNodes"],
    ["threeCircles", "overlappingCircles"],
    ["caretDown", "caretDown"],
    ["edit", "penSquare"],
    ["expand", "expandDiagonal"],
  ] as const)(
    "keeps the %s compatibility icon's pictogram",
    (name, expected) => {
      const Icon = hashIconPack[name];
      expect(renderToStaticMarkup(<Icon motion="none" />)).toContain(
        `data-icon="${expected}"`,
      );
    },
  );
});
