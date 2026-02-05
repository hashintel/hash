import type { Story } from "@ladle/react";
import type { ReactNode } from "react";
import { css } from "../styled-system/css";
import { token } from "../styled-system/tokens";
import { VStack, HStack, Box } from "../styled-system/jsx";
import type { Token } from "../styled-system/tokens/tokens";

/**
 * SVG pattern for indicating transparency - diagonal lines in mid-gray.
 * Works in both light and dark modes.
 */
const DIAGONAL_PATTERN_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M-4,4 l8,-8 M0,16 l16,-16 M12,20 l8,-8' stroke='%23808080' stroke-width='0.5' stroke-opacity='0.3'/%3E%3C/svg%3E")`;

/**
 * Background wrapper for showing transparency in alpha color swatches.
 * Uses subtle diagonal lines that work in both light and dark modes.
 */
const TransparencyBackground = ({ children }: { children: ReactNode }) => (
  <Box
    p="4"
    borderRadius="md.3"
    style={{
      backgroundImage: DIAGONAL_PATTERN_SVG,
      backgroundSize: "16px 16px",
    }}
  >
    {children}
  </Box>
);

/**
 * Color palettes from the radix-based generation.
 * These follow the radix 1-12 scale plus a1-a12 alpha variants.
 */
const COLOR_PALETTES = [
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

/** Solid scale steps (0-12) - step 0 is pure white/black */
const SOLID_STEPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/** Alpha scale steps (a0-a12) - step a0 is transparent */
const ALPHA_STEPS = [
  "a0",
  "a1",
  "a2",
  "a3",
  "a4",
  "a5",
  "a6",
  "a7",
  "a8",
  "a9",
  "a10",
  "a11",
  "a12",
] as const;

const swatchStyles = css({
  width: "[48px]",
  height: "[48px]",
  borderRadius: "md.3",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "[9px]",
  fontWeight: "medium",
});

const labelStyles = css({
  fontSize: "sm",
  fontWeight: "semibold",
  textTransform: "capitalize",
  minWidth: "[80px]",
  textAlign: "right",
  pr: "3",
});

const headerStyles = css({
  fontSize: "[9px]",
  fontWeight: "medium",
  width: "[48px]",
  textAlign: "center",
  color: "fg.muted",
});

const ColorSwatch = ({
  colorName,
  step,
  showLabel = true,
}: {
  colorName: string;
  step: string | number;
  showLabel?: boolean;
}) => {
  const tokenPath = `colors.${colorName}.${step}` as Token;
  const bgColor = token(tokenPath);
  const isAlpha = typeof step === "string" && step.startsWith("a");

  return (
    <div
      className={swatchStyles}
      style={{
        backgroundColor: bgColor,
        boxShadow: isAlpha
          ? "inset 0 0 0 1px rgba(0,0,0,0.1)"
          : "inset 0 0 0 1px rgba(0,0,0,0.05)",
      }}
    >
      {showLabel && (
        <span
          className={css({
            color: "white",
            textShadow: "[0_1px_2px_rgba(0,0,0,0.5)]",
            mixBlendMode: "difference",
          })}
        >
          {step}
        </span>
      )}
    </div>
  );
};

const ColorRow = ({
  name,
  steps,
}: {
  name: string;
  steps: readonly (string | number)[];
}) => (
  <HStack gap="1" alignItems="center">
    <span className={labelStyles}>{name}</span>
    {steps.map((step) => (
      <ColorSwatch key={step} colorName={name} step={step} />
    ))}
  </HStack>
);

const StepHeaders = ({
  steps,
}: {
  steps: readonly (string | number)[];
}) => (
  <HStack gap="1" alignItems="center">
    <span className={labelStyles} />
    {steps.map((step) => (
      <span key={step} className={headerStyles}>
        {step}
      </span>
    ))}
  </HStack>
);

export const RadixSolidScales: Story = () => (
  <VStack gap="4" alignItems="flex-start" p="6">
    <h1 className={css({ fontSize: "2xl", fontWeight: "semibold" })}>
      Radix Solid Scales (0-12)
    </h1>
    <p
      className={css({
        fontSize: "sm",
        color: "fg.muted",
        maxWidth: "[600px]",
      })}
    >
      Step 0 is pure white (light) / black (dark). Steps 1-2 are tinted
      backgrounds, 3-5 are interactive, 6-8 are borders, 9-10 are solid
      backgrounds, and 11-12 are text.
    </p>
    <VStack gap="1" alignItems="flex-start">
      <StepHeaders steps={SOLID_STEPS} />
      {COLOR_PALETTES.map((name) => (
        <ColorRow key={name} name={name} steps={SOLID_STEPS} />
      ))}
    </VStack>
  </VStack>
);

RadixSolidScales.storyName = "Solid Scales";

export const RadixAlphaScales: Story = () => (
  <VStack gap="4" alignItems="flex-start" p="6">
    <h1 className={css({ fontSize: "2xl", fontWeight: "semibold" })}>
      Radix Alpha Scales (a0-a12)
    </h1>
    <p
      className={css({
        fontSize: "sm",
        color: "fg.muted",
        maxWidth: "[600px]",
      })}
    >
      Step a0 is fully transparent. Alpha variants a1-a12 use transparency
      instead of solid colors, useful for overlays, shadows, and blending with
      varying backgrounds.
    </p>
    <TransparencyBackground>
      <VStack gap="1" alignItems="flex-start">
        <StepHeaders steps={ALPHA_STEPS} />
        {COLOR_PALETTES.map((name) => (
          <ColorRow key={name} name={name} steps={ALPHA_STEPS} />
        ))}
      </VStack>
    </TransparencyBackground>
  </VStack>
);

RadixAlphaScales.storyName = "Alpha Scales";

export const StaticColors: Story = () => (
  <VStack gap="4" alignItems="flex-start" p="6">
    <h1 className={css({ fontSize: "2xl", fontWeight: "semibold" })}>
      Static Colors (black/white)
    </h1>
    <p
      className={css({
        fontSize: "sm",
        color: "fg.muted",
        maxWidth: "[600px]",
      })}
    >
      Pure black and white with alpha scales for consistent opacity layering.
    </p>
    <HStack gap="8">
      <VStack gap="2" alignItems="flex-start">
        <h2 className={css({ fontSize: "lg", fontWeight: "medium" })}>Black</h2>
        <TransparencyBackground>
          <HStack gap="1">
            {ALPHA_STEPS.map((step) => (
              <ColorSwatch key={step} colorName="black" step={step} />
            ))}
          </HStack>
        </TransparencyBackground>
      </VStack>
      <VStack gap="2" alignItems="flex-start">
        <h2 className={css({ fontSize: "lg", fontWeight: "medium" })}>White</h2>
        <Box p="4" bg="gray.12" borderRadius="md.3">
          <HStack gap="1">
            {ALPHA_STEPS.map((step) => (
              <ColorSwatch key={step} colorName="white" step={step} />
            ))}
          </HStack>
        </Box>
      </VStack>
    </HStack>
  </VStack>
);

StaticColors.storyName = "Static Colors";

export const GlobalAliases: Story = () => (
  <VStack gap="4" alignItems="flex-start" p="6">
    <h1 className={css({ fontSize: "2xl", fontWeight: "semibold" })}>
      Global Semantic Aliases
    </h1>
    <p
      className={css({
        fontSize: "sm",
        color: "fg.muted",
        maxWidth: "[600px]",
      })}
    >
      Top-level semantic tokens for common use cases: foreground text, canvas
      background, borders, and error states.
    </p>
    <VStack gap="4" alignItems="flex-start">
      <HStack gap="4" alignItems="center">
        <span className={labelStyles}>fg</span>
        <Box
          p="4"
          bg="canvas"
          borderRadius="md.3"
          boxShadow="[inset_0_0_0_1px_rgba(0,0,0,0.1)]"
        >
          <span style={{ color: token("colors.fg") }}>Default foreground</span>
        </Box>
      </HStack>
      <HStack gap="4" alignItems="center">
        <span className={labelStyles}>fg.muted</span>
        <Box
          p="4"
          bg="canvas"
          borderRadius="md.3"
          boxShadow="[inset_0_0_0_1px_rgba(0,0,0,0.1)]"
        >
          <span style={{ color: token("colors.fg.muted") }}>
            Muted foreground
          </span>
        </Box>
      </HStack>
      <HStack gap="4" alignItems="center">
        <span className={labelStyles}>fg.subtle</span>
        <Box
          p="4"
          bg="canvas"
          borderRadius="md.3"
          boxShadow="[inset_0_0_0_1px_rgba(0,0,0,0.1)]"
        >
          <span style={{ color: token("colors.fg.subtle") }}>
            Subtle foreground
          </span>
        </Box>
      </HStack>
      <HStack gap="4" alignItems="center">
        <span className={labelStyles}>canvas</span>
        <Box
          p="4"
          bg="canvas"
          borderRadius="md.3"
          boxShadow="[inset_0_0_0_1px_rgba(0,0,0,0.1)]"
          minWidth="[200px]"
        >
          <span className={css({ color: "fg" })}>Canvas background</span>
        </Box>
      </HStack>
      <HStack gap="4" alignItems="center">
        <span className={labelStyles}>border</span>
        <Box
          p="4"
          bg="canvas"
          borderRadius="md.3"
          borderWidth="[2px]"
          borderStyle="solid"
          borderColor="border"
          minWidth="[200px]"
        >
          <span className={css({ color: "fg" })}>Border color</span>
        </Box>
      </HStack>
    </VStack>
  </VStack>
);

GlobalAliases.storyName = "Global Aliases";

/**
 * Status color mappings for semantic use.
 */
const STATUS_COLORS = ["info", "success", "warning", "error"] as const;

const StatusColorSwatch = ({
  status,
  step,
}: {
  status: string;
  step: string | number;
}) => {
  const tokenPath = `colors.status.${status}.${step}` as Token;
  const bgColor = token(tokenPath);
  const isAlpha = typeof step === "string" && step.startsWith("a");

  return (
    <div
      className={swatchStyles}
      style={{
        backgroundColor: bgColor,
        boxShadow: isAlpha
          ? "inset 0 0 0 1px rgba(0,0,0,0.1)"
          : "inset 0 0 0 1px rgba(0,0,0,0.05)",
      }}
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
};

const StatusRow = ({
  status,
  steps,
}: {
  status: string;
  steps: readonly (string | number)[];
}) => (
  <HStack gap="1" alignItems="center">
    <span className={labelStyles}>{status}</span>
    {steps.map((step) => (
      <StatusColorSwatch key={step} status={status} step={step} />
    ))}
  </HStack>
);

export const StatusColors: Story = () => (
  <VStack gap="4" alignItems="flex-start" p="6">
    <h1 className={css({ fontSize: "2xl", fontWeight: "semibold" })}>
      Status Color Aliases
    </h1>
    <p
      className={css({
        fontSize: "sm",
        color: "fg.muted",
        maxWidth: "[600px]",
      })}
    >
      Semantic status tokens that alias color palettes. Use{" "}
      <code className={css({ fontFamily: "mono", fontSize: "xs" })}>
        status.info.3
      </code>{" "}
      instead of{" "}
      <code className={css({ fontFamily: "mono", fontSize: "xs" })}>
        blue.3
      </code>{" "}
      for intent-driven styling.
    </p>
    <VStack gap="4" alignItems="flex-start">
      <Box>
        <h2
          className={css({
            fontSize: "lg",
            fontWeight: "medium",
            mb: "2",
          })}
        >
          Solid Steps (0-12)
        </h2>
        <VStack gap="1" alignItems="flex-start">
          <StepHeaders steps={SOLID_STEPS} />
          {STATUS_COLORS.map((status) => (
            <StatusRow key={status} status={status} steps={SOLID_STEPS} />
          ))}
        </VStack>
      </Box>
      <Box>
        <h2
          className={css({
            fontSize: "lg",
            fontWeight: "medium",
            mb: "2",
          })}
        >
          Alpha Steps (a0-a12)
        </h2>
        <TransparencyBackground>
          <VStack gap="1" alignItems="flex-start">
            <StepHeaders steps={ALPHA_STEPS} />
            {STATUS_COLORS.map((status) => (
              <StatusRow key={status} status={status} steps={ALPHA_STEPS} />
            ))}
          </VStack>
        </TransparencyBackground>
      </Box>
    </VStack>
    <Box mt="4">
      <h2
        className={css({
          fontSize: "lg",
          fontWeight: "medium",
          mb: "2",
        })}
      >
        Mapping Reference
      </h2>
      <VStack gap="2" alignItems="flex-start">
        <HStack gap="4">
          <span
            className={css({
              fontFamily: "mono",
              fontSize: "sm",
              minWidth: "[120px]",
            })}
          >
            status.info
          </span>
          <span className={css({ color: "fg.muted" })}>→</span>
          <span className={css({ fontFamily: "mono", fontSize: "sm" })}>
            blue
          </span>
        </HStack>
        <HStack gap="4">
          <span
            className={css({
              fontFamily: "mono",
              fontSize: "sm",
              minWidth: "[120px]",
            })}
          >
            status.success
          </span>
          <span className={css({ color: "fg.muted" })}>→</span>
          <span className={css({ fontFamily: "mono", fontSize: "sm" })}>
            green
          </span>
        </HStack>
        <HStack gap="4">
          <span
            className={css({
              fontFamily: "mono",
              fontSize: "sm",
              minWidth: "[120px]",
            })}
          >
            status.warning
          </span>
          <span className={css({ color: "fg.muted" })}>→</span>
          <span className={css({ fontFamily: "mono", fontSize: "sm" })}>
            orange
          </span>
        </HStack>
        <HStack gap="4">
          <span
            className={css({
              fontFamily: "mono",
              fontSize: "sm",
              minWidth: "[120px]",
            })}
          >
            status.error
          </span>
          <span className={css({ color: "fg.muted" })}>→</span>
          <span className={css({ fontFamily: "mono", fontSize: "sm" })}>
            red
          </span>
        </HStack>
      </VStack>
    </Box>
  </VStack>
);

StatusColors.storyName = "Status Colors";
