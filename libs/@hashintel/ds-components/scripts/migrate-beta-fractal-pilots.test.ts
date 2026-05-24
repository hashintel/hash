import { describe, expect, it } from "vitest";

import {
  getRecipeSymbols,
  migrateComponentModule,
  migrateRecipeModule,
  rewriteRelativeSpecifiers,
} from "./migrate-beta-fractal-pilots";

describe("rewriteRelativeSpecifiers", () => {
  it("rewrites story exports when a stories root file moves to src/beta", () => {
    const sourceText = `export { App as basic } from "./basic.story";\n`;
    const oldFilePath = "/repo/src/beta/text/text.stories.ts";
    const newFilePath = "/repo/src/beta/text.stories.ts";
    const moveMap = new Map<string, string>();

    const nextSource = rewriteRelativeSpecifiers(sourceText, oldFilePath, newFilePath, moveMap);

    expect(nextSource).toBe('export { App as basic } from "./text/basic.story";\n');
  });

  it("rewrites story imports when the component root file moves to src/beta", () => {
    const sourceText = 'import { Text } from "./text";\n';
    const oldFilePath = "/repo/src/beta/text/basic.story.tsx";
    const newFilePath = oldFilePath;
    const moveMap = new Map<string, string>([["/repo/src/beta/text/text", "/repo/src/beta/text"]]);

    const nextSource = rewriteRelativeSpecifiers(sourceText, oldFilePath, newFilePath, moveMap);

    expect(nextSource).toBe('import { Text } from "../text";\n');
  });

  it("preserves .recipe suffixes when a recipe root file moves to src/beta", () => {
    const sourceText = 'import { textRecipe } from "./text.recipe";\n';
    const oldFilePath = "/repo/src/beta/text/text.tsx";
    const newFilePath = "/repo/src/beta/text.tsx";
    const moveMap = new Map<string, string>([
      ["/repo/src/beta/text/text", "/repo/src/beta/text"],
      ["/repo/src/beta/text/text.recipe", "/repo/src/beta/text.recipe"],
    ]);

    const nextSource = rewriteRelativeSpecifiers(sourceText, oldFilePath, newFilePath, moveMap);

    expect(nextSource).toBe('import { textRecipe } from "./text.recipe";\n');
  });
});

describe("migrateRecipeModule", () => {
  it("converts defineRecipe modules to cva recipe modules", () => {
    const sourceText = [
      'import { defineRecipe } from "@pandacss/dev";',
      "",
      "export const text = defineRecipe({",
      '  className: "text",',
      "  variants: {},",
      "});",
      "",
    ].join("\n");

    const nextSource = migrateRecipeModule(sourceText, "text", false);

    expect(nextSource).toContain(
      'import { cva, type RecipeVariantProps } from "@hashintel/ds-helpers/css";',
    );
    expect(nextSource).toContain("export const textRecipe = cva(textRecipeDefinition);");
    expect(nextSource).toContain(
      "export type TextRecipeProps = RecipeVariantProps<typeof textRecipe>;",
    );
    expect(nextSource).not.toContain("@ts-expect-error");
  });

  it("converts defineSlotRecipe modules to sva modules with a staged suppression", () => {
    const sourceText = [
      'import { tooltipAnatomy } from "@ark-ui/react/anatomy";',
      'import { defineSlotRecipe } from "@pandacss/dev";',
      "",
      "export const tooltip = defineSlotRecipe({",
      '  className: "tooltip",',
      "  slots: tooltipAnatomy.keys(),",
      "  base: {},",
      "});",
      "",
    ].join("\n");

    const nextSource = migrateRecipeModule(sourceText, "tooltip", true);

    expect(nextSource).toContain('import { tooltipAnatomy } from "@ark-ui/react/anatomy";');
    expect(nextSource).toContain(
      'import { sva, type RecipeVariantProps } from "@hashintel/ds-helpers/css";',
    );
    expect(nextSource).toContain(
      "// @ts-expect-error TODO(beta-graduation): invalid strict tokens remain in this beta recipe; remove before moving to src/components",
    );
    expect(nextSource).toContain(
      "export const tooltipSlotRecipe = sva(tooltipSlotRecipeDefinition);",
    );
    expect(nextSource).toContain(
      "export type TooltipSlotRecipeProps = RecipeVariantProps<typeof tooltipSlotRecipe>;",
    );
  });
});

describe("migrateComponentModule", () => {
  it("switches generated recipe imports to local cva recipe imports", () => {
    const sourceText = [
      'import { ark } from "@ark-ui/react/factory";',
      'import { styled } from "@hashintel/ds-helpers/jsx";',
      'import { text } from "@hashintel/ds-helpers/recipes";',
      "const Field = styled(ark.text, text);",
      'export const Text = styled("p", text);',
      "",
    ].join("\n");

    const nextSource = migrateComponentModule(sourceText, "text");

    expect(nextSource).toContain('import { textRecipe } from "./text.recipe";');
    expect(nextSource).toContain("const Field = styled(ark.text, textRecipe);");
    expect(nextSource).toContain('export const Text = styled("p", textRecipe);');
  });

  it("switches generated slot recipe imports to local slot recipe imports", () => {
    const sourceText = [
      'import { createStyleContext } from "@hashintel/ds-helpers/jsx";',
      'import { tooltip } from "@hashintel/ds-helpers/recipes";',
      "const { withRootProvider } = createStyleContext(tooltip);",
      "",
    ].join("\n");

    const nextSource = migrateComponentModule(sourceText, "tooltip");

    expect(nextSource).toContain('import { tooltipSlotRecipe } from "./tooltip.recipe";');
    expect(nextSource).toContain(
      "const { withRootProvider } = createStyleContext(tooltipSlotRecipe);",
    );
  });
});

describe("getRecipeSymbols", () => {
  it("derives explicit recipe names for cva and sva helpers", () => {
    expect(getRecipeSymbols("tooltip", "cva")).toEqual({
      definitionName: "tooltipRecipeDefinition",
      exportName: "tooltipRecipe",
      typeName: "TooltipRecipeProps",
    });
    expect(getRecipeSymbols("radio-card-group", "sva")).toEqual({
      definitionName: "radioCardGroupSlotRecipeDefinition",
      exportName: "radioCardGroupSlotRecipe",
      typeName: "RadioCardGroupSlotRecipeProps",
    });
  });
});
