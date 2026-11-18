import { ColorLayeringDemo } from "./tokens.color-layering.story";
import { ColorMappingsDemo } from "./tokens.color-migration.story";
import { ColorPalettesDemo } from "./tokens.color-palettes.story";
import { ColorVariantsDemo } from "./tokens.color-variants.story";
import { RadiiDemo } from "./tokens.radii.story";
import { ShadowsDemo } from "./tokens.shadows.story";
import { SpacingDemo } from "./tokens.spacing.story";
import { TypographyDemo } from "./tokens.typography.story";

import type { Leading, Roundness } from "./_types";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Tokens",
} satisfies Meta;

export default meta;

// Color palettes (solid, alpha, static, status aliases)
export const ColorPalettes: StoryObj = {
  name: "Color Palettes",
  render: () => <ColorPalettesDemo />,
};

// Semantic color variants (bg/fg/bd under colorPalette)
export const ColorVariants: StoryObj = {
  name: "Color Variants",
  render: () => <ColorVariantsDemo />,
};

// Background & border layering demo
export const ColorLayering: StoryObj = {
  name: "Color Layering",
  render: () => <ColorLayeringDemo />,
};

export const ColorMappings: StoryObj = {
  name: "Color Step Mappings",
  render: (_args, context) => {
    const { theme } = context.globals as Record<string, unknown>;
    return <ColorMappingsDemo isDark={theme === "dark"} />;
  },
};

// Other tokens
export const Radii: StoryObj<{ roundness: Roundness }> = {
  name: "Border Radii",
  argTypes: {
    roundness: {
      options: ["none", "sm", "md", "lg", "xl"],
      control: { type: "select" },
    },
  },
  args: { roundness: "md" },
  render: (args) => <RadiiDemo roundness={args.roundness} />,
};

export const Shadows: StoryObj = {
  name: "Shadows & Elevation",
  render: () => <ShadowsDemo />,
};

export const Spacing: StoryObj = {
  name: "Spacing",
  render: () => <SpacingDemo />,
};

export const Typography: StoryObj<{ leadingFactor: Leading }> = {
  name: "Typography",
  argTypes: {
    leadingFactor: {
      options: ["tight", "normal", "loose"],
      control: { type: "select" },
    },
  },
  args: { leadingFactor: "normal" },
  render: (args) => <TypographyDemo leadingFactor={args.leadingFactor} />,
};
