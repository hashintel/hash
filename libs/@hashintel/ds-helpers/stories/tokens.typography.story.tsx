import type { Story } from "@ladle/react";
import { css } from "../styled-system/css";
import { token } from "../styled-system/tokens";
import { VStack, HStack } from "../styled-system/jsx";
import type { Token } from "../styled-system/tokens/tokens";
import type { TextStyle, Leading, FontWeightToken } from "./_types";

const textStyles: readonly TextStyle[] = [
  "xs",
  "sm",
  "base",
  "lg",
  "xl",
  "2xl",
  "3xl",
  "4xl",
];
const leadingValues: readonly Leading[] = ["tight", "normal", "loose"];
const fontWeightEntries: readonly { name: FontWeightToken; value: number }[] = [
  { name: "normal", value: 400 },
  { name: "medium", value: 500 },
  { name: "semibold", value: 600 },
];

const labelStyles = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "fg.subtle",
  minWidth: "[60px]",
});

const valueStyles = css({
  fontSize: "xs",
  color: "fg.subtle",
  minWidth: "[50px]",
});

const sectionTitleStyles = css({
  fontSize: "lg",
  fontWeight: "semibold",
  borderBottom: "[1px_solid]",
  borderColor: "bd.subtle",
  pb: "2",
  mb: "4",
  width: "[100%]",
});

const multiLineText =
  "The quick brown fox jumps over the lazy dog. This sentence continues so that the text wraps across multiple lines, making differences in line height clearly visible.";

type TextStyleName = TextStyle;
type LeadingName = Leading;

const TextStyleDemo = ({ style }: { style: TextStyleName }) => (
  <HStack gap="4" alignItems="baseline">
    <span className={labelStyles}>{style}</span>
    <span className={css({ textStyle: style })}>
      The quick brown fox jumps over the lazy dog
    </span>
  </HStack>
);

const LeadingComparisonRow = ({ style }: { style: TextStyleName }) => (
  <VStack gap="2" alignItems="flex-start" width="[100%]">
    <span
      className={css({
        fontSize: "sm",
        fontWeight: "semibold",
        color: "fg.default",
      })}
    >
      textStyle: {style}
    </span>
    <HStack gap="6" alignItems="flex-start" width="[100%]">
      {leadingValues.map((leading) => (
        <VStack
          key={leading}
          gap="1"
          alignItems="flex-start"
          flex="1"
          minWidth="0"
        >
          <span className={valueStyles}>leading: {leading}</span>
          <div
            className={css({
              textStyle: style,
              leading,
              maxWidth: "[100%]",
            })}
          >
            {multiLineText}
          </div>
        </VStack>
      ))}
    </HStack>
  </VStack>
);

const FontFamilyDemo = ({
  name,
  tokenPath,
}: { name: string; tokenPath: Token }) => (
  <HStack gap="4" alignItems="baseline">
    <span className={labelStyles}>{name}</span>
    <span
      className={css({ fontSize: "xl" })}
      style={{ fontFamily: token(tokenPath) }}
    >
      The quick brown fox jumps over the lazy dog
    </span>
  </HStack>
);

const FontWeightDemo = ({ name, value }: { name: string; value: number }) => (
  <HStack gap="4" alignItems="baseline">
    <span className={labelStyles}>{name}</span>
    <span className={valueStyles}>{value}</span>
    <span className={css({ fontSize: "lg" })} style={{ fontWeight: value }}>
      The quick brown fox jumps over the lazy dog
    </span>
  </HStack>
);

export const Typography: Story = () => (
  <VStack gap="8" alignItems="flex-start" p="6">
    <h1 className={css({ fontSize: "2xl", fontWeight: "semibold" })}>
      Typography
    </h1>

    <VStack gap="4" alignItems="flex-start" width="[100%]">
      <h2 className={sectionTitleStyles}>Text Styles</h2>
      {textStyles.map((style) => (
        <TextStyleDemo key={style} style={style} />
      ))}
    </VStack>

    <VStack gap="6" alignItems="flex-start" width="[100%]">
      <h2 className={sectionTitleStyles}>Leading Variants</h2>
      <p
        className={css({
          fontSize: "xs",
          color: "fg.subtle",
          mb: "2",
        })}
      >
        Each text style shown at tight (1), normal (1.5), and loose (1.75)
        leading
      </p>
      {textStyles.map((style) => (
        <LeadingComparisonRow key={style} style={style} />
      ))}
    </VStack>

    <VStack gap="4" alignItems="flex-start" width="[100%]">
      <h2 className={sectionTitleStyles}>Font Families</h2>
      <FontFamilyDemo name="display" tokenPath="fonts.display" />
      <FontFamilyDemo name="body" tokenPath="fonts.body" />
      <FontFamilyDemo name="mono" tokenPath="fonts.mono" />
    </VStack>

    <VStack gap="4" alignItems="flex-start" width="[100%]">
      <h2 className={sectionTitleStyles}>Font Weights</h2>
      {fontWeightEntries.map(({ name, value }) => (
        <FontWeightDemo key={name} name={name} value={value} />
      ))}
    </VStack>
  </VStack>
);

Typography.storyName = "Typography";
