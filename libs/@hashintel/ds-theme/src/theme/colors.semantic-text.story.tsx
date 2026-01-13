import type { Story } from "@ladle/react";
import { css } from "../../styled-system/css";
import { token } from "../../styled-system/tokens";
import { VStack, HStack, Box } from "../../styled-system/jsx";
import type { Token, ColorToken } from "../../styled-system/tokens/tokens";

/**
 * Text color tokens for typography across the design system.
 *
 * Structure:
 * - primary, secondary, tertiary, disabled: Hierarchy levels
 * - inverted: For use on dark backgrounds
 * - link, linkHover: Interactive text
 * - status.{info,success,warning,critical}: Semantic messaging
 */

const textTokens = {
  primary: "text.primary",
  secondary: "text.secondary",
  tertiary: "text.tertiary",
  disabled: "text.disabled",
  inverted: "text.inverted",
  link: "text.link",
  linkHover: "text.linkHover",
} as const;

const statusTokens = {
  info: "text.status.info",
  success: "text.status.success",
  warning: "text.status.warning",
  critical: "text.status.critical",
} as const;

const sampleText = "The quick brown fox jumps over the lazy dog.";

const TextSample = ({
  label,
  tokenPath,
  bgColor = "neutral.white",
}: {
  label: string;
  tokenPath: string;
  bgColor?: ColorToken;
}) => (
  <HStack gap="4" alignItems="center" width="[100%]">
    <span
      className={css({
        fontSize: "sm",
        fontWeight: "medium",
        minWidth: "[120px]",
        color: "text.tertiary",
      })}
    >
      {label}
    </span>
    <Box
      bg={bgColor}
      px="4"
      py="3"
      borderRadius="md.3"
      flex="1"
      boxShadow="[inset_0_0_0_1px_rgba(0,0,0,0.08)]"
    >
      <p
        className={css({ fontSize: "base" })}
        style={{ color: token(`colors.${tokenPath}` as Token) }}
      >
        {sampleText}
      </p>
      <span
        className={css({
          fontSize: "xs",
          color: "text.disabled",
          mt: "1",
          display: "block",
        })}
      >
        {tokenPath}
      </span>
    </Box>
  </HStack>
);

export const SemanticText: Story = () => (
  <VStack gap="8" alignItems="flex-start" p="6" maxWidth="[800px]">
    <h1 className={css({ fontSize: "2xl", fontWeight: "semibold" })}>
      Text Color Tokens
    </h1>

    {/* Hierarchy */}
    <VStack gap="2" alignItems="flex-start" width="[100%]">
      <h2
        className={css({
          fontSize: "lg",
          fontWeight: "semibold",
          color: "text.secondary",
        })}
      >
        Hierarchy
      </h2>
      {(["primary", "secondary", "tertiary", "disabled"] as const).map(
        (key) => (
          <TextSample key={key} label={key} tokenPath={textTokens[key]} />
        ),
      )}
    </VStack>

    {/* Inverted (on dark background) */}
    <VStack gap="2" alignItems="flex-start" width="[100%]">
      <h2
        className={css({
          fontSize: "lg",
          fontWeight: "semibold",
          color: "text.secondary",
        })}
      >
        Inverted
      </h2>
      <TextSample
        label="inverted"
        tokenPath={textTokens.inverted}
        bgColor="gray.80"
      />
    </VStack>

    {/* Links */}
    <VStack gap="2" alignItems="flex-start" width="[100%]">
      <h2
        className={css({
          fontSize: "lg",
          fontWeight: "semibold",
          color: "text.secondary",
        })}
      >
        Links
      </h2>
      <TextSample label="link" tokenPath={textTokens.link} />
      <TextSample label="linkHover" tokenPath={textTokens.linkHover} />
    </VStack>

    {/* Status */}
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
      {(["info", "success", "warning", "critical"] as const).map((key) => (
        <TextSample
          key={key}
          label={`status.${key}`}
          tokenPath={statusTokens[key]}
        />
      ))}
    </VStack>
  </VStack>
);

SemanticText.storyName = "Semantic: Text";
