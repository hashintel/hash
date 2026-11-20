import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import assets from "../../../../scripts/icon-assets.json";
import { hashIconPack } from "./hash-icon";

describe("existing pictograms", () => {
  it.each([
    [".github/assets/gh_icon_acknowledgement_20px-base.svg", "stars"],
    [".github/assets/gh_icon_contributing_20px-base.svg", "codeBranch"],
    [".github/assets/gh_icon_examples_20px-base.svg", "shootingStar"],
    [".github/assets/gh_icon_getting-started_20px-base.svg", "circlePlay"],
    ["apps/hash-frontend/public/icons/docs/account-profile.svg", "eye"],
    ["apps/hash-frontend/public/icons/docs/account-security.svg", "lockPlain"],
    ["apps/hash-frontend/public/icons/docs/ai-chat.svg", "comment"],
    ["apps/hash-frontend/public/icons/docs/ai-overview.svg", "lightning"],
    ["apps/hash-frontend/public/icons/docs/ai-workers.svg", "spinnerDots"],
    ["apps/hash-frontend/public/icons/docs/apps-overview.svg", "browser"],
    ["apps/hash-frontend/public/icons/icon/comment.svg", "message"],
    ["apps/hash-frontend/public/icons/icon/share-1.svg", "shareNodes"],
    ["apps/hash-frontend/public/icons/icon/share-2.svg", "share"],
    ["apps/hash-frontend/public/icons/icon/dash-dashed.svg", "circleDashed"],
    [
      "apps/hash-frontend/public/icons/icon/fill-pattern.svg",
      "layerFillPattern",
    ],
  ])("keeps %s mapped to %s", (file, name) => {
    expect(assets.find((asset) => asset.file === file)?.name).toBe(name);
  });

  it("gives every README icon an explicit blue color", () => {
    const readmeIcons = assets.filter(({ file }) =>
      file.startsWith(".github/assets/"),
    );
    expect(readmeIcons).toHaveLength(10);
    for (const icon of readmeIcons) {
      expect(icon.color).toBe("#2965FF");
    }
  });

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
