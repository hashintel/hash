import type { Story } from "@ladle/react";
import { useState } from "react";
import { css, cva } from "../styled-system/css";
import { token } from "../styled-system/tokens";
import { VStack, HStack, Box } from "../styled-system/jsx";
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

const STATUS_PALETTES = [
  { name: "status.info", label: "Info (blue)" },
  { name: "status.success", label: "Success (green)" },
  { name: "status.warning", label: "Warning (orange)" },
  { name: "status.error", label: "Error (red)" },
] as const;

type BgCategory = "solid" | "surface" | "muted" | "subtle";
type BdCategory = "solid" | "subtle" | "muted";
type StateKey = "DEFAULT" | "hover" | "active" | "disabled";

const states: StateKey[] = ["DEFAULT", "hover", "active", "disabled"];

const bgCategories: {
  key: BgCategory;
  label: string;
  desc: string;
  useDarkText: boolean;
}[] = [
  {
    key: "solid",
    label: "Solid",
    desc: "Prominent buttons, CTAs (step 90)",
    useDarkText: false,
  },
  {
    key: "surface",
    label: "Surface",
    desc: "Elevated cards, overlays (alpha step a20)",
    useDarkText: true,
  },
  {
    key: "muted",
    label: "Muted",
    desc: "Subtle solid fills (step 30)",
    useDarkText: true,
  },
  {
    key: "subtle",
    label: "Subtle",
    desc: "Very light alpha fills (step a30)",
    useDarkText: true,
  },
];

const bdCategories: { key: BdCategory; label: string; desc: string }[] = [
  {
    key: "solid",
    label: "Solid",
    desc: "Strong borders, focused inputs (step 70)",
  },
  { key: "subtle", label: "Subtle", desc: "Light borders, cards (step 60)" },
  {
    key: "muted",
    label: "Muted",
    desc: "Very subtle alpha borders (step a60)",
  },
];

const fgTokens = [
  { key: "fg", label: "Default", desc: "Primary text (step 120)" },
  { key: "fg.muted", label: "Muted", desc: "Secondary text (step 110)" },
  {
    key: "fg.muted.hover",
    label: "Muted Hover",
    desc: "Hovered secondary (step 120)",
  },
  { key: "fg.subtle", label: "Subtle", desc: "Tertiary text (step 100)" },
  {
    key: "fg.subtle.hover",
    label: "Subtle Hover",
    desc: "Hovered tertiary (step 110)",
  },
  { key: "fg.link", label: "Link", desc: "Interactive links (step 110)" },
  {
    key: "fg.link.hover",
    label: "Link Hover",
    desc: "Hovered links (step 120)",
  },
] as const;

const sampleText = "The quick brown fox jumps over the lazy dog.";

const sectionHeading = css({ fontSize: "lg", fontWeight: "semibold" });
const codeStyle = css({ bg: "colorPalette.bg.muted", px: "1", borderRadius: "md.1" });
const labelStyle = css({ fontSize: "sm", fontWeight: "semibold", minWidth: "[100px]" });
const captionStyle = css({ fontSize: "xs", color: "colorPalette.fg.subtle" });
const subtitleStyle = css({ fontSize: "sm", color: "colorPalette.fg.muted" });

const selectStyles = css({
  padding: "2",
  borderRadius: "md.2",
  border: "[1px_solid]",
  borderColor: "colorPalette.bd.solid",
  fontSize: "sm",
  minWidth: "[140px]",
  cursor: "pointer",
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
    ? "colorPalette.fg"
    : "colorPalette.fg.solid";
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

const BgCategoryRow = ({
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
      <span className={css({ fontSize: "sm", fontWeight: "semibold", color: "colorPalette.fg.muted" })}>
        bg.{category}
      </span>
      <span className={captionStyle}>— {description}</span>
    </HStack>
    <HStack gap="2" flexWrap="wrap">
      {states.map((state) => {
        const tokenPath =
          state === "DEFAULT"
            ? `colorPalette.bg.${category}`
            : `colorPalette.bg.${category}.${state}`;
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

const TextSample = ({
  label,
  tokenPath,
  description,
}: {
  label: string;
  tokenPath: string;
  description: string;
}) => (
  <HStack gap="4" alignItems="center" width="[100%]">
    <span
      className={css({
        fontSize: "sm",
        fontWeight: "medium",
        minWidth: "[120px]",
        color: "colorPalette.fg.subtle",
      })}
    >
      {label}
    </span>
    <Box
      px="4"
      py="3"
      borderRadius="md.3"
      flex="1"
      boxShadow="[inset_0_0_0_1px_rgba(0,0,0,0.08)]"
    >
      <p
        className={css({ fontSize: "base" })}
        style={{ color: token(`colors.colorPalette.${tokenPath}` as Token) }}
      >
        {sampleText}
      </p>
      <span
        className={css({
          fontSize: "xs",
          color: "colorPalette.fg.subtle",
          mt: "1",
          display: "block",
        })}
      >
        colorPalette.{tokenPath} — {description}
      </span>
    </Box>
  </HStack>
);

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
    <span className={css({ fontSize: "xs", fontWeight: "medium", color: "colorPalette.fg.muted" })}>
      {label}
    </span>
    <span className={css({ fontSize: "[10px]", color: "colorPalette.fg.subtle" })}>
      {tokenPath}
    </span>
  </VStack>
);

const BdCategoryRow = ({
  category,
  description,
}: {
  category: BdCategory;
  description: string;
}) => (
  <VStack gap="3" alignItems="flex-start">
    <HStack gap="2" alignItems="baseline">
      <span className={css({ fontSize: "sm", fontWeight: "semibold", color: "colorPalette.fg.muted" })}>
        bd.{category}
      </span>
      <span className={captionStyle}>— {description}</span>
    </HStack>
    <HStack gap="4" flexWrap="wrap">
      {states.map((state) => {
        const tokenPath =
          state === "DEFAULT"
            ? `colorPalette.bd.${category}`
            : `colorPalette.bd.${category}.${state}`;
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

const buttonRecipe = cva({
  base: {
    px: "4",
    py: "2",
    borderRadius: "md.2",
    fontWeight: "medium",
    fontSize: "sm",
    cursor: "pointer",
    transition: "[all_0.15s_ease]",
  },
  variants: {
    variant: {
      solid: {
        bg: "colorPalette.bg.solid",
        color: "colorPalette.fg.solid",
        _hover: { bg: "colorPalette.bg.solid.hover" },
        _active: { bg: "colorPalette.bg.solid.active" },
        _disabled: {
          bg: "colorPalette.bg.solid.disabled",
          cursor: "not-allowed",
        },
      },
      surface: {
        bg: "colorPalette.bg.surface",
        color: "colorPalette.fg.muted",
        borderWidth: "[1px]",
        borderStyle: "solid",
        borderColor: "colorPalette.bd.subtle",
        _hover: {
          bg: "colorPalette.bg.surface.hover",
          borderColor: "colorPalette.bd.subtle.hover",
        },
        _active: { bg: "colorPalette.bg.surface.active" },
      },
      subtle: {
        bg: "colorPalette.bg.subtle",
        color: "colorPalette.fg.muted",
        _hover: { bg: "colorPalette.bg.subtle.hover" },
        _active: { bg: "colorPalette.bg.subtle.active" },
      },
      outline: {
        bg: "[transparent]",
        color: "colorPalette.fg.muted",
        borderWidth: "[1px]",
        borderStyle: "solid",
        borderColor: "colorPalette.bd.solid",
        _hover: {
          bg: "colorPalette.bg.surface",
          borderColor: "colorPalette.bd.solid.hover",
        },
        _active: { bg: "colorPalette.bg.surface.active" },
      },
      ghost: {
        bg: "[transparent]",
        color: "colorPalette.fg.link",
        _hover: {
          bg: "colorPalette.bg.subtle",
          color: "colorPalette.fg.link.hover",
        },
        _active: { bg: "colorPalette.bg.subtle.active" },
      },
    },
  },
  defaultVariants: { variant: "solid" },
});

const badgeStyles = css({
  display: "inline-flex",
  alignItems: "center",
  px: "2",
  py: "1",
  borderRadius: "md.1",
  fontSize: "xs",
  fontWeight: "medium",
  bg: "colorPalette.bg.subtle",
  color: "colorPalette.fg.muted",
});

const BgSection = () => (
  <VStack gap="4" alignItems="flex-start">
    <h2 className={sectionHeading}>Background (bg.*)</h2>
    <VStack gap="6" alignItems="flex-start">
      {bgCategories.map(({ key, desc, useDarkText }) => (
        <BgCategoryRow
          key={key}
          category={key}
          description={desc}
          useDarkText={useDarkText}
        />
      ))}
    </VStack>
  </VStack>
);

const FgSection = () => (
  <VStack gap="4" alignItems="flex-start" width="[100%]">
    <h2 className={sectionHeading}>Foreground (fg.*)</h2>
    <VStack gap="3" alignItems="flex-start" width="[100%]">
      {fgTokens.map(({ key, label, desc }) => (
        <TextSample key={key} label={label} tokenPath={key} description={desc} />
      ))}
    </VStack>
    <VStack gap="3" alignItems="flex-start" width="[100%]">
      <h3 className={css({ fontSize: "base", fontWeight: "medium" })}>
        Solid Background Text
      </h3>
      <HStack gap="4" alignItems="center" width="[100%]">
        <span
          className={css({
            fontSize: "sm",
            fontWeight: "medium",
            minWidth: "[120px]",
            color: "colorPalette.fg.subtle",
          })}
        >
          fg.solid
        </span>
        <Box
          bg="colorPalette.bg.solid"
          px="4"
          py="3"
          borderRadius="md.3"
          flex="1"
        >
          <p
            className={css({ fontSize: "base" })}
            style={{ color: token("colors.colorPalette.fg.solid" as Token) }}
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
            style={{ color: token("colors.colorPalette.fg.solid" as Token) }}
          >
            colorPalette.fg.solid — White text for solid backgrounds
          </span>
        </Box>
      </HStack>
    </VStack>
  </VStack>
);

const BdSection = () => (
  <VStack gap="4" alignItems="flex-start">
    <h2 className={sectionHeading}>Border (bd.*)</h2>
    <VStack gap="6" alignItems="flex-start">
      {bdCategories.map(({ key, desc }) => (
        <BdCategoryRow key={key} category={key} description={desc} />
      ))}
    </VStack>
  </VStack>
);

const ComponentDemo = () => (
  <VStack gap="4" alignItems="flex-start">
    <h2 className={sectionHeading}>Component Examples</h2>
    <VStack gap="3" alignItems="flex-start">
      <h3 className={css({ fontSize: "base", fontWeight: "medium" })}>
        Button Variants
      </h3>
      <HStack gap="2">
        <button className={buttonRecipe({ variant: "solid" })}>Solid</button>
        <button className={buttonRecipe({ variant: "surface" })}>Surface</button>
        <button className={buttonRecipe({ variant: "subtle" })}>Subtle</button>
        <button className={buttonRecipe({ variant: "outline" })}>Outline</button>
        <button className={buttonRecipe({ variant: "ghost" })}>Ghost</button>
      </HStack>
    </VStack>
    <VStack gap="3" alignItems="flex-start">
      <h3 className={css({ fontSize: "base", fontWeight: "medium" })}>Badge</h3>
      <span className={badgeStyles}>Label</span>
    </VStack>
  </VStack>
);

export const ColorVariants: Story = () => {
  const [palette, setPalette] = useState<string>("blue");

  return (
    <VStack
      gap="10"
      alignItems="flex-start"
      p="6"
      maxWidth="[900px]"
      colorPalette={palette as "blue"}
    >
      <VStack gap="2" alignItems="flex-start">
        <h1 className={css({ fontSize: "2xl", fontWeight: "semibold" })}>
          Color Variants
        </h1>
        <p className={subtitleStyle}>
          Semantic <code className={codeStyle}>bg.*</code>,{" "}
          <code className={codeStyle}>fg.*</code>, and{" "}
          <code className={codeStyle}>bd.*</code> tokens under the{" "}
          <code className={codeStyle}>colorPalette</code> virtual palette.
          Switch palettes to see how all tokens adapt.
        </p>
        <HStack gap="4" alignItems="center" mt="2">
          <label className={labelStyle}>Color Palette:</label>
          <select
            className={selectStyles}
            value={palette}
            onChange={(e) => setPalette(e.target.value)}
          >
            {COLOR_PALETTES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </HStack>
      </VStack>

      <BgSection />
      <FgSection />
      <BdSection />
      <ComponentDemo />

      <VStack gap="4" alignItems="flex-start">
        <h2 className={sectionHeading}>All Palettes Comparison</h2>
        <VStack gap="3" alignItems="flex-start">
          {COLOR_PALETTES.map((p) => (
            <HStack key={p} gap="4" alignItems="center" colorPalette={p}>
              <span className={labelStyle}>{p}</span>
              <HStack gap="2">
                <button className={buttonRecipe({ variant: "solid" })}>Solid</button>
                <button className={buttonRecipe({ variant: "subtle" })}>Subtle</button>
                <button className={buttonRecipe({ variant: "outline" })}>Outline</button>
              </HStack>
              <span className={badgeStyles}>Badge</span>
            </HStack>
          ))}
        </VStack>
      </VStack>

      <VStack gap="4" alignItems="flex-start">
        <h2 className={sectionHeading}>Status Aliases</h2>
        <p className={subtitleStyle}>
          Semantic status values map to color palettes: status.info → blue, etc.
        </p>
        <VStack gap="3" alignItems="flex-start">
          {STATUS_PALETTES.map(({ name, label }) => (
            <HStack
              key={name}
              gap="4"
              alignItems="center"
              colorPalette={name as "blue"}
            >
              <span className={labelStyle}>{label}</span>
              <HStack gap="2">
                <button className={buttonRecipe({ variant: "solid" })}>Solid</button>
                <button className={buttonRecipe({ variant: "subtle" })}>Subtle</button>
                <button className={buttonRecipe({ variant: "surface" })}>Surface</button>
              </HStack>
              <span className={badgeStyles}>{name}</span>
            </HStack>
          ))}
        </VStack>
      </VStack>
    </VStack>
  );
};

ColorVariants.storyName = "Color Variants";
