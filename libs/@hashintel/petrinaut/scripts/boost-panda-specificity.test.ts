import postcss from "postcss";
import { describe, expect, it } from "vitest";

import boostPandaSpecificity from "./boost-panda-specificity.mjs";

const process = async (css: string) =>
  (
    await postcss([boostPandaSpecificity()]).process(css, {
      from: undefined,
    })
  ).css;

describe("boostPandaSpecificity", () => {
  it("raises Panda utility selectors from four boosts to six", async () => {
    const input = ".op_1:not(#\\#):not(#\\#):not(#\\#):not(#\\#){opacity:1}";

    await expect(process(input)).resolves.toBe(
      ".op_1:not(#\\#):not(#\\#):not(#\\#):not(#\\#):not(#\\#):not(#\\#){opacity:1}",
    );
  });

  it("adds boosts before a pseudo-element", async () => {
    const input =
      '.content:not(#\\#):not(#\\#):not(#\\#):not(#\\#)::after{content:""}';

    await expect(process(input)).resolves.toBe(
      '.content:not(#\\#):not(#\\#):not(#\\#):not(#\\#):not(#\\#):not(#\\#)::after{content:""}',
    );
  });

  it("does not change lower Panda layers or non-Panda selectors", async () => {
    const input = [
      ".recipe:not(#\\#):not(#\\#):not(#\\#){display:flex}",
      ".vendor:hover{opacity:1}",
    ].join("\n");

    await expect(process(input)).resolves.toBe(input);
  });

  it("leaves selectors that already have six boosts unchanged", async () => {
    const input =
      ".op_1:not(#\\#):not(#\\#):not(#\\#):not(#\\#):not(#\\#):not(#\\#){opacity:1}";

    await expect(process(input)).resolves.toBe(input);
  });
});
