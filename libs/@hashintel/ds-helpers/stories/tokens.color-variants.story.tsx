import type { Story } from "@ladle/react";
import { css } from "../styled-system/css";
import { token } from "../styled-system/tokens";
import { VStack, HStack, Box, Grid } from "../styled-system/jsx";
import type { Token } from "../styled-system/tokens/tokens";
import type { PaletteName } from "./_types";

const COLOR_PALETTES: readonly PaletteName[] = [
  "neutral",
  "blue",
  "red",
  "orange",
  "yellow",
  "green",
  "purple",
  "pink",
];

type BgCategory = "min" | "surface" | "subtle" | "shaded" | "solid";
type BdCategory = "subtle" | "solid" | "strong";
type StateKey = "DEFAULT" | "hover" | "active" | "disabled";

const states: StateKey[] = ["DEFAULT", "hover", "active", "disabled"];

const bgCategories: {
  key: BgCategory;
  desc: string;
  useDarkText: boolean;
}[] = [
  { key: "min", desc: "alpha, lightest", useDarkText: true },
  { key: "surface", desc: "alpha, surface", useDarkText: true },
  { key: "subtle", desc: "alpha, medium", useDarkText: true },
  { key: "shaded", desc: "alpha, shaded", useDarkText: true },
  { key: "solid", desc: "opaque accent", useDarkText: false },
];

const bgSolidCategories: {
  key: Exclude<BgCategory, "solid">;
  desc: string;
}[] = [
  { key: "min", desc: "lightest" },
  { key: "surface", desc: "surface" },
  { key: "subtle", desc: "subtle" },
  { key: "shaded", desc: "shaded" },
];

const bdCategories: { key: BdCategory; desc: string }[] = [
  { key: "subtle", desc: "alpha-based" },
  { key: "solid", desc: "alpha-based" },
  { key: "strong", desc: "strong" },
];

const fgTokens = [
  { key: "fg.max", label: "max" },
  { key: "fg.heading", label: "heading" },
  { key: "fg.body", label: "body" },
  { key: "fg.body.hover", label: "body.hover" },
  { key: "fg.muted", label: "muted" },
  { key: "fg.muted.hover", label: "muted.hover" },
  { key: "fg.subtle", label: "subtle" },
  { key: "fg.subtle.hover", label: "subtle.hover" },
  { key: "fg.link", label: "link" },
  { key: "fg.link.hover", label: "link.hover" },
  { key: "fg.onSolid", label: "onSolid (fg.onSolid)" },
] as const;

const sectionTitle = css({
  textStyle: "sm",
  fontWeight: "semibold",
  color: "colorPalette.fg.body",
  mb: "2",
});

const categoryLabel = css({
  textStyle: "xs",
  fontWeight: "medium",
  color: "colorPalette.fg.muted",
  mb: "1",
});

const BgSwatch = ({
  label,
  tokenPath,
  useDarkText,
}: {
  label: string;
  tokenPath: string;
  useDarkText: boolean;
}) => {
  const textColor = useDarkText
    ? "colorPalette.fg.heading"
    : "colorPalette.fg.onSolid";
  return (
    <Box
      px="3"
      py="2"
      borderRadius="sm"
      minWidth="[70px]"
      boxShadow="[inset_0_0_0_1px_rgba(0,0,0,0.06)]"
      style={{ backgroundColor: token(`colors.${tokenPath}` as Token) }}
    >
      <span
        className={css({ textStyle: "xs", fontWeight: "medium" })}
        style={{ color: token(`colors.${textColor}` as Token) }}
      >
        {label}
      </span>
    </Box>
  );
};

const BgColumn = () => (
  <VStack gap="3" alignItems="flex-start">
    <span className={sectionTitle}>bg.*</span>
    {bgCategories.map(({ key, desc, useDarkText }) => (
      <VStack key={key} gap="1" alignItems="flex-start">
        <span className={categoryLabel}>
          bg.{key} — {desc}
        </span>
        <HStack gap="1" flexWrap="wrap">
          {states.map((state) => {
            const tokenPath =
              state === "DEFAULT"
                ? `colorPalette.bg.${key}`
                : `colorPalette.bg.${key}.${state}`;
            return (
              <BgSwatch
                key={state}
                label={state === "DEFAULT" ? "def" : state}
                tokenPath={tokenPath}
                useDarkText={useDarkText}
              />
            );
          })}
        </HStack>
      </VStack>
    ))}
  </VStack>
);

const BgSolidColumn = () => (
  <VStack gap="3" alignItems="flex-start">
    <span className={sectionTitle}>bgSolid.* (opaque surfaces)</span>
    {bgSolidCategories.map(({ key, desc }) => (
      <VStack key={key} gap="1" alignItems="flex-start">
        <span className={categoryLabel}>
          bgSolid.{key} — {desc}
        </span>
        <HStack gap="1" flexWrap="wrap">
          {states.map((state) => {
            const tokenPath =
              state === "DEFAULT"
                ? `colorPalette.bgSolid.${key}`
                : `colorPalette.bgSolid.${key}.${state}`;
            return (
              <BgSwatch
                key={state}
                label={state === "DEFAULT" ? "def" : state}
                tokenPath={tokenPath}
                useDarkText
              />
            );
          })}
        </HStack>
      </VStack>
    ))}
    <VStack gap="1" alignItems="flex-start">
      <span className={categoryLabel}>bgSolid.solid — opaque accent</span>
      <HStack gap="1" flexWrap="wrap">
        {states.map((state) => {
          const tokenPath =
            state === "DEFAULT"
              ? `colorPalette.bgSolid.solid`
              : `colorPalette.bgSolid.solid.${state}`;
          return (
            <BgSwatch
              key={state}
              label={state === "DEFAULT" ? "def" : state}
              tokenPath={tokenPath}
              useDarkText={false}
            />
          );
        })}
      </HStack>
    </VStack>
  </VStack>
);

const FgColumn = () => (
  <VStack gap="3" alignItems="flex-start">
    <span className={sectionTitle}>fg.*</span>
    <VStack gap="1" alignItems="flex-start" width="[100%]">
      {fgTokens.map(({ key, label }) => {
        const isSolid = key === "fg.onSolid";
        return (
          <HStack key={key} gap="2" alignItems="center" width="[100%]">
            <span
              className={css({
                textStyle: "xs",
                fontWeight: "medium",
                minWidth: "[80px]",
                color: "colorPalette.fg.muted",
              })}
            >
              {label}
            </span>
            <Box
              px="3"
              py="1.5"
              borderRadius="sm"
              flex="1"
              bg={isSolid ? "colorPalette.bg.solid" : undefined}
              boxShadow={
                isSolid ? undefined : "[inset_0_0_0_1px_rgba(0,0,0,0.06)]"
              }
            >
              <span
                className={css({ textStyle: "xs" })}
                style={{
                  color: token(`colors.colorPalette.${key}` as Token),
                }}
              >
                Sample text
              </span>
            </Box>
          </HStack>
        );
      })}
    </VStack>
  </VStack>
);

const BorderSwatch = ({
  label,
  tokenPath,
}: {
  label: string;
  tokenPath: string;
}) => (
  <VStack gap="0.5" alignItems="center">
    <Box
      width="[56px]"
      height="[42px]"
      borderRadius="sm"
      display="flex"
      alignItems="center"
      justifyContent="center"
      style={{
        border: `2px solid ${token(`colors.${tokenPath}` as Token)}`,
      }}
    />
    <span
      className={css({
        fontSize: "[10px]",
        fontWeight: "medium",
        color: "colorPalette.fg.muted",
      })}
    >
      {label}
    </span>
  </VStack>
);

const FocusRingDemo = () => (
  <VStack gap="3" alignItems="flex-start">
    <span className={sectionTitle}>focusRing</span>
    <HStack gap="3" flexWrap="wrap">
      {(["outside", "inside", "mixed"] as const).map((variant) => (
        <button
          key={variant}
          type="button"
          className={css({
            textStyle: "xs",
            fontWeight: "medium",
            px: "4",
            py: "2",
            borderRadius: "md",
            border: "[1px solid]",
            borderColor: "colorPalette.bd.solid",
            bg: "colorPalette.bg.surface",
            color: "colorPalette.fg.body",
            cursor: "pointer",
            focusVisibleRing: variant,
            focusRingColor: "colorPalette.bd.solid",
          })}
        >
          {variant}
        </button>
      ))}
    </HStack>
    <span
      className={css({
        textStyle: "xs",
        color: "colorPalette.fg.muted",
      })}
    >
      Tab to see focus rings
    </span>
  </VStack>
);

const BdColumn = () => (
  <VStack gap="3" alignItems="flex-start">
    <span className={sectionTitle}>bd.*</span>
    {bdCategories.map(({ key, desc }) => (
      <VStack key={key} gap="1" alignItems="flex-start">
        <span className={categoryLabel}>
          bd.{key} — {desc}
        </span>
        <HStack gap="1" flexWrap="wrap">
          {states.map((state) => {
            const tokenPath =
              state === "DEFAULT"
                ? `colorPalette.bd.${key}`
                : `colorPalette.bd.${key}.${state}`;
            return (
              <BorderSwatch
                key={state}
                label={state === "DEFAULT" ? "def" : state}
                tokenPath={tokenPath}
              />
            );
          })}
        </HStack>
      </VStack>
    ))}
  </VStack>
);

const PaletteSection = ({ palette }: { palette: string }) => (
  <Box colorPalette={palette as "blue"}>
    <h2
      className={css({
        textStyle: "lg",
        fontWeight: "semibold",
        mb: "4",
        textTransform: "capitalize",
      })}
    >
      {palette}
    </h2>
    <Grid columns={2} gap="6">
      <BgColumn />
      <BgSolidColumn />
      <FgColumn />
      <VStack gap="6" alignItems="flex-start">
        <BdColumn />
        <FocusRingDemo />
      </VStack>
    </Grid>
  </Box>
);

export const ColorVariants: Story = () => (
  <VStack gap="6" alignItems="flex-start" p="6">
    <VStack gap="1" alignItems="flex-start">
      <h1 className={css({ textStyle: "2xl", fontWeight: "semibold" })}>
        Color Variants
      </h1>
      <p
        className={css({
          textStyle: "sm",
          color: "fg.body",
          maxWidth: "[700px]",
        })}
      >
        Semantic{" "}
        <code className={css({ fontFamily: "mono", textStyle: "xs" })}>
          bg.*
        </code>
        ,{" "}
        <code className={css({ fontFamily: "mono", textStyle: "xs" })}>
          bgSolid.*
        </code>
        ,{" "}
        <code className={css({ fontFamily: "mono", textStyle: "xs" })}>
          fg.*
        </code>
        , and{" "}
        <code className={css({ fontFamily: "mono", textStyle: "xs" })}>
          bd.*
        </code>{" "}
        tokens under each{" "}
        <code className={css({ fontFamily: "mono", textStyle: "xs" })}>
          colorPalette
        </code>
        .
      </p>
    </VStack>

    <Grid columns={2} gap="10" width="[100%]">
      {COLOR_PALETTES.map((palette) => (
        <PaletteSection key={palette} palette={palette} />
      ))}
    </Grid>
  </VStack>
);

ColorVariants.storyName = "Color Variants";
