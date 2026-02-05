import type { Story } from "@ladle/react";
import { css } from "../styled-system/css";
import { token } from "../styled-system/tokens";
import { VStack, HStack, Box } from "../styled-system/jsx";
import type { Token } from "../styled-system/tokens/tokens";

/**
 * Background color tokens.
 *
 * Structure (from createSemanticSet):
 * - bg.solid: Prominent solid backgrounds (step 9, hover → 10)
 * - bg.surface: Elevated surfaces with alpha (step a2, hover → a3)
 * - bg.muted: Subtle solid backgrounds (step 3, hover → 4)
 * - bg.subtle: Subtle alpha backgrounds (step a3, hover → a4)
 *
 * Each has: DEFAULT, hover, active, disabled variants
 */

type BgCategory = "solid" | "surface" | "muted" | "subtle";
type StateKey = "DEFAULT" | "hover" | "active" | "disabled";

const bgCategories: {
  key: BgCategory;
  label: string;
  desc: string;
  useDarkText: boolean;
}[] = [
  {
    key: "solid",
    label: "Solid",
    desc: "Prominent buttons, CTAs (step 9)",
    useDarkText: false,
  },
  {
    key: "surface",
    label: "Surface",
    desc: "Elevated cards, overlays (alpha step a2)",
    useDarkText: true,
  },
  {
    key: "muted",
    label: "Muted",
    desc: "Subtle solid fills (step 3)",
    useDarkText: true,
  },
  {
    key: "subtle",
    label: "Subtle",
    desc: "Very light alpha fills (step a3)",
    useDarkText: true,
  },
];

const states: StateKey[] = ["DEFAULT", "hover", "active", "disabled"];

const BgSwatch = ({
  label,
  tokenPath,
  useDarkText,
}: {
  label: string;
  tokenPath: string;
  useDarkText: boolean;
}) => {
  const textColor = useDarkText ? "fg" : "fg.solid";
  return (
    <Box
      px="4"
      py="3"
      borderRadius="md.3"
      minWidth="[100px]"
      boxShadow="[inset_0_0_0_1px_rgba(0,0,0,0.06)]"
      style={{ backgroundColor: token(`colors.${tokenPath}` as Token) }}
    >
      <span
        className={css({ fontSize: "sm", fontWeight: "medium" })}
        style={{ color: token(`colors.${textColor}` as Token) }}
      >
        {label}
      </span>
      <span
        className={css({
          fontSize: "[10px]",
          display: "block",
          mt: "1",
          opacity: "[0.7]",
        })}
        style={{ color: token(`colors.${textColor}` as Token) }}
      >
        {tokenPath}
      </span>
    </Box>
  );
};

const CategoryRow = ({
  category,
  description,
  useDarkText,
}: {
  category: BgCategory;
  description: string;
  useDarkText: boolean;
}) => (
  <VStack gap="2" alignItems="flex-start">
    <HStack gap="2" alignItems="baseline">
      <span
        className={css({
          fontSize: "sm",
          fontWeight: "semibold",
          color: "fg.muted",
        })}
      >
        bg.{category}
      </span>
      <span className={css({ fontSize: "xs", color: "fg.subtle" })}>
        — {description}
      </span>
    </HStack>
    <HStack gap="2" flexWrap="wrap">
      {states.map((state) => {
        const tokenPath =
          state === "DEFAULT" ? `bg.${category}` : `bg.${category}.${state}`;
        return (
          <BgSwatch
            key={state}
            label={state === "DEFAULT" ? "default" : state}
            tokenPath={tokenPath}
            useDarkText={useDarkText}
          />
        );
      })}
    </HStack>
  </VStack>
);

export const SemanticBg: Story = () => (
  <VStack gap="8" alignItems="flex-start" p="6">
    <VStack gap="2" alignItems="flex-start">
      <h1 className={css({ fontSize: "2xl", fontWeight: "semibold" })}>
        Background Color Tokens (bg.*)
      </h1>
      <p
        className={css({
          fontSize: "sm",
          color: "fg.muted",
          maxWidth: "[700px]",
        })}
      >
        Background colors derived from the neutral palette via{" "}
        <code
          className={css({ bg: "bg.muted", px: "1", borderRadius: "md.1" })}
        >
          createSemanticSet()
        </code>
        . These are global defaults; per-palette variants are available via{" "}
        <code
          className={css({ bg: "bg.muted", px: "1", borderRadius: "md.1" })}
        >
          colorPalette.bg.*
        </code>
        .
      </p>
    </VStack>

    <VStack gap="6" alignItems="flex-start">
      {bgCategories.map(({ key, label, desc, useDarkText }) => (
        <CategoryRow
          key={key}
          category={key}
          description={desc}
          useDarkText={useDarkText}
        />
      ))}
    </VStack>
  </VStack>
);

SemanticBg.storyName = "Background (bg)";
