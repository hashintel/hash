import type { Story } from "@ladle/react";
import { css } from "../../styled-system/css";
import { token } from "../../styled-system/tokens";
import { VStack, HStack } from "../../styled-system/jsx";
import type { Token } from "../../styled-system/tokens/tokens";

const fontSizeOrder = [
  "xs",
  "sm",
  "base",
  "lg",
  "xl",
  "2xl",
  "3xl",
  "4xl",
] as const;
const fontWeightEntries = [
  { name: "normal", value: 400 },
  { name: "medium", value: 500 },
  { name: "semibold", value: 600 },
] as const;

const labelStyles = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "text.tertiary",
  minWidth: "[60px]",
});

const valueStyles = css({
  fontSize: "xs",
  color: "text.disabled",
  minWidth: "[50px]",
});

const sectionTitleStyles = css({
  fontSize: "lg",
  fontWeight: "semibold",
  borderBottom: "[1px_solid]",
  borderColor: "border.neutral.subtle",
  pb: "default.2",
  mb: "default.4",
  width: "[100%]",
});

const FontFamilyDemo = ({
  name,
  tokenPath,
}: { name: string; tokenPath: Token }) => (
  <HStack gap="default.4" alignItems="baseline">
    <span className={labelStyles}>{name}</span>
    <span
      className={css({ fontSize: "xl" })}
      style={{ fontFamily: token(tokenPath) }}
    >
      The quick brown fox jumps over the lazy dog
    </span>
  </HStack>
);

const FontSizeDemo = ({ size }: { size: string }) => {
  const tokenPath = `fontSizes.${size}` as Token;
  const value = token(tokenPath);

  return (
    <HStack gap="default.4" alignItems="baseline">
      <span className={labelStyles}>{size}</span>
      <span className={valueStyles}>{value}</span>
      <span style={{ fontSize: value }}>The quick brown fox</span>
    </HStack>
  );
};

const FontWeightDemo = ({ name, value }: { name: string; value: number }) => (
  <HStack gap="default.4" alignItems="baseline">
    <span className={labelStyles}>{name}</span>
    <span className={valueStyles}>{value}</span>
    <span className={css({ fontSize: "lg" })} style={{ fontWeight: value }}>
      The quick brown fox jumps over the lazy dog
    </span>
  </HStack>
);

const LineHeightDemo = ({
  category,
  size,
}: { category: string; size: string }) => {
  const tokenPath = `lineHeights.${category}.${size}` as Token;
  const value = token(tokenPath);
  const fontSize = size.replace("text-", "");

  return (
    <HStack gap="default.4" alignItems="flex-start">
      <span className={labelStyles}>{size}</span>
      <span className={valueStyles}>{value}</span>
      <div
        className={css({
          bg: "blue.00",
          maxWidth: "[400px]",
        })}
        style={{
          fontSize: token(`fontSizes.${fontSize}` as Token),
          lineHeight: value,
        }}
      >
        Multi-line text demo showing the line height value. This text wraps to
        show spacing.
      </div>
    </HStack>
  );
};

export const Typography: Story = () => (
  <VStack gap="default.8" alignItems="flex-start" p="default.6">
    <h1 className={css({ fontSize: "2xl", fontWeight: "semibold" })}>
      Typography Tokens
    </h1>

    <VStack gap="default.4" alignItems="flex-start" width="[100%]">
      <h2 className={sectionTitleStyles}>Font Families</h2>
      <FontFamilyDemo name="display" tokenPath="fonts.display" />
      <FontFamilyDemo name="body" tokenPath="fonts.body" />
    </VStack>

    <VStack gap="default.4" alignItems="flex-start" width="[100%]">
      <h2 className={sectionTitleStyles}>Font Sizes</h2>
      {fontSizeOrder.map((size) => (
        <FontSizeDemo key={size} size={size} />
      ))}
    </VStack>

    <VStack gap="default.4" alignItems="flex-start" width="[100%]">
      <h2 className={sectionTitleStyles}>Font Weights</h2>
      {fontWeightEntries.map(({ name, value }) => (
        <FontWeightDemo key={name} name={name} value={value} />
      ))}
    </VStack>

    <HStack gap="default.12" alignItems="flex-start" width="[100%]">
      <VStack gap="default.4" alignItems="flex-start" flex="1">
        <h2 className={sectionTitleStyles}>Line Heights: None (Tight)</h2>
        <p
          className={css({
            fontSize: "xs",
            color: "text.tertiary",
            mb: "default.2",
          })}
        >
          Line height equals font size — for single-line text
        </p>
        {["text-xs", "text-sm", "text-base", "text-lg", "text-3xl"].map(
          (size) => (
            <LineHeightDemo key={size} category="none" size={size} />
          ),
        )}
      </VStack>

      <VStack gap="default.4" alignItems="flex-start" flex="1">
        <h2 className={sectionTitleStyles}>Line Heights: Normal</h2>
        <p
          className={css({
            fontSize: "xs",
            color: "text.tertiary",
            mb: "default.2",
          })}
        >
          Comfortable line height for multi-line text
        </p>
        {["text-xs", "text-sm", "text-base", "text-lg"].map((size) => (
          <LineHeightDemo key={size} category="normal" size={size} />
        ))}
      </VStack>
    </HStack>
  </VStack>
);

Typography.storyName = "Typography";
