import type { Story } from "@ladle/react";
import { css } from "../../styled-system/css";
import { token } from "../../styled-system/tokens";
import { VStack, HStack } from "../../styled-system/jsx";
import type { Token } from "../../styled-system/tokens/tokens";

const scales = ["sm", "md", "lg"] as const;
const steps = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "full"] as const;

const labelStyles = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.500",
  textAlign: "center",
});

const valueStyles = css({
  fontSize: "10px",
  color: "neutral.400",
  textAlign: "center",
});

const sectionTitleStyles = css({
  fontSize: "lg",
  fontWeight: "semibold",
  borderBottom: "1px solid",
  borderColor: "neutral.200",
  pb: "2",
  mb: "4",
  width: "100%",
});

const RadiusSwatch = ({ scale, step }: { scale: string; step: string }) => {
  const tokenPath = `radii.${scale}.${step}` as Token;
  const value = token(tokenPath);

  return (
    <VStack gap="1" alignItems="center">
      <div
        className={css({
          width: "48px",
          height: "48px",
          bg: "blue.500",
          transition: "border-radius 0.2s",
        })}
        style={{ borderRadius: value }}
      />
      <span className={labelStyles}>{step}</span>
      <span className={valueStyles}>{value}</span>
    </VStack>
  );
};

const ScaleRow = ({ scale }: { scale: string }) => (
  <VStack gap="4" alignItems="flex-start">
    <span className={css({ fontSize: "sm", fontWeight: "semibold", textTransform: "uppercase", letterSpacing: "wide" })}>
      {scale}
    </span>
    <HStack gap="4" flexWrap="wrap">
      {steps.map((step) => (
        <RadiusSwatch key={step} scale={scale} step={step} />
      ))}
    </HStack>
  </VStack>
);

const ComponentRadiusDemo = ({ component, variants }: { component: string; variants: { name: string; tokenPath: Token }[] }) => (
  <VStack gap="3" alignItems="flex-start">
    <span className={css({ fontSize: "sm", fontWeight: "semibold", textTransform: "capitalize" })}>
      {component}
    </span>
    <HStack gap="4">
      {variants.map(({ name, tokenPath }) => {
        const value = token(tokenPath);
        return (
          <VStack key={name} gap="1" alignItems="center">
            <div
              className={css({
                width: "64px",
                height: "32px",
                bg: "neutral.800",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: "xs",
                fontWeight: "medium",
              })}
              style={{ borderRadius: value }}
            >
              {name}
            </div>
            <span className={valueStyles}>{value}</span>
          </VStack>
        );
      })}
    </HStack>
  </VStack>
);

export const Radii: Story = () => (
  <VStack gap="8" alignItems="flex-start" p="6">
    <h1 className={css({ fontSize: "2xl", fontWeight: "bold" })}>
      Border Radius Tokens
    </h1>
    <p className={css({ fontSize: "sm", color: "neutral.600", maxWidth: "600px" })}>
      Radius scales for different component sizes. SM for small/compact elements, MD for default, LG for larger components.
    </p>

    <VStack gap="8" alignItems="flex-start" width="100%">
      <h2 className={sectionTitleStyles}>Scales</h2>
      {scales.map((scale) => (
        <ScaleRow key={scale} scale={scale} />
      ))}
    </VStack>

    <VStack gap="6" alignItems="flex-start" width="100%">
      <h2 className={sectionTitleStyles}>Component-Specific Radii</h2>
      <ComponentRadiusDemo
        component="button"
        variants={[
          { name: "xs", tokenPath: "radii.component.button.xs" },
          { name: "sm", tokenPath: "radii.component.button.sm" },
          { name: "md", tokenPath: "radii.component.button.md" },
          { name: "lg", tokenPath: "radii.component.button.lg" },
        ]}
      />
    </VStack>
  </VStack>
);

Radii.storyName = "Border Radii";
