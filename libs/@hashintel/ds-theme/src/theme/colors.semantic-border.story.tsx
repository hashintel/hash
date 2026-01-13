import type { Story } from "@ladle/react";
import { css } from "../../styled-system/css";
import { token } from "../../styled-system/tokens";
import { VStack, HStack, Box } from "../../styled-system/jsx";
import type { Token } from "../../styled-system/tokens/tokens";

/**
 * Border color tokens for UI elements.
 *
 * Structure:
 * - neutral.{default,subtle,muted,emphasis,hover,active}: Interactive states
 * - status.{info,success,warning,critical,caution}: Semantic borders
 */

const neutralTokens = {
  muted: "border.neutral.muted",
  subtle: "border.neutral.subtle",
  default: "border.neutral.default",
  emphasis: "border.neutral.emphasis",
  hover: "border.neutral.hover",
  active: "border.neutral.active",
} as const;

const statusTokens = {
  info: "border.status.info",
  success: "border.status.success",
  caution: "border.status.caution",
  warning: "border.status.warning",
  critical: "border.status.critical",
} as const;

const BorderSwatch = ({
  label,
  tokenPath,
}: {
  label: string;
  tokenPath: string;
}) => (
  <VStack gap="1" alignItems="center">
    <Box
      width="[80px]"
      height="[56px]"
      borderRadius="md.3"
      bg="neutral.white"
      display="flex"
      alignItems="center"
      justifyContent="center"
      style={{
        border: `2px solid ${token(`colors.${tokenPath}` as Token)}`,
      }}
    >
      <Box
        width="[32px]"
        height="[24px]"
        borderRadius="md.2"
        style={{
          border: `1px solid ${token(`colors.${tokenPath}` as Token)}`,
        }}
      />
    </Box>
    <span
      className={css({
        fontSize: "xs",
        fontWeight: "medium",
        color: "text.secondary",
      })}
    >
      {label}
    </span>
    <span
      className={css({
        fontSize: "[10px]",
        color: "text.disabled",
      })}
    >
      {tokenPath}
    </span>
  </VStack>
);

const StateDemo = ({
  label,
  tokenPath,
}: {
  label: string;
  tokenPath: string;
}) => (
  <HStack gap="4" alignItems="center" width="[100%]">
    <span
      className={css({
        fontSize: "sm",
        fontWeight: "medium",
        minWidth: "[80px]",
        color: "text.tertiary",
      })}
    >
      {label}
    </span>
    <Box
      px="4"
      py="3"
      borderRadius="md.3"
      bg="neutral.white"
      flex="1"
      maxWidth="[300px]"
      style={{
        border: `1px solid ${token(`colors.${tokenPath}` as Token)}`,
      }}
    >
      <span className={css({ fontSize: "sm", color: "text.secondary" })}>
        Input field example
      </span>
    </Box>
    <span
      className={css({
        fontSize: "xs",
        color: "text.disabled",
      })}
    >
      {tokenPath}
    </span>
  </HStack>
);

export const SemanticBorder: Story = () => (
  <VStack
    gap="8"
    alignItems="flex-start"
    p="6"
    maxWidth="[800px]"
  >
    <h1 className={css({ fontSize: "2xl", fontWeight: "semibold" })}>
      Border Color Tokens
    </h1>

    {/* Neutral states as input-like demos */}
    <VStack gap="2" alignItems="flex-start" width="[100%]">
      <h2
        className={css({
          fontSize: "lg",
          fontWeight: "semibold",
          color: "text.secondary",
        })}
      >
        Neutral (Interactive States)
      </h2>
      <p
        className={css({
          fontSize: "sm",
          color: "text.tertiary",
          mb: "2",
        })}
      >
        Border colors for form inputs and interactive containers
      </p>
      {(
        ["muted", "subtle", "default", "emphasis", "hover", "active"] as const
      ).map((key) => (
        <StateDemo key={key} label={key} tokenPath={neutralTokens[key]} />
      ))}
    </VStack>

    {/* Status borders as colored cards */}
    <VStack gap="2" alignItems="flex-start" width="[100%]">
      <h2
        className={css({
          fontSize: "lg",
          fontWeight: "semibold",
          color: "text.secondary",
        })}
      >
        Status
      </h2>
      <p
        className={css({
          fontSize: "sm",
          color: "text.tertiary",
          mb: "2",
        })}
      >
        Semantic border colors for alerts and status indicators
      </p>
      <HStack gap="4" flexWrap="wrap">
        {(["info", "success", "caution", "warning", "critical"] as const).map(
          (key) => (
            <BorderSwatch key={key} label={key} tokenPath={statusTokens[key]} />
          ),
        )}
      </HStack>
    </VStack>
  </VStack>
);

SemanticBorder.storyName = "Semantic: Border";
