import type { Story } from "@ladle/react";
import { css } from "../styled-system/css";
import { token } from "../styled-system/tokens";
import { VStack, HStack, Box } from "../styled-system/jsx";
import type { Token } from "../styled-system/tokens/tokens";

/**
 * Border color tokens.
 *
 * Structure (from createSemanticSet):
 * - bd.solid: Strong visible borders (step 70, hover → 80)
 * - bd.subtle: Light borders (step 60, hover → 70)
 * - bd.muted: Very subtle alpha borders (step a60, hover → a70)
 *
 * Each has: DEFAULT, hover, active, disabled variants
 */

type BdCategory = "solid" | "subtle" | "muted";
type StateKey = "DEFAULT" | "hover" | "active" | "disabled";

const bdCategories: { key: BdCategory; label: string; desc: string }[] = [
  {
    key: "solid",
    label: "Solid",
    desc: "Strong borders, focused inputs (step 70)",
  },
  { key: "subtle", label: "Subtle", desc: "Light borders, cards (step 60)" },
  { key: "muted", label: "Muted", desc: "Very subtle alpha borders (step a60)" },
];

const states: StateKey[] = ["DEFAULT", "hover", "active", "disabled"];

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
      bg="canvas"
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
        color: "fg.muted",
      })}
    >
      {label}
    </span>
    <span
      className={css({
        fontSize: "[10px]",
        color: "fg.subtle",
      })}
    >
      {tokenPath}
    </span>
  </VStack>
);

const CategoryRow = ({
  category,
  description,
}: {
  category: BdCategory;
  description: string;
}) => (
  <VStack gap="3" alignItems="flex-start">
    <HStack gap="2" alignItems="baseline">
      <span
        className={css({
          fontSize: "sm",
          fontWeight: "semibold",
          color: "fg.muted",
        })}
      >
        bd.{category}
      </span>
      <span className={css({ fontSize: "xs", color: "fg.subtle" })}>
        — {description}
      </span>
    </HStack>
    <HStack gap="4" flexWrap="wrap">
      {states.map((state) => {
        const tokenPath =
          state === "DEFAULT" ? `bd.${category}` : `bd.${category}.${state}`;
        return (
          <BorderSwatch
            key={state}
            label={state === "DEFAULT" ? "default" : state}
            tokenPath={tokenPath}
          />
        );
      })}
    </HStack>
  </VStack>
);

const InputDemo = ({
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
        color: "fg.subtle",
      })}
    >
      {label}
    </span>
    <Box
      px="4"
      py="3"
      borderRadius="md.3"
      bg="canvas"
      flex="1"
      maxWidth="[300px]"
      style={{
        border: `1px solid ${token(`colors.${tokenPath}` as Token)}`,
      }}
    >
      <span className={css({ fontSize: "sm", color: "fg.muted" })}>
        Input field example
      </span>
    </Box>
    <span className={css({ fontSize: "xs", color: "fg.subtle" })}>
      {tokenPath}
    </span>
  </HStack>
);

export const SemanticBorder: Story = () => (
  <VStack gap="8" alignItems="flex-start" p="6" maxWidth="[900px]">
    <VStack gap="2" alignItems="flex-start">
      <h1 className={css({ fontSize: "2xl", fontWeight: "semibold" })}>
        Border Color Tokens (bd.*)
      </h1>
      <p
        className={css({
          fontSize: "sm",
          color: "fg.muted",
          maxWidth: "[700px]",
        })}
      >
        Border colors derived from the neutral palette via{" "}
        <code
          className={css({ bg: "bg.muted", px: "1", borderRadius: "md.1" })}
        >
          createSemanticSet()
        </code>
        . These are global defaults; per-palette variants are available via{" "}
        <code
          className={css({ bg: "bg.muted", px: "1", borderRadius: "md.1" })}
        >
          colorPalette.bd.*
        </code>
        .
      </p>
    </VStack>

    <VStack gap="6" alignItems="flex-start">
      {bdCategories.map(({ key, desc }) => (
        <CategoryRow key={key} category={key} description={desc} />
      ))}
    </VStack>

    <VStack gap="3" alignItems="flex-start" width="[100%]">
      <h2 className={css({ fontSize: "lg", fontWeight: "semibold" })}>
        Input Field Example
      </h2>
      <p className={css({ fontSize: "sm", color: "fg.muted", mb: "2" })}>
        Common usage: form inputs with different border intensities
      </p>
      <InputDemo label="Default" tokenPath="bd.subtle" />
      <InputDemo label="Hover" tokenPath="bd.subtle.hover" />
      <InputDemo label="Focus" tokenPath="bd.solid" />
    </VStack>
  </VStack>
);

SemanticBorder.storyName = "Border (bd)";
