import assert from "node:assert/strict";
import { describe, it } from "node:test";

import assets from "./icon-assets.json" with { type: "json" };

describe("existing pictogram assets", () => {
  for (const [file, name] of [
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
  ]) {
    it(`keeps ${file} mapped to ${name}`, () => {
      assert.equal(assets.find((asset) => asset.file === file)?.name, name);
    });
  }

  it("gives every README icon an explicit blue color", () => {
    const readmeIcons = assets.filter(({ file }) =>
      file.startsWith(".github/assets/"),
    );
    assert.equal(readmeIcons.length, 10);
    for (const icon of readmeIcons) {
      assert.equal(icon.color, "#2965FF");
    }
  });
});
