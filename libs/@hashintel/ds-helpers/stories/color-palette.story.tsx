import type { Story } from "@ladle/react";
import { useState } from "react";
import { css, cva } from "../styled-system/css";
import { VStack, HStack, Box } from "../styled-system/jsx";

const PALETTES = [
  "gray",
  "slate",
  "blue",
  "cyan",
  "teal",
  "red",
  "orange",
  "yellow",
  "green",
  "purple",
  "pink",
] as const;

const STATUS_PALETTES = [
  { name: "status.info", label: "Info (blue)" },
  { name: "status.success", label: "Success (green)" },
  { name: "status.warning", label: "Warning (orange)" },
  { name: "status.error", label: "Error (red)" },
] as const;

const buttonRecipe = cva({
  base: {
    px: "4",
    py: "2",
    borderRadius: "md.2",
    fontWeight: "medium",
    fontSize: "sm",
    cursor: "pointer",
    transition: "[all_0.15s_ease]",
  },
  variants: {
    variant: {
      solid: {
        bg: "colorPalette.bg.solid",
        color: "colorPalette.fg.solid",
        _hover: { bg: "colorPalette.bg.solid.hover" },
        _active: { bg: "colorPalette.bg.solid.active" },
        _disabled: {
          bg: "colorPalette.bg.solid.disabled",
          cursor: "not-allowed",
        },
      },
      surface: {
        bg: "colorPalette.bg.surface",
        color: "colorPalette.fg.muted",
        borderWidth: "[1px]",
        borderStyle: "solid",
        borderColor: "colorPalette.bd.subtle",
        _hover: {
          bg: "colorPalette.bg.surface.hover",
          borderColor: "colorPalette.bd.subtle.hover",
        },
        _active: { bg: "colorPalette.bg.surface.active" },
      },
      subtle: {
        bg: "colorPalette.bg.subtle",
        color: "colorPalette.fg.muted",
        _hover: { bg: "colorPalette.bg.subtle.hover" },
        _active: { bg: "colorPalette.bg.subtle.active" },
      },
      outline: {
        bg: "[transparent]",
        color: "colorPalette.fg.muted",
        borderWidth: "[1px]",
        borderStyle: "solid",
        borderColor: "colorPalette.bd.solid",
        _hover: {
          bg: "colorPalette.bg.surface",
          borderColor: "colorPalette.bd.solid.hover",
        },
        _active: { bg: "colorPalette.bg.surface.active" },
      },
      ghost: {
        bg: "[transparent]",
        color: "colorPalette.fg.link",
        _hover: {
          bg: "colorPalette.bg.subtle",
          color: "colorPalette.fg.link.hover",
        },
        _active: { bg: "colorPalette.bg.subtle.active" },
      },
    },
  },
  defaultVariants: { variant: "solid" },
});

const badgeStyles = css({
  display: "inline-flex",
  alignItems: "center",
  px: "2",
  py: "1",
  borderRadius: "md.1",
  fontSize: "xs",
  fontWeight: "medium",
  bg: "colorPalette.bg.subtle",
  color: "colorPalette.fg.muted",
});

const labelStyles = css({
  fontSize: "sm",
  fontWeight: "semibold",
  minWidth: "[100px]",
});
const selectStyles = css({
  padding: "2",
  borderRadius: "md.2",
  border: "[1px_solid]",
  borderColor: "bd",
  fontSize: "sm",
  minWidth: "[140px]",
  cursor: "pointer",
});

const InteractiveDemo = () => {
  const [palette, setPalette] = useState<string>("blue");

  return (
    <VStack gap="4" alignItems="flex-start" colorPalette={palette as "blue"}>
      <HStack gap="4" alignItems="center">
        <label className={labelStyles}>Color Palette:</label>
        <select
          className={selectStyles}
          value={palette}
          onChange={(e) => setPalette(e.target.value)}
        >
          {PALETTES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </HStack>

      <VStack gap="3" alignItems="flex-start">
        <h3 className={css({ fontSize: "base", fontWeight: "medium" })}>
          Button Variants
        </h3>
        <HStack gap="2">
          <button className={buttonRecipe({ variant: "solid" })}>Solid</button>
          <button className={buttonRecipe({ variant: "surface" })}>
            Surface
          </button>
          <button className={buttonRecipe({ variant: "subtle" })}>
            Subtle
          </button>
          <button className={buttonRecipe({ variant: "outline" })}>
            Outline
          </button>
          <button className={buttonRecipe({ variant: "ghost" })}>Ghost</button>
        </HStack>
      </VStack>

      <VStack gap="3" alignItems="flex-start">
        <h3 className={css({ fontSize: "base", fontWeight: "medium" })}>
          Badge
        </h3>
        <span className={badgeStyles}>Label</span>
      </VStack>
    </VStack>
  );
};

const NestedPalettes = () => (
  <VStack gap="4" alignItems="flex-start">
    <Box
      colorPalette="blue"
      p="4"
      borderRadius="md.3"
      bg="colorPalette.bg.surface"
    >
      <VStack gap="3" alignItems="flex-start">
        <span
          className={css({
            color: "colorPalette.fg.muted",
            fontWeight: "medium",
          })}
        >
          Blue context (parent)
        </span>
        <HStack gap="2">
          <button className={buttonRecipe({ variant: "solid" })}>
            Blue Button
          </button>
          <span className={badgeStyles}>Blue Badge</span>
        </HStack>

        <Box
          colorPalette="red"
          p="4"
          borderRadius="md.2"
          bg="colorPalette.bg.surface"
          mt="2"
        >
          <VStack gap="2" alignItems="flex-start">
            <span
              className={css({
                color: "colorPalette.fg.muted",
                fontWeight: "medium",
              })}
            >
              Red context (nested)
            </span>
            <HStack gap="2">
              <button className={buttonRecipe({ variant: "solid" })}>
                Red Button
              </button>
              <span className={badgeStyles}>Red Badge</span>
            </HStack>
          </VStack>
        </Box>

        <Box
          colorPalette="green"
          p="4"
          borderRadius="md.2"
          bg="colorPalette.bg.surface"
          mt="2"
        >
          <VStack gap="2" alignItems="flex-start">
            <span
              className={css({
                color: "colorPalette.fg.muted",
                fontWeight: "medium",
              })}
            >
              Green context (nested)
            </span>
            <HStack gap="2">
              <button className={buttonRecipe({ variant: "solid" })}>
                Green Button
              </button>
              <span className={badgeStyles}>Green Badge</span>
            </HStack>
          </VStack>
        </Box>
      </VStack>
    </Box>
  </VStack>
);

const AllPalettes = () => (
  <VStack gap="3" alignItems="flex-start">
    {PALETTES.map((palette) => (
      <HStack key={palette} gap="4" alignItems="center" colorPalette={palette}>
        <span className={labelStyles}>{palette}</span>
        <HStack gap="2">
          <button className={buttonRecipe({ variant: "solid" })}>Solid</button>
          <button className={buttonRecipe({ variant: "subtle" })}>
            Subtle
          </button>
          <button className={buttonRecipe({ variant: "outline" })}>
            Outline
          </button>
        </HStack>
        <span className={badgeStyles}>Badge</span>
      </HStack>
    ))}
  </VStack>
);

const StatusAliases = () => (
  <VStack gap="3" alignItems="flex-start">
    {STATUS_PALETTES.map(({ name, label }) => (
      <HStack
        key={name}
        gap="4"
        alignItems="center"
        colorPalette={name as "blue"}
      >
        <span className={labelStyles}>{label}</span>
        <HStack gap="2">
          <button className={buttonRecipe({ variant: "solid" })}>Solid</button>
          <button className={buttonRecipe({ variant: "subtle" })}>
            Subtle
          </button>
          <button className={buttonRecipe({ variant: "surface" })}>
            Surface
          </button>
        </HStack>
        <span className={badgeStyles}>{name}</span>
      </HStack>
    ))}
  </VStack>
);

export const ColorPalette: Story = () => (
  <VStack gap="8" alignItems="flex-start" p="6">
    <VStack gap="2" alignItems="flex-start">
      <h1 className={css({ fontSize: "2xl", fontWeight: "semibold" })}>
        Color Palette System
      </h1>
      <p
        className={css({
          fontSize: "sm",
          color: "fg.muted",
          maxWidth: "[700px]",
        })}
      >
        Components use{" "}
        <code
          className={css({ bg: "bg.muted", px: "1", borderRadius: "md.1" })}
        >
          colorPalette.bg.*
        </code>
        ,{" "}
        <code
          className={css({ bg: "bg.muted", px: "1", borderRadius: "md.1" })}
        >
          colorPalette.fg.*
        </code>
        , and{" "}
        <code
          className={css({ bg: "bg.muted", px: "1", borderRadius: "md.1" })}
        >
          colorPalette.bd.*
        </code>{" "}
        tokens. Set the active palette with the{" "}
        <code
          className={css({ bg: "bg.muted", px: "1", borderRadius: "md.1" })}
        >
          colorPalette
        </code>{" "}
        property.
      </p>
    </VStack>

    <VStack gap="4" alignItems="flex-start">
      <h2 className={css({ fontSize: "lg", fontWeight: "semibold" })}>
        Interactive Demo
      </h2>
      <InteractiveDemo />
    </VStack>

    <VStack gap="4" alignItems="flex-start">
      <h2 className={css({ fontSize: "lg", fontWeight: "semibold" })}>
        Nested Inheritance
      </h2>
      <p className={css({ fontSize: "sm", color: "fg.muted" })}>
        Child elements can override the colorPalette, creating local color
        contexts.
      </p>
      <NestedPalettes />
    </VStack>

    <VStack gap="4" alignItems="flex-start">
      <h2 className={css({ fontSize: "lg", fontWeight: "semibold" })}>
        All Palettes
      </h2>
      <AllPalettes />
    </VStack>

    <VStack gap="4" alignItems="flex-start">
      <h2 className={css({ fontSize: "lg", fontWeight: "semibold" })}>
        Status Aliases
      </h2>
      <p className={css({ fontSize: "sm", color: "fg.muted" })}>
        Semantic status values map to color palettes: status.info → blue, etc.
      </p>
      <StatusAliases />
    </VStack>
  </VStack>
);

ColorPalette.storyName = "Color Palette System";
