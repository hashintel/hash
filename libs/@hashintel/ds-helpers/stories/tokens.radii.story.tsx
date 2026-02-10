import type { Story } from "@ladle/react";
import { css } from "../styled-system/css";
import { token } from "../styled-system/tokens";
import { VStack, HStack, Box } from "../styled-system/jsx";
import type { Token } from "../styled-system/tokens/tokens";

const steps = [
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
  "2xl",
  "3xl",
  "4xl",
  "full",
] as const;

const roundnessLevels = ["none", "sm", "md", "lg", "xl"] as const;

const labelStyles = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "fg.subtle",
  textAlign: "center",
  fontFamily: "mono",
});

const sectionTitleStyles = css({
  fontSize: "lg",
  fontWeight: "semibold",
  borderBottom: "[1px_solid]",
  borderColor: "bd.subtle",
  pb: "2",
  width: "[100%]",
});

const RadiusSwatch = ({ step }: { step: string }) => {
  const tokenPath = `radii.${step}` as Token;
  const value = token(tokenPath);

  return (
    <VStack gap="1" alignItems="center">
      <div
        className={css({
          width: "[48px]",
          height: "[48px]",
          bg: "blue.s90",
          transition: "[border-radius_0.2s]",
        })}
        style={{ borderRadius: value }}
      />
      <span className={labelStyles}>{step}</span>
    </VStack>
  );
};

const SwatchGrid = ({ roundness }: { roundness?: string }) => (
  <div
    className={css({
      display: "grid",
      gap: "4",
      justifyItems: "center",
      roundness,
    })}
    style={{ gridTemplateColumns: `repeat(${steps.length}, auto)` }}
  >
    {steps.map((step) => (
      <RadiusSwatch key={step} step={step} />
    ))}
  </div>
);

const ComponentDemo = ({ roundness }: { roundness: string }) => {
  const items = [
    { label: "Badge", radius: "sm" as const, w: "56px", h: "24px" },
    { label: "Input", radius: "md" as const, w: "120px", h: "36px" },
    { label: "Card", radius: "xl" as const, w: "120px", h: "80px" },
    { label: "Pill", radius: "full" as const, w: "80px", h: "32px" },
  ];

  return (
    <HStack gap="6" flexWrap="wrap" className={css({ roundness })}>
      {items.map(({ label, radius, w, h }) => {
        const tokenPath = `radii.${radius}` as Token;
        const value = token(tokenPath);
        return (
          <VStack key={label} gap="2" alignItems="center">
            <div
              className={css({
                bg: "neutral.s90",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: "xs",
                fontWeight: "medium",
                transition: "[border-radius_0.2s]",
              })}
              style={{ borderRadius: value, width: w, height: h }}
            >
              {label}
            </div>
            <span className={labelStyles}>{radius}</span>
          </VStack>
        );
      })}
    </HStack>
  );
};

export const Radii: Story<{ roundness: string }> = ({ roundness }) => (
  <div className={css({ roundness })}>
    <VStack gap="8" alignItems="flex-start" p="6">
      <VStack gap="2" alignItems="flex-start">
        <h1 className={css({ fontSize: "2xl", fontWeight: "semibold" })}>
          Border Radius Tokens
        </h1>
        <p
          className={css({
            fontSize: "sm",
            color: "fg.muted",
            maxWidth: "[640px]",
          })}
        >
          Radii use the standard Panda preset scale (xs–4xl, full) with each
          value multiplied by{" "}
          <code
            className={css({
              fontFamily: "mono",
              fontSize: "xs",
              bg: "neutral.s20",
              px: "1",
              py: "0.5",
              borderRadius: "xs",
            })}
          >
            --roundness-factor
          </code>
          . Change the roundness control below to see all values scale together.
        </p>
      </VStack>

      <VStack gap="4" alignItems="flex-start" width="[100%]">
        <h2 className={sectionTitleStyles}>
          Current Scale (roundness: {roundness})
        </h2>
        <SwatchGrid />
      </VStack>

      <VStack gap="4" alignItems="flex-start" width="[100%]">
        <h2 className={sectionTitleStyles}>Component Examples</h2>
        <ComponentDemo roundness={roundness} />
      </VStack>

      <VStack gap="6" alignItems="flex-start" width="[100%]">
        <h2 className={sectionTitleStyles}>All Roundness Levels Compared</h2>
        <Box
          className={css({
            fontSize: "xs",
            color: "fg.muted",
            fontFamily: "mono",
            bg: "neutral.s10",
            p: "3",
            borderRadius: "md",
            width: "[100%]",
          })}
        >
          <pre>
            {`--roundness-factor-none: 0      → all corners square
--roundness-factor-sm:   0.75   → subtly rounded
--roundness-factor-md:   1      → default (unscaled)
--roundness-factor-lg:   1.5    → more rounded
--roundness-factor-xl:   2      → most rounded`}
          </pre>
        </Box>
        {roundnessLevels.map((level) => (
          <VStack key={level} gap="3" alignItems="flex-start" width="[100%]">
            <span
              className={css({
                fontSize: "sm",
                fontWeight: "semibold",
                textTransform: "uppercase",
                letterSpacing: "[0.05em]",
                fontFamily: "mono",
              })}
            >
              roundness: {level}
            </span>
            <SwatchGrid roundness={level} />
          </VStack>
        ))}
      </VStack>
    </VStack>
  </div>
);

Radii.storyName = "Border Radii";

Radii.argTypes = {
  roundness: {
    options: ["none", "sm", "md", "lg", "xl"],
    control: { type: "select" },
    defaultValue: "md",
  },
};
