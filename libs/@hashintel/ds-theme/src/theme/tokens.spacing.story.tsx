import type { Story } from "@ladle/react";
import { css } from "../../styled-system/css";
import { token } from "../../styled-system/tokens";
import { VStack, HStack } from "../../styled-system/jsx";
import type { Token } from "../../styled-system/tokens/tokens";

const scales = ["default", "compact", "comfortable"] as const;
const steps = [
  "0",
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
] as const;

const stepLabelStyles = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "text.tertiary",
  width: "[24px]",
  textAlign: "right",
});

const valueStyles = css({
  fontSize: "xs",
  color: "text.disabled",
  minWidth: "[40px]",
});

const SpacingBar = ({ scale, step }: { scale: string; step: string }) => {
  const tokenPath = `spacing.${scale}.${step}` as Token;
  const value = token(tokenPath);

  return (
    <HStack gap="default.4" alignItems="center">
      <span className={stepLabelStyles}>{step}</span>
      <div
        className={css({
          height: "[16px]",
          bg: "blue.50",
          borderRadius: "md.2",
          transition: "[width_0.2s]",
        })}
        style={{ width: value }}
      />
      <span className={valueStyles}>{value}</span>
    </HStack>
  );
};

const ScaleColumn = ({ scale }: { scale: string }) => (
  <VStack gap="default.1" alignItems="flex-start">
    <span
      className={css({
        fontSize: "sm",
        fontWeight: "semibold",
        mb: "default.2",
        textTransform: "capitalize",
      })}
    >
      {scale}
    </span>
    {steps.map((step) => (
      <SpacingBar key={step} scale={scale} step={step} />
    ))}
  </VStack>
);

export const Spacing: Story = () => (
  <VStack gap="default.6" alignItems="flex-start" p="default.6">
    <h1 className={css({ fontSize: "2xl", fontWeight: "semibold" })}>
      Spacing Tokens
    </h1>
    <p
      className={css({
        fontSize: "sm",
        color: "text.secondary",
        maxWidth: "[600px]",
      })}
    >
      Spacing scales for different density modes. Default is the base scale,
      compact reduces spacing for dense UIs, and comfortable increases spacing
      for more relaxed layouts.
    </p>
    <HStack gap="default.12" alignItems="flex-start">
      {scales.map((scale) => (
        <ScaleColumn key={scale} scale={scale} />
      ))}
    </HStack>
  </VStack>
);

Spacing.storyName = "Spacing";
