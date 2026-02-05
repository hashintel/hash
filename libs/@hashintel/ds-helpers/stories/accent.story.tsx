import type { Story } from "@ladle/react";
import { useState } from "react";
import { css, cva } from "../styled-system/css";
import { VStack, HStack, Box } from "../styled-system/jsx";
import { HeadStyle } from "../.ladle/components/head-style";
import {
  generateAccentCSS,
  ACCENT_PALETTES,
  ACCENT_STATUS_MAP,
} from "@hashintel/ds-theme/accent";

// Generate the accent CSS rules
const accentCSS = generateAccentCSS();

/** Solid scale steps for visualization */
const SOLID_STEPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

const swatchStyles = css({
  width: "[40px]",
  height: "[40px]",
  borderRadius: "md.2",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "[9px]",
  fontWeight: "medium",
  boxShadow: "[inset_0_0_0_1px_rgba(0,0,0,0.1)]",
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
  borderColor: "border",
  fontSize: "sm",
  minWidth: "[140px]",
  cursor: "pointer",
});

/**
 * Button recipe using accent tokens.
 * These reference colorPalette which gets remapped by data-accent.
 */
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
        bg: "accent.solid.bg",
        color: "accent.solid.fg",
        _hover: { bg: "accent.solid.bg.hover" },
      },
      subtle: {
        bg: "accent.subtle.bg",
        color: "accent.subtle.fg",
        _hover: { bg: "accent.subtle.bg.hover" },
        _active: { bg: "accent.subtle.bg.active" },
      },
      surface: {
        bg: "accent.surface.bg",
        color: "accent.surface.fg",
        borderWidth: "[1px]",
        borderStyle: "solid",
        borderColor: "accent.surface.border",
        _hover: { borderColor: "accent.surface.border.hover" },
        _active: { bg: "accent.surface.bg.active" },
      },
      outline: {
        bg: "[transparent]",
        color: "accent.outline.fg",
        borderWidth: "[1px]",
        borderStyle: "solid",
        borderColor: "accent.outline.border",
        _hover: { bg: "accent.outline.bg.hover" },
        _active: { bg: "accent.outline.bg.active" },
      },
      plain: {
        bg: "[transparent]",
        color: "accent.plain.fg",
        _hover: { bg: "accent.plain.bg.hover" },
        _active: { bg: "accent.plain.bg.active" },
      },
    },
  },
  defaultVariants: { variant: "solid" },
});

/** Badge using accent tokens */
const badgeStyles = css({
  display: "inline-flex",
  alignItems: "center",
  px: "2",
  py: "1",
  borderRadius: "md.1",
  fontSize: "xs",
  fontWeight: "medium",
  bg: "accent.subtle.bg",
  color: "accent.subtle.fg",
});

/** Accent scale swatch using the virtual accent tokens */
const AccentSwatch = ({ step }: { step: number }) => (
  <div
    className={swatchStyles}
    style={{ backgroundColor: `var(--colors-accent-${step})` }}
  >
    <span
      className={css({
        color: "white",
        textShadow: "[0_1px_2px_rgba(0,0,0,0.5)]",
        mixBlendMode: "difference",
      })}
    >
      {step}
    </span>
  </div>
);

/** Interactive demo - accent switching via data-accent attribute */
const AccentSelector = () => {
  const [accent, setAccent] = useState<string>("blue");

  const allAccents = [
    ...ACCENT_PALETTES,
    "neutral",
    ...Object.keys(ACCENT_STATUS_MAP),
  ];

  return (
    <VStack gap="4" alignItems="flex-start" data-accent={accent}>
      <HStack gap="4" alignItems="center">
        <label className={labelStyles}>Accent:</label>
        <select
          className={selectStyles}
          value={accent}
          onChange={(e) => setAccent(e.target.value)}
        >
          <optgroup label="Palettes">
            {ACCENT_PALETTES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value="neutral">neutral (gray)</option>
          </optgroup>
          <optgroup label="Status">
            {Object.keys(ACCENT_STATUS_MAP).map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </optgroup>
        </select>
      </HStack>

      <VStack gap="3" alignItems="flex-start">
        <h3 className={css({ fontSize: "base", fontWeight: "medium" })}>
          Button Variants
        </h3>
        <HStack gap="2">
          <button className={buttonRecipe({ variant: "solid" })}>Solid</button>
          <button className={buttonRecipe({ variant: "subtle" })}>
            Subtle
          </button>
          <button className={buttonRecipe({ variant: "surface" })}>
            Surface
          </button>
          <button className={buttonRecipe({ variant: "outline" })}>
            Outline
          </button>
          <button className={buttonRecipe({ variant: "plain" })}>Plain</button>
        </HStack>
      </VStack>

      <VStack gap="3" alignItems="flex-start">
        <h3 className={css({ fontSize: "base", fontWeight: "medium" })}>
          Accent Scale
        </h3>
        <HStack gap="1">
          {SOLID_STEPS.map((step) => (
            <AccentSwatch key={step} step={step} />
          ))}
        </HStack>
      </VStack>
    </VStack>
  );
};

/** Nested accent inheritance demo */
const NestedAccents = () => (
  <VStack gap="4" alignItems="flex-start">
    <Box data-accent="blue" p="4" borderRadius="md.3" bg="accent.surface.bg">
      <VStack gap="3" alignItems="flex-start">
        <span className={css({ color: "accent.11", fontWeight: "medium" })}>
          Blue context (parent)
        </span>
        <HStack gap="2">
          <button className={buttonRecipe({ variant: "solid" })}>
            Blue Button
          </button>
          <span className={badgeStyles}>Blue Badge</span>
        </HStack>

        <Box
          data-accent="status.error"
          p="4"
          borderRadius="md.2"
          bg="accent.surface.bg"
          mt="2"
        >
          <VStack gap="2" alignItems="flex-start">
            <span className={css({ color: "accent.11", fontWeight: "medium" })}>
              Error context (nested)
            </span>
            <HStack gap="2">
              <button className={buttonRecipe({ variant: "solid" })}>
                Error Button
              </button>
              <span className={badgeStyles}>Error Badge</span>
            </HStack>
          </VStack>
        </Box>

        <Box
          data-accent="status.success"
          p="4"
          borderRadius="md.2"
          bg="accent.surface.bg"
          mt="2"
        >
          <VStack gap="2" alignItems="flex-start">
            <span className={css({ color: "accent.11", fontWeight: "medium" })}>
              Success context (nested)
            </span>
            <HStack gap="2">
              <button className={buttonRecipe({ variant: "solid" })}>
                Success Button
              </button>
              <span className={badgeStyles}>Success Badge</span>
            </HStack>
          </VStack>
        </Box>
      </VStack>
    </Box>
  </VStack>
);

/** All palettes comparison */
const AccentComparison = () => (
  <VStack gap="3" alignItems="flex-start">
    {[...ACCENT_PALETTES, "neutral"].map((palette) => (
      <HStack key={palette} gap="4" alignItems="center" data-accent={palette}>
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

/** Status aliases demo */
const StatusAccents = () => (
  <VStack gap="3" alignItems="flex-start">
    {Object.entries(ACCENT_STATUS_MAP).map(([status, palette]) => (
      <HStack key={status} gap="4" alignItems="center" data-accent={status}>
        <span className={labelStyles}>{status}</span>
        <HStack gap="2">
          <button className={buttonRecipe({ variant: "solid" })}>Solid</button>
          <button className={buttonRecipe({ variant: "subtle" })}>
            Subtle
          </button>
          <button className={buttonRecipe({ variant: "surface" })}>
            Surface
          </button>
        </HStack>
        <span className={badgeStyles}>{palette}</span>
      </HStack>
    ))}
  </VStack>
);

export const AccentSystem: Story = () => (
  <>
    <HeadStyle id="accent-system" css={accentCSS} />
    <VStack gap="8" alignItems="flex-start" p="6">
      <VStack gap="2" alignItems="flex-start">
        <h1 className={css({ fontSize: "2xl", fontWeight: "semibold" })}>
          Accent Color System
        </h1>
        <p
          className={css({
            fontSize: "sm",
            color: "fg.muted",
            maxWidth: "[700px]",
          })}
        >
          The accent system provides inheritable, switchable color contexts.
          Components use{" "}
          <code
            className={css({ bg: "gray.3", px: "1", borderRadius: "md.1" })}
          >
            accent.*
          </code>{" "}
          tokens which resolve to{" "}
          <code
            className={css({ bg: "gray.3", px: "1", borderRadius: "md.1" })}
          >
            colorPalette.*
          </code>{" "}
          CSS variables. The{" "}
          <code
            className={css({ bg: "gray.3", px: "1", borderRadius: "md.1" })}
          >
            data-accent
          </code>{" "}
          attribute remaps these variables, and the change cascades to all
          children.
        </p>
      </VStack>

      <VStack gap="4" alignItems="flex-start">
        <h2 className={css({ fontSize: "lg", fontWeight: "semibold" })}>
          Interactive Demo
        </h2>
        <AccentSelector />
      </VStack>

      <VStack gap="4" alignItems="flex-start">
        <h2 className={css({ fontSize: "lg", fontWeight: "semibold" })}>
          Nested Inheritance
        </h2>
        <p className={css({ fontSize: "sm", color: "fg.muted" })}>
          Child elements can override the accent, creating local color contexts.
        </p>
        <NestedAccents />
      </VStack>

      <VStack gap="4" alignItems="flex-start">
        <h2 className={css({ fontSize: "lg", fontWeight: "semibold" })}>
          Palette Comparison
        </h2>
        <AccentComparison />
      </VStack>

      <VStack gap="4" alignItems="flex-start">
        <h2 className={css({ fontSize: "lg", fontWeight: "semibold" })}>
          Status Aliases
        </h2>
        <p className={css({ fontSize: "sm", color: "fg.muted" })}>
          Semantic status values map to underlying palettes.
        </p>
        <StatusAccents />
      </VStack>
    </VStack>
  </>
);

AccentSystem.storyName = "Accent System";
