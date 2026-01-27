import type { Story } from "@ladle/react";
import { useState } from "react";
import { css, cva } from "../styled-system/css";
import { VStack, HStack } from "../styled-system/jsx";
import { coreColors } from "./colors";
import { HeadStyle } from "../.ladle/components/head-style";

/** Core color palette names that have numeric shades */
const colorPaletteNames = Object.keys(coreColors).filter(
  (name) => !["neutral", "whiteAlpha", "accentAlpha", "accentGray"].includes(name),
);

/** Shades available in core color scales */
const shades = ["00", "10", "20", "30", "40", "50", "60", "70", "80", "90"];

/**
 * Generate CSS that remaps colorPalette variables based on data-palette attribute.
 * This is how you make colorPalette "dynamic" in Panda - via CSS variable remapping.
 */
const generatePaletteVariables = () => {
  return colorPaletteNames
    .map((color) => {
      const variables = shades
        .map((shade) => `--colors-color-palette-${shade}: var(--colors-${color}-${shade});`)
        .join(" ");
      return `[data-palette='${color}'] { ${variables} }`;
    })
    .join("\n");
};

const paletteCSS = generatePaletteVariables();

const swatchStyles = css({
  width: "[80px]",
  height: "[48px]",
  borderRadius: "md.3",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "[10px]",
  fontWeight: "medium",
  boxShadow: "[inset_0_0_0_1px_rgba(0,0,0,0.1)]",
  transition: "[all_0.2s_ease]",
});

const labelStyles = css({
  fontSize: "sm",
  fontWeight: "semibold",
  textTransform: "capitalize",
  minWidth: "[100px]",
});

const selectStyles = css({
  padding: "2",
  borderRadius: "md.2",
  border: "[1px_solid]",
  borderColor: "border.neutral",
  fontSize: "sm",
  minWidth: "[120px]",
  cursor: "pointer",
});

/** Button recipe using colorPalette - statically analyzable */
const buttonRecipe = cva({
  base: {
    px: "4",
    py: "2",
    borderRadius: "md.2",
    fontWeight: "medium",
    fontSize: "sm",
    cursor: "pointer",
    transition: "[all_0.2s_ease]",
  },
  variants: {
    variant: {
      solid: {
        bg: "colorPalette.50",
        color: "neutral.white",
        _hover: { bg: "colorPalette.60" },
      },
      outline: {
        bg: "[transparent]",
        color: "colorPalette.60",
        border: "[2px_solid]",
        borderColor: "colorPalette.50",
        _hover: { bg: "colorPalette.10" },
      },
      subtle: {
        bg: "colorPalette.10",
        color: "colorPalette.70",
        _hover: { bg: "colorPalette.20" },
      },
    },
  },
  defaultVariants: { variant: "solid" },
});

/** Badge styles using colorPalette */
const badgeStyles = css({
  display: "inline-flex",
  alignItems: "center",
  px: "2",
  py: "1",
  borderRadius: "md.1",
  fontSize: "xs",
  fontWeight: "medium",
  bg: "colorPalette.10",
  color: "colorPalette.70",
  border: "[1px_solid]",
  borderColor: "colorPalette.30",
});

/** Interactive demo - palette switching via data attribute */
const ColorPaletteSelector = () => {
  const [palette, setPalette] = useState("blue");

  return (
    <VStack gap="4" alignItems="flex-start" data-palette={palette}>
      <HStack gap="4" alignItems="center">
        <label className={labelStyles}>Color Palette:</label>
        <select
          className={selectStyles}
          value={palette}
          onChange={(e) => setPalette(e.target.value)}
        >
          {colorPaletteNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </HStack>

      <HStack gap="3">
        <button className={buttonRecipe({ variant: "solid" })}>Solid</button>
        <button className={buttonRecipe({ variant: "outline" })}>Outline</button>
        <button className={buttonRecipe({ variant: "subtle" })}>Subtle</button>
      </HStack>

      <HStack gap="2">
        {shades.map((shade) => (
          <div
            key={shade}
            className={swatchStyles}
            style={{ backgroundColor: `var(--colors-color-palette-${shade})` }}
          >
            <span className={css({ color: "neutral.white", textShadow: "[0_1px_2px_rgba(0,0,0,0.5)]" })}>
              {shade}
            </span>
          </div>
        ))}
      </HStack>
    </VStack>
  );
};

/** Side-by-side comparison using data-palette on each row */
const ColorPaletteComparison = () => (
  <VStack gap="4" alignItems="flex-start">
    {colorPaletteNames.slice(0, 6).map((palette) => (
      <HStack key={palette} gap="4" alignItems="center" data-palette={palette}>
        <span className={labelStyles}>{palette}</span>
        <HStack gap="2">
          <button className={buttonRecipe({ variant: "solid" })}>Solid</button>
          <button className={buttonRecipe({ variant: "outline" })}>Outline</button>
          <button className={buttonRecipe({ variant: "subtle" })}>Subtle</button>
        </HStack>
      </HStack>
    ))}
  </VStack>
);

export const VirtualColors: Story = () => (
  <>
    <HeadStyle id="virtual-color-palette" css={paletteCSS} />
    <VStack gap="8" alignItems="flex-start" p="6">
      <VStack gap="2" alignItems="flex-start">
        <h1 className={css({ fontSize: "2xl", fontWeight: "semibold" })}>
          Virtual Colors (colorPalette)
        </h1>
        <p className={css({ fontSize: "sm", color: "text.secondary", maxWidth: "[600px]" })}>
          Virtual colors allow components to be themed dynamically. Since Panda requires static
          analysis, dynamic switching is achieved by remapping CSS variables via{" "}
          <code className={css({ bg: "gray.10", px: "1", borderRadius: "md.1" })}>
            data-palette
          </code>{" "}
          attributes on container elements.
        </p>
      </VStack>

      <VStack gap="4" alignItems="flex-start">
        <h2 className={css({ fontSize: "lg", fontWeight: "semibold" })}>Interactive Demo</h2>
        <ColorPaletteSelector />
      </VStack>

      <VStack gap="4" alignItems="flex-start">
        <h2 className={css({ fontSize: "lg", fontWeight: "semibold" })}>Palette Comparison</h2>
        <ColorPaletteComparison />
      </VStack>

      <VStack gap="4" alignItems="flex-start">
        <h2 className={css({ fontSize: "lg", fontWeight: "semibold" })}>Badge Examples</h2>
        <HStack gap="2" flexWrap="wrap">
          <span data-palette="blue" className={badgeStyles}>Info</span>
          <span data-palette="green" className={badgeStyles}>Success</span>
          <span data-palette="yellow" className={badgeStyles}>Warning</span>
          <span data-palette="red" className={badgeStyles}>Error</span>
          <span data-palette="purple" className={badgeStyles}>Beta</span>
          <span data-palette="accent" className={badgeStyles}>New</span>
        </HStack>
      </VStack>
    </VStack>
  </>
);

VirtualColors.storyName = "Virtual Colors";
