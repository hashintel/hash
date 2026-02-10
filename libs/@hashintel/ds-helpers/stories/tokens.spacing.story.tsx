import type { Story } from "@ladle/react";
import { css } from "../styled-system/css";
import { token } from "../styled-system/tokens";
import { VStack, HStack } from "../styled-system/jsx";
import type { Token } from "../styled-system/tokens/tokens";
import type { SpacingToken } from "./_types";

const steps: readonly SpacingToken[] = [
  "0.5",
  "1",
  "1.5",
  "2",
  "3",
  "4",
  "5",
  "6",
  "8",
  "10",
  "12",
  "16",
  "20",
  "24",
];

const densityLevels = ["compact", "normal", "comfortable"] as const;

const labelStyles = css({
  textStyle: "xs",
  fontWeight: "medium",
  color: "fg.muted",
  fontFamily: "mono",
  textAlign: "right",
  width: "[28px]",
  flexShrink: "0",
});

const SpacingBar = ({ step }: { step: string }) => {
  const tokenPath = `spacing.${step}` as Token;
  const value = token(tokenPath);

  return (
    <div
      className={css({
        height: "[12px]",
        bg: "blue.s90",
        borderRadius: "xs",
        transition: "[width_0.2s]",
      })}
      style={{ width: value }}
    />
  );
};

const DensityColumn = ({ density }: { density: string }) => (
  <VStack gap="0" alignItems="flex-start" className={css({ density })}>
    <span
      className={css({
        textStyle: "xs",
        fontWeight: "semibold",
        textTransform: "uppercase",
        letterSpacing: "[0.05em]",
        fontFamily: "mono",
        mb: "3",
        ps: "[32px]",
      })}
    >
      {density}
    </span>
    {steps.map((step) => (
      <HStack key={step} gap="1" alignItems="center" py="0.5">
        <span className={labelStyles}>{step}</span>
        <SpacingBar step={step} />
      </HStack>
    ))}
  </VStack>
);

export const Spacing: Story = () => (
  <VStack gap="8" alignItems="flex-start" p="6">
    <VStack gap="2" alignItems="flex-start">
      <h1 className={css({ textStyle: "2xl", fontWeight: "semibold" })}>
        Spacing Tokens
      </h1>
      <p
        className={css({
          textStyle: "sm",
          color: "fg.body",
          maxWidth: "[640px]",
        })}
      >
        Spacing values from the Panda/Tailwind scale (1 = 0.25rem = 4px),
        multiplied by{" "}
        <code
          className={css({
            fontFamily: "mono",
            textStyle: "xs",
            bg: "neutral.s20",
            px: "1",
            py: "0.5",
            borderRadius: "xs",
          })}
        >
          --density-factor
        </code>
        . Compact (×0.75 = 3px/unit), Normal (×1 = 4px/unit), Comfortable (×1.25
        = 5px/unit).
      </p>
    </VStack>

    <HStack gap="8" alignItems="flex-start" flexWrap="wrap">
      {densityLevels.map((density) => (
        <DensityColumn key={density} density={density} />
      ))}
    </HStack>
  </VStack>
);

Spacing.storyName = "Spacing";
