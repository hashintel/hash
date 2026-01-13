import type { Story } from "@ladle/react";
import { css } from "../../styled-system/css";
import { token } from "../../styled-system/tokens";
import { VStack, HStack } from "../../styled-system/jsx";
import { coreColors } from "./colors";
import type { Token } from "../../styled-system/tokens/tokens";

/** Extract shade keys from each color scale, sorted numerically */
const getShades = (colorObj: Record<string, unknown>): string[] => {
  const keys = Object.keys(colorObj);
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
  ...Object.keys(coreColors)
    .filter((k) => k !== "neutral")
    .sort(),
] as const;

const swatchStyles = css({
  width: "[64px]",
  height: "[48px]",
  borderRadius: "md.3",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  fontSize: "[10px]",
  fontWeight: "medium",
  pb: "default.1",
  boxShadow: "[inset_0_0_0_1px_rgba(0,0,0,0.1)]",
});

const labelStyles = css({
  fontSize: "sm",
  fontWeight: "semibold",
  textTransform: "capitalize",
  minWidth: "[100px]",
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
          textShadow: "[0_1px_2px_rgba(0,0,0,0.5)]",
        })}
      >
        {shade}
      </span>
    </div>
  );
};

const ColorScale = ({ name, shades }: { name: string; shades: string[] }) => (
  <HStack gap="default.2" alignItems="center">
    <span className={labelStyles}>{name}</span>
    {shades.map((shade) => (
      <ColorSwatch key={shade} colorName={name} shade={shade} />
    ))}
  </HStack>
);

export const Colors: Story = () => (
  <VStack gap="default.6" alignItems="flex-start" p="default.6">
    <h1 className={css({ fontSize: "2xl", fontWeight: "semibold" })}>
      Core Color Tokens
    </h1>
    <VStack gap="default.4" alignItems="flex-start">
      {colorOrder.map((name) => {
        const colorObj = coreColors[name as keyof typeof coreColors];
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
