import type { Story } from "@ladle/react";
import { css } from "../styled-system/css";
import { token } from "../styled-system/tokens";
import { VStack, HStack } from "../styled-system/jsx";
import type { Token } from "../styled-system/tokens/tokens";
import type { SpacingToken } from "./_types";

const steps: readonly SpacingToken[] = [
  "0",
  "0.5",
  "1",
  "1.5",
  "2",
  "2.5",
  "3",
  "3.5",
  "4",
  "4.5",
  "5",
  "5.5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "14",
  "16",
  "20",
  "24",
];

const stepLabelStyles = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "fg.subtle",
  width: "[32px]",
  textAlign: "right",
  fontFamily: "mono",
});

const valueStyles = css({
  fontSize: "xs",
  color: "fg.subtle",
  minWidth: "[48px]",
  fontFamily: "mono",
});

const SpacingBar = ({ step }: { step: string }) => {
  const tokenPath = `spacing.${step}` as Token;
  const value = token(tokenPath);

  return (
    <HStack gap="4" alignItems="center">
      <span className={stepLabelStyles}>{step}</span>
      <div
        className={css({
          height: "[16px]",
          bg: "blue.s90",
          borderRadius: "sm",
          transition: "[width_0.2s]",
        })}
        style={{ width: value }}
      />
      <span className={valueStyles}>{value}</span>
    </HStack>
  );
};

export const Spacing: Story<{ density: string }> = ({ density }) => (
  <div data-density={density}>
    <VStack gap="6" alignItems="flex-start" p="6">
      <h1 className={css({ fontSize: "2xl", fontWeight: "semibold" })}>
        Spacing Tokens
      </h1>
      <p
        className={css({
          fontSize: "sm",
          color: "fg.muted",
          maxWidth: "[600px]",
        })}
      >
        Spacing scale from the default Panda/Tailwind system. Values follow a
        consistent 4px base unit (1 = 0.25rem = 4px).
      </p>
      <VStack gap="1" alignItems="flex-start">
        {steps.map((step) => (
          <SpacingBar key={step} step={step} />
        ))}
      </VStack>
    </VStack>
  </div>
);

Spacing.storyName = "Spacing";
Spacing.argTypes = {
  density: {
    options: ["compact", "normal", "comfortable"],
    control: { type: "select" },
    defaultValue: "normal",
  },
};
