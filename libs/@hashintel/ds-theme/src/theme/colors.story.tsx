import type { Story } from "@ladle/react";
import { css } from "../../styled-system/css";
import { token } from "../../styled-system/tokens";
import { VStack, HStack } from "../../styled-system/jsx";
import { colors } from "./colors";
import type { Token } from "../../styled-system/tokens/tokens";

/** Extract shade keys from each color scale, sorted numerically */
const getShades = (colorObj: Record<string, unknown>): string[] => {
  const keys = Object.keys(colorObj);
  // Sort numerically for numeric keys, alphabetically for others
  return keys.sort((a, b) => {
    const numA = Number.parseInt(a, 10);
    const numB = Number.parseInt(b, 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return a.localeCompare(b);
  });
};

/** Order of color scales to display (neutral first, then alphabetical) */
const colorOrder = [
  "neutral",
  ...Object.keys(colors)
    .filter((k) => k !== "neutral")
    .sort(),
] as const;

const swatchStyles = css({
  width: "64px",
  height: "48px",
  borderRadius: "md",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  fontSize: "10px",
  fontWeight: "medium",
  pb: "1",
  boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.1)",
});

const labelStyles = css({
  fontSize: "sm",
  fontWeight: "semibold",
  textTransform: "capitalize",
  minWidth: "100px",
});

const ColorSwatch = ({
  colorName,
  shade,
}: {
  colorName: string;
  shade: string;
}) => {
  const tokenPath = `colors.${colorName}.${shade}` as Token;
  return (
    <div className={swatchStyles} style={{ backgroundColor: token(tokenPath) }}>
      <span
        className={css({
          color: "neutral.white",
          textShadow: "0 1px 2px rgba(0,0,0,0.5)",
        })}
      >
        {shade}
      </span>
    </div>
  );
};

const ColorScale = ({ name, shades }: { name: string; shades: string[] }) => (
  <HStack gap="2" alignItems="center">
    <span className={labelStyles}>{name}</span>
    {shades.map((shade) => (
      <ColorSwatch key={shade} colorName={name} shade={shade} />
    ))}
  </HStack>
);

export const Colors: Story = () => (
  <VStack gap="6" alignItems="flex-start" p="6">
    <h1 className={css({ fontSize: "2xl", fontWeight: "bold" })}>
      Color Tokens
    </h1>
    <VStack gap="4" alignItems="flex-start">
      {colorOrder.map((name) => {
        const colorObj = colors[name as keyof typeof colors];
        return (
          <ColorScale
            key={name}
            name={name}
            shades={getShades(colorObj as Record<string, unknown>)}
          />
        );
      })}
    </VStack>
  </VStack>
);

Colors.storyName = "All Colors";
