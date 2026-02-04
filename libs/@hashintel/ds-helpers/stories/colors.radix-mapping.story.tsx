import type { Story } from "@ladle/react";
import { gray as radixGray, grayA as radixGrayA } from "@radix-ui/colors";
import { readableColor } from "color2k";
import { css } from "../styled-system/css";
import { token } from "../styled-system/tokens";
import { VStack, HStack, Box } from "../styled-system/jsx";
import type { Token } from "../styled-system/tokens/tokens";

/** Radix step keys (1-12) */
type RadixStep =
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "11"
  | "12";
const radixSteps: RadixStep[] = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
];

/** Radix alpha step keys (a1-a12) */
type RadixAlphaStep =
  | "a1"
  | "a2"
  | "a3"
  | "a4"
  | "a5"
  | "a6"
  | "a7"
  | "a8"
  | "a9"
  | "a10"
  | "a11"
  | "a12";
const radixAlphaSteps: RadixAlphaStep[] = [
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
];

/** Convert radix key format (gray1 -> 1) */
const getRadixColor = (step: RadixStep): string =>
  radixGray[`gray${step}` as keyof typeof radixGray];
const getRadixAlphaColor = (step: RadixAlphaStep): string =>
  radixGrayA[`gray${step.toUpperCase()}` as keyof typeof radixGrayA];

/** HASH gray token scale keys */
type HashGrayKey =
  | "00"
  | "10"
  | "20"
  | "30"
  | "35"
  | "40"
  | "50"
  | "60"
  | "70"
  | "80"
  | "90"
  | "95";

const hashGrayKeys: HashGrayKey[] = [
  "00",
  "10",
  "20",
  "30",
  "35",
  "40",
  "50",
  "60",
  "70",
  "80",
  "90",
  "95",
];

/**
 * 🎯 MAPPING CONFIGURATION
 *
 * Tweak this to find the best alignment between Radix steps and HASH gray.
 */
const radixToHashMapping: Record<RadixStep, HashGrayKey> = {
  "1": "10",
  "2": "10",
  "3": "20",
  "4": "20",
  "5": "30",
  "6": "30",
  "7": "40",
  "8": "40",
  "9": "50",
  "10": "50",
  "11": "60",
  "12": "90",
};

/**
 * 🎯 ALPHA MAPPING CONFIGURATION
 *
 * Radix alpha colors → HASH solid gray equivalents.
 * These are approximations since we don't have alpha variants.
 */
const radixAlphaToHashMapping: Record<RadixAlphaStep, HashGrayKey> = {
  a1: "10",
  a2: "10",
  a3: "20",
  a4: "20",
  a5: "20",
  a6: "30",
  a7: "30",
  a8: "40",
  a9: "50",
  a10: "50",
  a11: "60",
  a12: "90",
};

const swatchStyles = css({
  width: "[80px]",
  height: "[48px]",
  borderRadius: "md.3",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "[9px]",
  fontFamily: "body",
  gap: "[2px]",
  boxShadow: "[inset_0_0_0_1px_rgba(0,0,0,0.1)]",
});

const labelStyles = css({
  fontSize: "sm",
  fontWeight: "semibold",
  minWidth: "[60px]",
  textAlign: "right",
  pr: "3",
});

const sectionTitleStyles = css({
  fontSize: "lg",
  fontWeight: "semibold",
  mb: "4",
});

/**
 * Get a contrasting text color (black or white) for a background.
 * Falls back to black if the color can't be parsed.
 */
const getContrastColor = (color: string): string => {
  try {
    return readableColor(color);
  } catch {
    return "#000";
  }
};

/** Format a color value for display. */
const formatColorLabel = (color: string): string => {
  if (color.startsWith("var(")) {
    // Extract the last segment of the CSS variable name
    const varName = color.slice(4, -1);
    return varName.split("--").pop() ?? color;
  }
  if (color.length > 20) {
    return `${color.slice(0, 17)}...`;
  }
  return color;
};

const RadixSwatch = ({ step, color }: { step: string; color: string }) => (
  <div
    className={swatchStyles}
    style={{
      backgroundColor: color,
      color: getContrastColor(color),
    }}
  >
    <span style={{ fontWeight: 600 }}>{step}</span>
    <span style={{ opacity: 0.7 }}>{formatColorLabel(color)}</span>
  </div>
);

const HashSwatch = ({ shade }: { shade: HashGrayKey }) => {
  const tokenPath = `colors.gray.${shade}` as Token;
  const colorValue = token(tokenPath);
  // Heuristic for CSS variables: lower shade numbers are lighter backgrounds
  const shadeNum = Number.parseInt(shade, 10);
  const textColor = shadeNum <= 40 ? "#000" : "#fff";

  return (
    <div
      className={swatchStyles}
      style={{
        backgroundColor: colorValue,
        color: textColor,
      }}
    >
      <span style={{ fontWeight: 600 }}>{shade}</span>
      <span style={{ opacity: 0.7 }}>{formatColorLabel(colorValue)}</span>
    </div>
  );
};

const ComparisonRow = ({
  radixStep,
  radixColor,
  hashShade,
}: {
  radixStep: string;
  radixColor: string;
  hashShade: HashGrayKey;
}) => (
  <HStack gap="1" alignItems="center">
    <span className={labelStyles}>radix.{radixStep}</span>
    <RadixSwatch step={radixStep} color={radixColor} />
    <Box px="2" color="gray.50">
      →
    </Box>
    <HashSwatch shade={hashShade} />
    <span className={labelStyles}>gray.{hashShade}</span>
  </HStack>
);

export const RadixMapping: Story = () => (
  <VStack gap="8" alignItems="flex-start" p="6">
    <h1 className={css({ fontSize: "2xl", fontWeight: "semibold" })}>
      Color Scale Mapping: Radix Neutral → HASH Gray
    </h1>

    <p className={css({ color: "gray.60", maxWidth: "[600px]" })}>
      Adjust <code>radixToHashMapping</code> in this file to align Radix neutral
      steps with HASH gray tokens.
    </p>

    <VStack gap="4" alignItems="flex-start">
      <h2 className={sectionTitleStyles}>Radix Neutral (1-12) → HASH Gray</h2>
      <VStack gap="2" alignItems="flex-start">
        {radixSteps.map((step) => (
          <ComparisonRow
            key={step}
            radixStep={step}
            radixColor={getRadixColor(step)}
            hashShade={radixToHashMapping[step]}
          />
        ))}
      </VStack>
    </VStack>

    <VStack gap="4" alignItems="flex-start">
      <h2 className={sectionTitleStyles}>Full HASH Gray Scale</h2>
      <HStack gap="1" alignItems="center" flexWrap="wrap">
        {hashGrayKeys.map((shade) => (
          <HashSwatch key={shade} shade={shade} />
        ))}
      </HStack>
    </VStack>

    <VStack gap="4" alignItems="flex-start">
      <h2 className={sectionTitleStyles}>Radix Alpha (a1-a12) → HASH Gray</h2>
      <p className={css({ color: "gray.60", fontSize: "sm", mb: "2" })}>
        Alpha values mapped to solid equivalents (approximations).
      </p>
      <VStack gap="2" alignItems="flex-start">
        {radixAlphaSteps.map((step) => (
          <ComparisonRow
            key={step}
            radixStep={step}
            radixColor={getRadixAlphaColor(step)}
            hashShade={radixAlphaToHashMapping[step]}
          />
        ))}
      </VStack>
    </VStack>
  </VStack>
);

RadixMapping.storyName = "Radix → HASH Mapping";
