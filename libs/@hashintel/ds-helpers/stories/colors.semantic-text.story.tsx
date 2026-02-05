import type { Story } from "@ladle/react";
import { css } from "../styled-system/css";
import { token } from "../styled-system/tokens";
import { VStack, HStack, Box } from "../styled-system/jsx";
import type { Token } from "../styled-system/tokens/tokens";

/**
 * Foreground (text) color tokens.
 *
 * Structure (from createSemanticSet):
 * - fg: Default text color (step 12)
 * - fg.muted: Secondary text (step 11, with hover → 12)
 * - fg.subtle: Tertiary/disabled text (step 10, with hover → 11)
 * - fg.link: Link text (step 11, with hover → 12)
 * - fg.solid: Text on solid backgrounds (white)
 */

const fgTokens = [
  { key: "fg", label: "Default", desc: "Primary text (step 12)" },
  { key: "fg.muted", label: "Muted", desc: "Secondary text (step 11)" },
  {
    key: "fg.muted.hover",
    label: "Muted Hover",
    desc: "Hovered secondary (step 12)",
  },
  { key: "fg.subtle", label: "Subtle", desc: "Tertiary text (step 10)" },
  {
    key: "fg.subtle.hover",
    label: "Subtle Hover",
    desc: "Hovered tertiary (step 11)",
  },
  { key: "fg.link", label: "Link", desc: "Interactive links (step 11)" },
  {
    key: "fg.link.hover",
    label: "Link Hover",
    desc: "Hovered links (step 12)",
  },
] as const;

const sampleText = "The quick brown fox jumps over the lazy dog.";

const TextSample = ({
  label,
  tokenPath,
  description,
  bgColor = "canvas",
}: {
  label: string;
  tokenPath: string;
  description: string;
  bgColor?: string;
}) => (
  <HStack gap="4" alignItems="center" width="[100%]">
    <span
      className={css({
        fontSize: "sm",
        fontWeight: "medium",
        minWidth: "[120px]",
        color: "fg.subtle",
      })}
    >
      {label}
    </span>
    <Box
      bg={bgColor as "canvas"}
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
          color: "fg.subtle",
          mt: "1",
          display: "block",
        })}
      >
        {tokenPath} — {description}
      </span>
    </Box>
  </HStack>
);

export const SemanticText: Story = () => (
  <VStack gap="8" alignItems="flex-start" p="6" maxWidth="[900px]">
    <VStack gap="2" alignItems="flex-start">
      <h1 className={css({ fontSize: "2xl", fontWeight: "semibold" })}>
        Foreground Color Tokens (fg.*)
      </h1>
      <p
        className={css({
          fontSize: "sm",
          color: "fg.muted",
          maxWidth: "[700px]",
        })}
      >
        Text colors derived from the neutral palette via{" "}
        <code
          className={css({ bg: "bg.muted", px: "1", borderRadius: "md.1" })}
        >
          createSemanticSet()
        </code>
        . These are global defaults; per-palette variants are available via{" "}
        <code
          className={css({ bg: "bg.muted", px: "1", borderRadius: "md.1" })}
        >
          colorPalette.fg.*
        </code>
        .
      </p>
    </VStack>

    <VStack gap="3" alignItems="flex-start" width="[100%]">
      <h2 className={css({ fontSize: "lg", fontWeight: "semibold" })}>
        Hierarchy & States
      </h2>
      {fgTokens.map(({ key, label, desc }) => (
        <TextSample
          key={key}
          label={label}
          tokenPath={key}
          description={desc}
        />
      ))}
    </VStack>

    <VStack gap="3" alignItems="flex-start" width="[100%]">
      <h2 className={css({ fontSize: "lg", fontWeight: "semibold" })}>
        Solid Background Text
      </h2>
      <HStack gap="4" alignItems="center" width="[100%]">
        <span
          className={css({
            fontSize: "sm",
            fontWeight: "medium",
            minWidth: "[120px]",
            color: "fg.subtle",
          })}
        >
          fg.solid
        </span>
        <Box bg="bg.solid" px="4" py="3" borderRadius="md.3" flex="1">
          <p
            className={css({ fontSize: "base" })}
            style={{ color: token("colors.fg.solid" as Token) }}
          >
            {sampleText}
          </p>
          <span
            className={css({
              fontSize: "xs",
              opacity: "[0.7]",
              mt: "1",
              display: "block",
            })}
            style={{ color: token("colors.fg.solid" as Token) }}
          >
            fg.solid — White text for solid backgrounds
          </span>
        </Box>
      </HStack>
    </VStack>
  </VStack>
);

SemanticText.storyName = "Foreground (fg)";
