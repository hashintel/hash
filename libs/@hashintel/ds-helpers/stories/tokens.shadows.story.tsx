import type { Story } from "@ladle/react";
import { css } from "../styled-system/css";
import { token } from "../styled-system/tokens";
import { VStack, HStack, Grid } from "../styled-system/jsx";
import type { Token } from "../styled-system/tokens/tokens";
import type {
  BaseShadow,
  InsetShadow,
  ElevationLevel,
  ElevationScale,
} from "./_types";

const SHADOW_STEPS: readonly BaseShadow[] = [
  "2xs",
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
  "2xl",
];
const INSET_STEPS: readonly InsetShadow[] = [
  "inset-2xs",
  "inset-xs",
  "inset-sm",
];

const ELEVATION_LEVELS: readonly ElevationLevel[] = [
  "drop",
  "lift",
  "raise",
  "float",
];
const ELEVATION_SCALES: readonly ElevationScale[] = ["micro", "macro"];

const labelStyles = css({
  textStyle: "xs",
  fontWeight: "medium",
  color: "fg.muted",
  textAlign: "center",
});

const valueStyles = css({
  fontSize: "[10px]",
  color: "fg.muted",
  textAlign: "center",
  fontFamily: "mono",
});

const sectionTitleStyles = css({
  textStyle: "lg",
  fontWeight: "semibold",
  borderBottom: "[1px_solid]",
  borderColor: "bd.subtle",
  pb: "2",
  mb: "4",
  width: "[100%]",
});

const ShadowSwatch = ({
  name,
  tokenPath,
}: { name: string; tokenPath: string }) => {
  const shadowValue = token(`shadows.${tokenPath}` as Token);

  return (
    <VStack gap="2" alignItems="center">
      <div
        className={css({
          width: "[80px]",
          height: "[80px]",
          borderRadius: "lg",
          bg: "neutral.s00",
        })}
        style={{ boxShadow: shadowValue }}
      />
      <span className={labelStyles}>{name}</span>
      <span className={valueStyles}>{tokenPath}</span>
    </VStack>
  );
};

const InsetSwatch = ({
  name,
  tokenPath,
}: { name: string; tokenPath: string }) => {
  const shadowValue = token(`shadows.${tokenPath}` as Token);

  return (
    <VStack gap="2" alignItems="center">
      <div
        className={css({
          width: "[80px]",
          height: "[80px]",
          borderRadius: "lg",
          bg: "neutral.s10",
        })}
        style={{ boxShadow: shadowValue }}
      />
      <span className={labelStyles}>{name}</span>
      <span className={valueStyles}>{tokenPath}</span>
    </VStack>
  );
};

const ElevationSwatch = ({
  level,
  scale,
}: {
  level: string;
  scale: string;
}) => {
  const tokenPath = `shadows.elevation.${level}.${scale}` as Token;
  const shadowValue = token(tokenPath);
  const size = scale === "macro" ? "[120px]" : "[64px]";
  const height = scale === "macro" ? "[80px]" : "[48px]";

  return (
    <VStack gap="2" alignItems="center">
      <div
        className={css({
          borderRadius: "lg",
          bg: "neutral.s00",
        })}
        style={{
          width: `var(--w, ${size === "[120px]" ? "120px" : "64px"})`,
          height: `var(--h, ${height === "[80px]" ? "80px" : "48px"})`,
          boxShadow: shadowValue,
        }}
      />
      <span className={labelStyles}>{level}</span>
    </VStack>
  );
};

export const Shadows: Story = () => (
  <VStack gap="8" alignItems="flex-start" p="6">
    <h1 className={css({ textStyle: "2xl", fontWeight: "semibold" })}>
      Shadows &amp; Elevation
    </h1>
    <p
      className={css({
        textStyle: "sm",
        color: "fg.body",
        maxWidth: "[700px]",
      })}
    >
      Base shadow tokens (2xs–2xl) for direct use, plus semantic elevation
      tokens (drop, lift, raise, float) in macro (large surfaces) and micro
      (small surfaces) scales.
    </p>

    <VStack gap="8" alignItems="flex-start" width="[100%]">
      <h2 className={sectionTitleStyles}>Base Shadows</h2>
      <HStack gap="6" flexWrap="wrap">
        {SHADOW_STEPS.map((step) => (
          <ShadowSwatch key={step} name={step} tokenPath={step} />
        ))}
      </HStack>
    </VStack>

    <VStack gap="8" alignItems="flex-start" width="[100%]">
      <h2 className={sectionTitleStyles}>Inset Shadows</h2>
      <HStack gap="6" flexWrap="wrap">
        {INSET_STEPS.map((step) => (
          <InsetSwatch
            key={step}
            name={step.replace("inset-", "")}
            tokenPath={step}
          />
        ))}
      </HStack>
    </VStack>

    <VStack gap="8" alignItems="flex-start" width="[100%]">
      <h2 className={sectionTitleStyles}>Elevation Tokens</h2>
      <p
        className={css({
          textStyle: "sm",
          color: "fg.body",
          maxWidth: "[600px]",
          mt: "[-16px]",
        })}
      >
        Semantic elevation levels map to base shadows. Macro is for large
        surface areas (cards, panels), micro is for small elements (buttons,
        badges).
      </p>

      <Grid columns={2} gap="10" width="[100%]">
        {ELEVATION_SCALES.map((scale) => (
          <VStack key={scale} gap="4" alignItems="flex-start">
            <span
              className={css({
                textStyle: "sm",
                fontWeight: "semibold",
                textTransform: "capitalize",
              })}
            >
              {scale}
              <span
                className={css({
                  fontWeight: "normal",
                  color: "fg.muted",
                  ml: "2",
                })}
              >
                {scale === "macro"
                  ? "Large Surface Area"
                  : "Small Surface Area"}
              </span>
            </span>
            <HStack gap="6" flexWrap="wrap">
              {ELEVATION_LEVELS.map((level) => (
                <ElevationSwatch key={level} level={level} scale={scale} />
              ))}
            </HStack>
          </VStack>
        ))}
      </Grid>
    </VStack>
  </VStack>
);

Shadows.storyName = "Shadows & Elevation";
