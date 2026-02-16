import type { Story } from "@ladle/react";
import type { ReactNode } from "react";
import { css } from "../styled-system/css";
import { token } from "../styled-system/tokens";
import { VStack, HStack, Box } from "../styled-system/jsx";
import type { Token } from "../styled-system/tokens/tokens";
import type { PaletteName, SolidStep, AlphaStep } from "./_types";

const DIAGONAL_PATTERN_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath d='M-4,4 l8,-8 M0,16 l16,-16 M12,20 l8,-8' stroke='%23808080' stroke-width='0.5' stroke-opacity='0.3'/%3E%3C/svg%3E")`;

const TransparencyBackground = ({ children }: { children: ReactNode }) => (
  <Box
    p="4"
    borderRadius="md"
    style={{
      backgroundImage: DIAGONAL_PATTERN_SVG,
      backgroundSize: "16px 16px",
    }}
  >
    {children}
  </Box>
);

const STATUS_ALIASES: Record<string, string> = {
  blue: "status.info",
  green: "status.success",
  orange: "status.warning",
  red: "status.error",
};

const COLOR_PALETTES: readonly PaletteName[] = [
  "neutral",
  "blue",
  "red",
  "orange",
  "yellow",
  "green",
  "purple",
  "pink",
];

/**
 * Contrast flip thresholds per color mode.
 * Mirrors CONTRAST_FLIP_STEP_LIGHT / _DARK in ds-theme/src/theme/utils.ts.
 *
 * Swatch labels always render in a single color (no mode-conditional CSS),
 * so this uses the light-mode threshold for a reasonable default.
 */
const CONTRAST_FLIP_STEP = 80;

/** Bright palettes where steps 90–100 flip back to dark text (light mode). */
const BRIGHT_PALETTES: readonly string[] = ["orange", "yellow"];
const BRIGHT_FLIPBACK_STEPS = [90, 95, 100];

function useDarkText(palette: string, step: string): boolean {
  const num = Number(step.replace(/^[as]/, ""));
  if (num < CONTRAST_FLIP_STEP) return true;
  if (
    BRIGHT_PALETTES.includes(palette) &&
    BRIGHT_FLIPBACK_STEPS.includes(num)
  ) {
    return true;
  }
  return false;
}

/**
 * Returns the token path for the contrast fg color of a swatch label.
 * Uses the palette's own s125/s00 which are semantic tokens with _light/_dark
 * values, so they respond to color mode switching automatically.
 */
function swatchFgToken(palette: string, step: string): Token {
  return `colors.${palette}.${useDarkText(palette, step) ? "s125" : "s00"}` as Token;
}

const SOLID_STEPS: readonly SolidStep[] = [
  "s00",
  "s05",
  "s10",
  "s15",
  "s20",
  "s25",
  "s30",
  "s35",
  "s40",
  "s45",
  "s50",
  "s55",
  "s60",
  "s65",
  "s70",
  "s75",
  "s80",
  "s85",
  "s90",
  "s95",
  "s100",
  "s105",
  "s110",
  "s115",
  "s120",
  "s125",
];

const ALPHA_STEPS: readonly AlphaStep[] = [
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
  "a125",
];

const swatchStyles = css({
  width: "[32px]",
  height: "[32px]",
  borderRadius: "md",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "[7px]",
  fontWeight: "medium",
});

const labelStyles = css({
  textStyle: "sm",
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
  color: "fg.body",
});

const aliasStyles = css({
  fontSize: "[10px]",
  fontWeight: "medium",
  color: "fg.muted",
  pl: "3",
  whiteSpace: "nowrap",
});

const ColorSwatch = ({
  colorName,
  step,
}: {
  colorName: string;
  step: string;
}) => {
  const tokenPath = `colors.${colorName}.${step}` as Token;
  const isAlpha = step.startsWith("a");

  return (
    <div
      className={swatchStyles}
      style={{
        backgroundColor: token(tokenPath),
        color: token(swatchFgToken(colorName, step)),
        boxShadow: isAlpha
          ? "inset 0 0 0 1px rgba(0,0,0,0.1)"
          : "inset 0 0 0 1px rgba(0,0,0,0.05)",
      }}
    >
      {step}
    </div>
  );
};

const ColorRow = ({
  name,
  steps,
}: {
  name: string;
  steps: readonly string[];
}) => {
  const alias = STATUS_ALIASES[name];
  return (
    <HStack gap="1" alignItems="center">
      <span className={labelStyles}>{name}</span>
      {steps.map((step) => (
        <ColorSwatch key={step} colorName={name} step={step} />
      ))}
      {alias ? (
        <span className={aliasStyles}>= {alias}</span>
      ) : (
        <span className={aliasStyles} />
      )}
    </HStack>
  );
};

const StepHeaders = ({
  steps,
}: {
  steps: readonly string[];
}) => (
  <HStack gap="1" alignItems="center">
    <span className={labelStyles} />
    {steps.map((step) => (
      <span key={step} className={headerStyles}>
        {step}
      </span>
    ))}
    <span className={aliasStyles}>status alias</span>
  </HStack>
);

export const ColorPalettes: Story = () => (
  <VStack gap="8" alignItems="flex-start" p="6">
    <VStack gap="2" alignItems="flex-start">
      <h1 className={css({ textStyle: "2xl", fontWeight: "semibold" })}>
        Color Palettes
      </h1>
      <p
        className={css({
          textStyle: "sm",
          color: "fg.body",
          maxWidth: "[700px]",
        })}
      >
        Base color scales generated from Radix colors. Solid steps (s00–s125)
        range from white/black through tinted backgrounds, interactive fills,
        borders, solid backgrounds, to text. Alpha steps (a00–a125) use
        transparency for overlays and blending. Half-steps are OKLCH
        interpolations. Palettes marked with a status alias on the right can
        also be referenced as{" "}
        <code className={css({ font: "mono", textStyle: "xs" })}>
          status.*.s30
        </code>{" "}
        etc.
      </p>
    </VStack>

    <VStack gap="4" alignItems="flex-start">
      <h2 className={css({ textStyle: "lg", fontWeight: "semibold" })}>
        Solid Scales (s00–s125)
      </h2>
      <VStack gap="1" alignItems="flex-start">
        <StepHeaders steps={SOLID_STEPS} />
        {COLOR_PALETTES.map((name) => (
          <ColorRow key={name} name={name} steps={SOLID_STEPS} />
        ))}
      </VStack>
    </VStack>

    <VStack gap="4" alignItems="flex-start">
      <h2 className={css({ textStyle: "lg", fontWeight: "semibold" })}>
        Alpha Scales (a00–a125)
      </h2>
      <TransparencyBackground>
        <VStack gap="1" alignItems="flex-start">
          <StepHeaders steps={ALPHA_STEPS} />
          {COLOR_PALETTES.map((name) => (
            <ColorRow key={name} name={name} steps={ALPHA_STEPS} />
          ))}
        </VStack>
      </TransparencyBackground>
    </VStack>

    <VStack gap="4" alignItems="flex-start">
      <h2 className={css({ textStyle: "lg", fontWeight: "semibold" })}>
        Static Colors (black / white)
      </h2>
      <VStack gap="4" alignItems="flex-start">
        <VStack gap="2" alignItems="flex-start">
          <h3 className={css({ fontSize: "base", fontWeight: "medium" })}>
            Black
          </h3>
          <Box p="4" borderRadius="md" style={{ backgroundColor: "white" }}>
            <HStack gap="1">
              {ALPHA_STEPS.map((step) => (
                <ColorSwatch key={step} colorName="black" step={step} />
              ))}
            </HStack>
          </Box>
        </VStack>
        <VStack gap="2" alignItems="flex-start">
          <h3 className={css({ fontSize: "base", fontWeight: "medium" })}>
            White
          </h3>
          <Box p="4" borderRadius="md" style={{ backgroundColor: "black" }}>
            <HStack gap="1">
              {ALPHA_STEPS.map((step) => (
                <ColorSwatch key={step} colorName="white" step={step} />
              ))}
            </HStack>
          </Box>
        </VStack>
      </VStack>
    </VStack>
  </VStack>
);

ColorPalettes.storyName = "Color Palettes";
