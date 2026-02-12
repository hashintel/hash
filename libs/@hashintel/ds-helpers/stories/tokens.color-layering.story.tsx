import type { Story } from "@ladle/react";
import { useState } from "react";
import { css } from "../styled-system/css";
import { VStack, HStack, Box, Grid } from "../styled-system/jsx";
import type { PaletteName } from "./_types";

const COLOR_PALETTES: readonly PaletteName[] = [
  "neutral",
  "blue",
  "red",
  "orange",
  "green",
  "purple",
];

type BgLevel = "min" | "surface" | "subtle" | "shaded" | "strong" | "solid";
type BdLevel = "subtle" | "solid" | "strong";

const BG_LEVELS: readonly BgLevel[] = [
  "min",
  "surface",
  "subtle",
  "shaded",
  "strong",
  "solid",
];

const BD_LEVELS: readonly BdLevel[] = ["subtle", "solid", "strong"];

const sectionTitle = css({
  textStyle: "sm",
  fontWeight: "semibold",
  color: "fg.body",
  mb: "1",
});

const caption = css({
  textStyle: "xs",
  fontWeight: "medium",
  color: "fg.muted",
});

const mono = css({
  fontFamily: "mono",
  textStyle: "xs",
});

const NestedLayers = ({ palette }: { palette: PaletteName }) => (
  <Box colorPalette={palette as "blue"}>
    <span className={sectionTitle}>
      Nested <code className={mono}>bg.subtle</code> layers
    </span>
    <Box bg="colorPalette.bg.subtle" p="4" borderRadius="md" mt="2">
      <span className={caption}>Layer 1 — bg.subtle</span>
      <Box bg="colorPalette.bg.subtle" p="4" borderRadius="md" mt="2">
        <span className={caption}>Layer 2 — bg.subtle</span>
        <Box bg="colorPalette.bg.subtle" p="4" borderRadius="md" mt="2">
          <span className={caption}>Layer 3 — bg.subtle</span>
          <Box bg="colorPalette.bg.subtle" p="4" borderRadius="md" mt="2">
            <span className={caption}>Layer 4 — bg.subtle</span>
          </Box>
        </Box>
      </Box>
    </Box>
  </Box>
);

const NestedSurface = ({ palette }: { palette: PaletteName }) => (
  <Box colorPalette={palette as "blue"}>
    <span className={sectionTitle}>
      Nested <code className={mono}>bg.surface</code> layers
    </span>
    <Box bg="colorPalette.bg.surface" p="4" borderRadius="md" mt="2">
      <span className={caption}>Layer 1 — bg.surface</span>
      <Box bg="colorPalette.bg.surface" p="4" borderRadius="md" mt="2">
        <span className={caption}>Layer 2 — bg.surface</span>
        <Box bg="colorPalette.bg.surface" p="4" borderRadius="md" mt="2">
          <span className={caption}>Layer 3 — bg.surface</span>
          <Box bg="colorPalette.bg.surface" p="4" borderRadius="md" mt="2">
            <span className={caption}>Layer 4 — bg.surface</span>
          </Box>
        </Box>
      </Box>
    </Box>
  </Box>
);

const BordersOnBackgrounds = ({ palette }: { palette: PaletteName }) => (
  <Box colorPalette={palette as "blue"}>
    <span className={sectionTitle}>Borders on backgrounds</span>
    <VStack gap="3" mt="2" alignItems="stretch">
      {BG_LEVELS.filter((bg) => bg !== "solid").map((bg) => (
        <Box
          key={bg}
          bg={`colorPalette.bg.${bg}` as "colorPalette.bg.subtle"}
          p="4"
          borderRadius="md"
        >
          <span className={caption}>bg.{bg}</span>
          <HStack gap="2" mt="2" flexWrap="wrap">
            {BD_LEVELS.map((bd) => (
              <Box
                key={bd}
                px="3"
                py="2"
                borderRadius="sm"
                border="[1px solid]"
                borderColor={
                  `colorPalette.bd.${bd}` as "colorPalette.bd.subtle"
                }
              >
                <span className={mono}>bd.{bd}</span>
              </Box>
            ))}
          </HStack>
        </Box>
      ))}
    </VStack>
  </Box>
);

const MixedLevels = ({ palette }: { palette: PaletteName }) => (
  <Box colorPalette={palette as "blue"}>
    <span className={sectionTitle}>Progressive depth</span>
    <Box bg="colorPalette.bg.surface" p="4" borderRadius="md" mt="2">
      <span className={caption}>bg.surface</span>
      <Box
        bg="colorPalette.bg.subtle"
        p="4"
        borderRadius="md"
        mt="2"
        border="[1px solid]"
        borderColor="colorPalette.bd.subtle"
      >
        <span className={caption}>bg.subtle + bd.subtle</span>
        <Box
          bg="colorPalette.bg.shaded"
          p="4"
          borderRadius="md"
          mt="2"
          border="[1px solid]"
          borderColor="colorPalette.bd.solid"
        >
          <span className={caption}>bg.shaded + bd.solid</span>
          <Box
            bg="colorPalette.bg.strong"
            p="3"
            borderRadius="sm"
            mt="2"
            border="[1px solid]"
            borderColor="colorPalette.bd.strong"
          >
            <span className={caption}>bg.strong + bd.strong</span>
          </Box>
        </Box>
      </Box>
    </Box>
  </Box>
);

export const ColorLayering: Story = () => {
  const [palette, setPalette] = useState<PaletteName>("neutral");

  return (
    <VStack gap="6" alignItems="flex-start" p="6">
      <VStack gap="1" alignItems="flex-start">
        <h1 className={css({ textStyle: "2xl", fontWeight: "semibold" })}>
          Background &amp; Border Layering
        </h1>
        <p
          className={css({
            textStyle: "sm",
            color: "fg.body",
            maxWidth: "[700px]",
          })}
        >
          All <code className={mono}>bg.*</code> and{" "}
          <code className={mono}>bd.*</code> tokens use alpha transparency,
          allowing them to layer over any surface. Nesting the same level
          produces progressively darker shading.
        </p>
      </VStack>

      <HStack gap="2" alignItems="center">
        <span className={css({ textStyle: "sm", fontWeight: "medium" })}>
          Palette:
        </span>
        {COLOR_PALETTES.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPalette(p)}
            className={css({
              textStyle: "xs",
              fontWeight: palette === p ? "semibold" : "normal",
              px: "3",
              py: "1.5",
              borderRadius: "sm",
              cursor: "pointer",
              textTransform: "capitalize",
              border: "[1px solid]",
              borderColor: palette === p ? "bd.solid" : "bd.subtle",
              bg: palette === p ? "bg.subtle" : "bg.min",
              color: palette === p ? "fg.heading" : "fg.body",
            })}
          >
            {p}
          </button>
        ))}
      </HStack>

      <Grid columns={2} gap="8" width="[100%]">
        <NestedLayers palette={palette} />
        <NestedSurface palette={palette} />
        <BordersOnBackgrounds palette={palette} />
        <MixedLevels palette={palette} />
      </Grid>
    </VStack>
  );
};

ColorLayering.storyName = "Color Layering";
