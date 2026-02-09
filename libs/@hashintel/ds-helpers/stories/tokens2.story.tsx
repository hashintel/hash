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
 * These follow the radix 00-120 scale with half-steps, plus a00-a120 alpha variants.
 */
const COLOR_PALETTES = [
  "neutral",
  "blue",
  "red",
  "orange",
  "yellow",
  "green",
  "purple",
  "pink",
] as const;

/** Solid scale steps (00-120) - step 00 is pure white/black, with OKLCH half-steps */
const SOLID_STEPS = [
  "00",
  "05",
  "10",
  "15",
  "20",
  "25",
  "30",
  "35",
  "40",
  "45",
  "50",
  "55",
  "60",
  "65",
  "70",
  "75",
  "80",
  "85",
  "90",
  "95",
  "100",
  "105",
  "110",
  "115",
  "120",
] as const;

/** Alpha scale steps (a00-a120) - step a00 is transparent, with OKLCH half-steps */
const ALPHA_STEPS = [
  "a00",
  "a05",
  "a10",
  "a15",
  "a20",
  "a25",
  "a30",
  "a35",
  "a40",
  "a45",
  "a50",
  "a55",
  "a60",
  "a65",
  "a70",
  "a75",
  "a80",
  "a85",
  "a90",
  "a95",
  "a100",
  "a105",
  "a110",
  "a115",
  "a120",
] as const;

const swatchStyles = css({
  width: "[32px]",
  height: "[32px]",
  borderRadius: "md.3",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "[7px]",
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
  fontSize: "[7px]",
  fontWeight: "medium",
  width: "[32px]",
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
      Radix Solid Scales (00-120)
    </h1>
    <p
      className={css({
        fontSize: "sm",
        color: "fg.muted",
        maxWidth: "[600px]",
      })}
    >
      Step 00 is pure white (light) / black (dark). Steps 10-20 are tinted
      backgrounds, 30-50 are interactive, 60-80 are borders, 90-100 are solid
      backgrounds, and 110-120 are text. Half-steps (05, 15, ...) are OKLCH
      interpolations.
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
      Radix Alpha Scales (a00-a120)
    </h1>
    <p
      className={css({
        fontSize: "sm",
        color: "fg.muted",
        maxWidth: "[600px]",
      })}
    >
      Step a00 is fully transparent. Alpha variants a10-a120 use transparency
      instead of solid colors, useful for overlays, shadows, and blending with
      varying backgrounds. Half-steps are OKLCH interpolations.
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
        <Box p="4" bg="neutral.120" borderRadius="md.3">
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
          borderColor="bd"
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
      <code className={css({ font: "mono", fontSize: "xs" })}>
        status.info.30
      </code>{" "}
      instead of{" "}
      <code className={css({ font: "mono", fontSize: "xs" })}>blue.30</code> for
      intent-driven styling.
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
          Solid Steps (00-120)
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
          Alpha Steps (a00-a120)
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
              font: "mono",
              fontSize: "sm",
              minWidth: "[120px]",
            })}
          >
            status.info
          </span>
          <span className={css({ color: "fg.muted" })}>→</span>
          <span className={css({ font: "mono", fontSize: "sm" })}>blue</span>
        </HStack>
        <HStack gap="4">
          <span
            className={css({
              font: "mono",
              fontSize: "sm",
              minWidth: "[120px]",
            })}
          >
            status.success
          </span>
          <span className={css({ color: "fg.muted" })}>→</span>
          <span className={css({ font: "mono", fontSize: "sm" })}>green</span>
        </HStack>
        <HStack gap="4">
          <span
            className={css({
              font: "mono",
              fontSize: "sm",
              minWidth: "[120px]",
            })}
          >
            status.warning
          </span>
          <span className={css({ color: "fg.muted" })}>→</span>
          <span className={css({ font: "mono", fontSize: "sm" })}>orange</span>
        </HStack>
        <HStack gap="4">
          <span
            className={css({
              font: "mono",
              fontSize: "sm",
              minWidth: "[120px]",
            })}
          >
            status.error
          </span>
          <span className={css({ color: "fg.muted" })}>→</span>
          <span className={css({ font: "mono", fontSize: "sm" })}>red</span>
        </HStack>
      </VStack>
    </Box>
  </VStack>
);

StatusColors.storyName = "Status Colors";
