import type { Story } from "@ladle/react";
import { gray as radixGray, grayA as radixGrayA } from "@radix-ui/colors";
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
 * Parse a color string into an *effective* RGB value suitable for contrast checks.
 *
 * Supports:
 * - #RRGGBB, #RGB
 * - #RRGGBBAA, #RGBA (alpha is composited over white)
 * - rgb(r, g, b), rgba(r, g, b, a) (alpha is composited over white)
 * - hsl(...), hsla(...) (alpha is composited over white)
 *
 * Returns null for CSS variables or unparseable formats.
 */
const parseColorToRgb = (
  color: string,
): { r: number; g: number; b: number } | null => {
  const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
  const compositeOverWhite = (rgba: {
    r: number;
    g: number;
    b: number;
    a: number;
  }) => {
    const a = clamp01(rgba.a);
    return {
      r: rgba.r * a + 255 * (1 - a),
      g: rgba.g * a + 255 * (1 - a),
      b: rgba.b * a + 255 * (1 - a),
    };
  };

  // Handle hex colors
  if (color.startsWith("#")) {
    const hex = color.slice(1);

    // #RGB / #RGBA
    if (hex.length === 3 || hex.length === 4) {
      const r = Number.parseInt(hex[0] + hex[0], 16);
      const g = Number.parseInt(hex[1] + hex[1], 16);
      const b = Number.parseInt(hex[2] + hex[2], 16);
      const a =
        hex.length === 4 ? Number.parseInt(hex[3] + hex[3], 16) / 255 : 1;
      if (
        !Number.isNaN(r) &&
        !Number.isNaN(g) &&
        !Number.isNaN(b) &&
        !Number.isNaN(a)
      ) {
        return compositeOverWhite({ r, g, b, a });
      }
    }

    // #RRGGBB / #RRGGBBAA
    if (hex.length >= 6) {
      const r = Number.parseInt(hex.slice(0, 2), 16);
      const g = Number.parseInt(hex.slice(2, 4), 16);
      const b = Number.parseInt(hex.slice(4, 6), 16);
      const a =
        hex.length >= 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;
      if (
        !Number.isNaN(r) &&
        !Number.isNaN(g) &&
        !Number.isNaN(b) &&
        !Number.isNaN(a)
      ) {
        return compositeOverWhite({ r, g, b, a });
      }
    }
  }

  // Handle rgb/rgba colors
  const rgbaMatch = color.match(
    /rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?))?\s*\)/,
  );
  if (rgbaMatch) {
    const r = Number.parseFloat(rgbaMatch[1]!);
    const g = Number.parseFloat(rgbaMatch[2]!);
    const b = Number.parseFloat(rgbaMatch[3]!);
    const a = rgbaMatch[4] ? Number.parseFloat(rgbaMatch[4]) : 1;
    if (
      !Number.isNaN(r) &&
      !Number.isNaN(g) &&
      !Number.isNaN(b) &&
      !Number.isNaN(a)
    ) {
      return compositeOverWhite({ r, g, b, a });
    }
  }

  // Handle hsl/hsla colors
  const hslaMatch = color.match(
    /hsla?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%(?:\s*,\s*(\d+(?:\.\d+)?))?\s*\)/,
  );
  if (hslaMatch) {
    const h = ((Number.parseFloat(hslaMatch[1]!) % 360) + 360) % 360;
    const s = Number.parseFloat(hslaMatch[2]!) / 100;
    const l = Number.parseFloat(hslaMatch[3]!) / 100;
    const a = hslaMatch[4] ? Number.parseFloat(hslaMatch[4]) : 1;

    if (
      !Number.isNaN(h) &&
      !Number.isNaN(s) &&
      !Number.isNaN(l) &&
      !Number.isNaN(a)
    ) {
      const c = (1 - Math.abs(2 * l - 1)) * s;
      const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
      const m = l - c / 2;

      let rp = 0;
      let gp = 0;
      let bp = 0;
      if (h < 60) {
        rp = c;
        gp = x;
      } else if (h < 120) {
        rp = x;
        gp = c;
      } else if (h < 180) {
        gp = c;
        bp = x;
      } else if (h < 240) {
        gp = x;
        bp = c;
      } else if (h < 300) {
        rp = x;
        bp = c;
      } else {
        rp = c;
        bp = x;
      }

      const r = (rp + m) * 255;
      const g = (gp + m) * 255;
      const b = (bp + m) * 255;
      return compositeOverWhite({ r, g, b, a });
    }
  }

  // CSS variables or other formats - can't parse
  return null;
};

/**
 * Get a contrasting text color (black or white) for a background.
 * Falls back to black if the color can't be parsed.
 */
const getContrastColor = (color: string): string => {
  const rgb = parseColorToRgb(color);
  if (!rgb) {
    return "#000";
  }
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.5 ? "#000" : "#fff";
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
