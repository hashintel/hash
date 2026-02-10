import type { Story } from "@ladle/react";
import { ThemeState, useLadleContext } from "@ladle/react";
import { css } from "../styled-system/css";
import { token } from "../styled-system/tokens";
import { VStack, HStack, Box } from "../styled-system/jsx";
import type { Token } from "../styled-system/tokens/tokens";
import figmaGray from "./figma-gray-reference.json";
import type { SolidStep } from "./_types";

type FigmaStep = keyof typeof figmaGray.gray;

const FIGMA_STEPS: readonly FigmaStep[] = [
  "00",
  "10",
  "20",
  "30",
  "35",
  "40",
  "50",
  "60",
  "70",
  "80",
  "90",
  "95",
];

const RADIX_STEPS: readonly SolidStep[] = [
  "s00",
  "s05",
  "s10",
  "s15",
  "s20",
  "s25",
  "s30",
  "s35",
  "s40",
  "s45",
  "s50",
  "s55",
  "s60",
  "s65",
  "s70",
  "s75",
  "s80",
  "s85",
  "s90",
  "s95",
  "s100",
  "s105",
  "s110",
  "s115",
  "s120",
  "s125",
];

/**
 * Initial best-guess mapping from figma gray steps to radix neutral steps.
 * Edit these values to visually align the figma chips under the correct radix chip.
 */
const FIGMA_TO_RADIX_MAP: Record<FigmaStep, SolidStep | undefined> = {
  "00": "s05",
  "10": "s25",
  "20": "s45",
  "30": "s60",
  "35": "s75",
  "40": "s85",
  "50": "s105",
  "60": "s110",
  "70": "s115",
  "80": undefined,
  "90": "s120",
  "95": "s125",
};

const COLS = RADIX_STEPS.length;
const GRID_TEMPLATE = `100px repeat(${COLS}, 40px)`;
const GRID_GAP = 4;

const swatchStyles = css({
  width: "[40px]",
  height: "[40px]",
  borderRadius: "sm",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "[8px]",
  fontWeight: "medium",
  flexShrink: "0",
});

const labelStyles = css({
  fontSize: "xs",
  fontWeight: "semibold",
  minWidth: "[100px]",
  textAlign: "right",
  pr: "3",
  fontFamily: "mono",
  flexShrink: "0",
});

const headerStyles = css({
  fontSize: "[8px]",
  fontWeight: "medium",
  width: "[40px]",
  textAlign: "center",
  color: "colorPalette.fg.muted",
  fontFamily: "mono",
  flexShrink: "0",
});

const swatchLabel = css({
  color: "white",
  textShadow: "[0_1px_2px_rgba(0,0,0,0.5)]",
  mixBlendMode: "difference",
});

const FigmaSwatch = ({ step }: { step: string }) => {
  const entry = figmaGray.gray[step as keyof typeof figmaGray.gray];
  if (!entry) return null;

  const { globalState } = useLadleContext();
  const isDark = globalState.theme === ThemeState.Dark;
  const color = isDark ? entry._dark : entry._light;

  return (
    <div
      className={swatchStyles}
      style={{
        backgroundColor: color,
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)",
      }}
    >
      <span className={swatchLabel}>{step}</span>
    </div>
  );
};

const RadixSwatch = ({ step }: { step: string }) => {
  const tokenPath = `colors.neutral.${step}` as Token;
  const bgColor = token(tokenPath);

  return (
    <div
      className={swatchStyles}
      style={{
        backgroundColor: bgColor,
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)",
      }}
    >
      <span className={swatchLabel}>{step}</span>
    </div>
  );
};

export const ColorMappings: Story = () => {
  const radixIndex = Object.fromEntries(
    RADIX_STEPS.map((step, i) => [step, i]),
  );

  const figmaPositioned = FIGMA_STEPS.map((figmaStep) => {
    const radixStep = FIGMA_TO_RADIX_MAP[figmaStep];
    const col = radixStep != null ? (radixIndex[radixStep] ?? 0) : 0;
    return { figmaStep, radixStep, col };
  });

  return (
    <VStack gap="6" alignItems="flex-start" p="6">
      <VStack gap="1" alignItems="flex-start">
        <h1
          className={css({
            fontSize: "2xl",
            fontWeight: "semibold",
          })}
        >
          Figma Gray → Radix Comparison
        </h1>
        <p
          className={css({
            fontSize: "sm",
            color: "colorPalette.fg.muted",
            maxWidth: "[700px]",
          })}
        >
          The radix neutral scale is shown on top. Below it, legacy Figma gray
          chips are positioned under their mapped radix step. Edit
          FIGMA_TO_RADIX_MAP in the story source to adjust the alignment.
        </p>
      </VStack>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: GRID_TEMPLATE,
          gap: GRID_GAP,
          alignItems: "center",
        }}
      >
        {/* Row 1: Headers */}
        <span className={labelStyles} />
        {RADIX_STEPS.map((step) => (
          <span key={step} className={headerStyles}>
            {step}
          </span>
        ))}

        {/* Row 2: Radix neutral */}
        <span className={labelStyles}>neutral</span>
        {RADIX_STEPS.map((step) => (
          <RadixSwatch key={step} step={step} />
        ))}

        {/* Row 3: Figma gray, placed in mapped columns */}
        <span className={labelStyles}>figma gray</span>
        {RADIX_STEPS.map((radixStep) => {
          const figmaStep = figmaPositioned.find(
            (f) => f.radixStep === radixStep,
          );
          return figmaStep ? (
            <FigmaSwatch key={radixStep} step={figmaStep.figmaStep} />
          ) : (
            <div key={radixStep} />
          );
        })}
      </div>

      {/* Mapping table */}
      <Box mt="4">
        <h2
          className={css({
            fontSize: "lg",
            fontWeight: "semibold",
            mb: "3",
          })}
        >
          Mapping Table
        </h2>
        <p
          className={css({
            fontSize: "sm",
            color: "colorPalette.fg.muted",
            mb: "3",
            maxWidth: "[500px]",
          })}
        >
          Edit{" "}
          <code className={css({ fontFamily: "mono", fontSize: "xs" })}>
            FIGMA_TO_RADIX_MAP
          </code>{" "}
          in{" "}
          <code className={css({ fontFamily: "mono", fontSize: "xs" })}>
            colors.comparison.story.tsx
          </code>{" "}
          to adjust these mappings.
        </p>
        <table
          className={css({
            fontFamily: "mono",
            fontSize: "sm",
            borderCollapse: "collapse",
          })}
        >
          <thead>
            <tr>
              <th
                className={css({
                  textAlign: "left",
                  pr: "6",
                  pb: "2",
                  fontWeight: "semibold",
                  borderBottomWidth: "[1px]",
                  borderColor: "colorPalette.bd.subtle",
                })}
              >
                figma gray
              </th>
              <th
                className={css({
                  textAlign: "left",
                  pb: "2",
                  fontWeight: "semibold",
                  borderBottomWidth: "[1px]",
                  borderColor: "colorPalette.bd.subtle",
                })}
              >
                → neutral
              </th>
            </tr>
          </thead>
          <tbody>
            {FIGMA_STEPS.map((step) => (
              <tr key={step}>
                <td
                  className={css({
                    pr: "6",
                    py: "1",
                    borderBottomWidth: "[1px]",
                    borderColor: "colorPalette.bd.subtle",
                  })}
                >
                  {step}
                </td>
                <td
                  className={css({
                    py: "1",
                    borderBottomWidth: "[1px]",
                    borderColor: "colorPalette.bd.subtle",
                  })}
                >
                  {FIGMA_TO_RADIX_MAP[step]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    </VStack>
  );
};

ColorMappings.storyName = "Color Step Mappings";
