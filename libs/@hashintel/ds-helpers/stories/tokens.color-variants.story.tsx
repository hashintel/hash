import type { Story } from "@ladle/react";
import { css } from "../styled-system/css";
import { token } from "../styled-system/tokens";
import { VStack, HStack, Box, Grid } from "../styled-system/jsx";
import type { Token } from "../styled-system/tokens/tokens";

const COLOR_PALETTES = [
  "neutral",
  "blue",
  "red",
  "orange",
  "yellow",
  "green",
  "purple",
  "pink",
] as const;

type BgCategory = "solid" | "surface" | "muted" | "subtle";
type BdCategory = "solid" | "subtle" | "muted";
type StateKey = "DEFAULT" | "hover" | "active" | "disabled";

const states: StateKey[] = ["DEFAULT", "hover", "active", "disabled"];

const bgCategories: {
  key: BgCategory;
  desc: string;
  useDarkText: boolean;
}[] = [
  { key: "solid", desc: "step 90", useDarkText: false },
  { key: "surface", desc: "alpha a20", useDarkText: true },
  { key: "muted", desc: "step 30", useDarkText: true },
  { key: "subtle", desc: "alpha a30", useDarkText: true },
];

const bdCategories: { key: BdCategory; desc: string }[] = [
  { key: "solid", desc: "step 70" },
  { key: "subtle", desc: "step 60" },
  { key: "muted", desc: "alpha a60" },
];

const fgTokens = [
  { key: "fg", label: "default" },
  { key: "fg.muted", label: "muted" },
  { key: "fg.muted.hover", label: "muted.hover" },
  { key: "fg.subtle", label: "subtle" },
  { key: "fg.subtle.hover", label: "subtle.hover" },
  { key: "fg.link", label: "link" },
  { key: "fg.link.hover", label: "link.hover" },
  { key: "fg.solid", label: "solid" },
] as const;

const sectionTitle = css({
  fontSize: "sm",
  fontWeight: "semibold",
  color: "colorPalette.fg.muted",
  mb: "2",
});

const categoryLabel = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "colorPalette.fg.subtle",
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
  const textColor = useDarkText ? "colorPalette.fg" : "colorPalette.fg.solid";
  return (
    <Box
      px="3"
      py="2"
      borderRadius="md.2"
      minWidth="[70px]"
      boxShadow="[inset_0_0_0_1px_rgba(0,0,0,0.06)]"
      style={{ backgroundColor: token(`colors.${tokenPath}` as Token) }}
    >
      <span
        className={css({ fontSize: "xs", fontWeight: "medium" })}
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

const FgColumn = () => (
  <VStack gap="3" alignItems="flex-start">
    <span className={sectionTitle}>fg.*</span>
    <VStack gap="1" alignItems="flex-start" width="[100%]">
      {fgTokens.map(({ key, label }) => {
        const isSolid = key === "fg.solid";
        return (
          <HStack key={key} gap="2" alignItems="center" width="[100%]">
            <span
              className={css({
                fontSize: "xs",
                fontWeight: "medium",
                minWidth: "[80px]",
                color: "colorPalette.fg.subtle",
              })}
            >
              {label}
            </span>
            <Box
              px="3"
              py="1.5"
              borderRadius="md.2"
              flex="1"
              bg={isSolid ? "colorPalette.bg.solid" : undefined}
              boxShadow={
                isSolid ? undefined : "[inset_0_0_0_1px_rgba(0,0,0,0.06)]"
              }
            >
              <span
                className={css({ fontSize: "xs" })}
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
      borderRadius="md.2"
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
        color: "colorPalette.fg.subtle",
      })}
    >
      {label}
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
        fontSize: "lg",
        fontWeight: "semibold",
        mb: "4",
        textTransform: "capitalize",
      })}
    >
      {palette}
    </h2>
    <Grid columns={3} gap="6">
      <BgColumn />
      <FgColumn />
      <BdColumn />
    </Grid>
  </Box>
);

export const ColorVariants: Story = () => (
  <VStack gap="6" alignItems="flex-start" p="6">
    <VStack gap="1" alignItems="flex-start">
      <h1 className={css({ fontSize: "2xl", fontWeight: "semibold" })}>
        Color Variants
      </h1>
      <p className={css({ fontSize: "sm", color: "fg.muted", maxWidth: "[700px]" })}>
        Semantic <code className={css({ fontFamily: "mono", fontSize: "xs" })}>bg.*</code>,{" "}
        <code className={css({ fontFamily: "mono", fontSize: "xs" })}>fg.*</code>, and{" "}
        <code className={css({ fontFamily: "mono", fontSize: "xs" })}>bd.*</code> tokens
        under each <code className={css({ fontFamily: "mono", fontSize: "xs" })}>colorPalette</code>.
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
