/**
 * Nodes as Pixi display objects, in the compact card and classic shapes the
 * React Flow node components draw. Each node is a small tree of Graphics and
 * bitmap text; only the node whose scene entry changed redraws.
 */

import {
  BitmapText,
  Container,
  Graphics,
  type TextStyleOptions,
} from "pixi.js";
import { createContext, use, useEffect, useRef, type FC } from "react";

import { splitPascalCase } from "../../../../../lib/split-pascal-case";
import { placeBorderColor, placeFillColor } from "../../../styles/type-colors";
import {
  handlesOf,
  handleSize,
  isRoundNode,
  portHandleSize,
} from "./node-geometry";
import { pixiLabelBoldFont, pixiLabelFont } from "./pixi-fonts";
import {
  dimmedAlpha,
  handleColor,
  hoverOutline,
  iconBorder,
  selectionOutline,
  tokenBadgeColor,
  untypedClassicPlaceBorder,
  type PixiTheme,
} from "./pixi-theme";

import type {
  CanvasComponentInstanceNode,
  CanvasNode,
  CanvasPlaceNode,
  CanvasTransitionNode,
} from "../../../canvas-scene";

// Registry -----------------------------------------------------------------------

/** Live objects the animator mutates without re-rendering the node. */
export type NodeHandles = {
  /** The card or shape fill; flashes on firing. */
  fill: Graphics | null;
  /** Lightning bolt shown while a transition fires. */
  bolt: Container | null;
  /** Token count badge for places. */
  badge: BitmapText | null;
  badgeGroup: Container | null;
};

export type NodeRegistry = Map<string, NodeHandles>;

export const NodeRegistryContext = createContext<NodeRegistry | null>(null);

const useNodeRegistry = (): NodeRegistry => {
  const registry = use(NodeRegistryContext);
  if (!registry)
    throw new Error("Pixi nodes must be rendered inside the Pixi world");
  return registry;
};

export const PixiThemeContext = createContext<PixiTheme | null>(null);

const useTheme = (): PixiTheme => {
  const theme = use(PixiThemeContext);
  if (!theme)
    throw new Error("Pixi nodes must be rendered inside the Pixi world");
  return theme;
};

// Styling ------------------------------------------------------------------------

const textStyle = (
  fontSize: number,
  fill: number,
  options: Partial<TextStyleOptions> = {},
): TextStyleOptions => ({
  fontFamily: pixiLabelFont,
  fontSize,
  fill,
  ...options,
});

const boldTextStyle = (
  fontSize: number,
  fill: number,
  options: Partial<TextStyleOptions> = {},
): TextStyleOptions => ({
  ...textStyle(fontSize, fill, options),
  fontFamily: pixiLabelBoldFont,
});

/** Approximate CSS `text-overflow: ellipsis` for a single line. */
const truncate = (text: string, maxWidth: number, fontSize: number): string => {
  const averageGlyph = fontSize * 0.55;
  const maxChars = Math.max(1, Math.floor(maxWidth / averageGlyph));
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
};

type Look = { selected: boolean; hovered: boolean };

/** Outline outside the shape: 4px, blue when selected, faint when hovered. */
const strokeOutline = (
  graphics: Graphics,
  look: Look,
  draw: (graphics: Graphics, inset: number) => Graphics,
) => {
  if (!look.selected && !look.hovered) return;
  const outline = look.selected ? selectionOutline : hoverOutline;
  draw(graphics, -outline.width / 2).stroke({
    color: outline.color,
    alpha: outline.alpha,
    width: outline.width,
  });
};

const drawHandles = (graphics: Graphics, node: CanvasNode) => {
  const size = node.kind === "componentInstance" ? portHandleSize : handleSize;
  for (const handle of handlesOf(node)) {
    graphics
      .circle(
        handle.position.x - node.position.x,
        handle.position.y - node.position.y,
        size / 2,
      )
      .fill(handleColor);
  }
};

// Compact cards ------------------------------------------------------------------

const cardPadding = 4;
const iconBoxSize = 40;
const compactTitleSize = 14;
const compactSubtitleSize = 12;

const drawCompactCard = (
  graphics: Graphics,
  node: CanvasPlaceNode | CanvasTransitionNode,
  theme: PixiTheme,
  look: Look,
) => {
  graphics.clear();
  const width = node.width;
  const height = node.height;
  const radius = node.kind === "place" ? height / 2 : 6;
  const isPlace = node.kind === "place";
  const fill = isPlace
    ? theme.color(placeFillColor(node.typeColor))
    : { color: theme["neutral.s00"], alpha: 1 };
  const border = isPlace
    ? placeBorderColor(node.typeColor)
      ? theme.color(placeBorderColor(node.typeColor)!)
      : { color: theme["neutral.s120"], alpha: 1 }
    : {
        color: look.hovered ? theme["neutral.s100"] : theme["neutral.s70"],
        alpha: 1,
      };

  const card = (target: Graphics, inset: number) =>
    target.roundRect(
      -width / 2 - inset,
      -height / 2 - inset,
      width + 2 * inset,
      height + 2 * inset,
      radius - inset,
    );

  strokeOutline(graphics, look, card);
  card(graphics, 0)
    .fill(fill)
    .stroke({ color: border.color, alpha: border.alpha, width: 1 });

  // Icon box at the left edge, round for places and square for transitions.
  const iconX = -width / 2 + cardPadding;
  const iconY = -iconBoxSize / 2;
  const iconRadius = isPlace ? iconBoxSize / 2 : 0;
  graphics
    .roundRect(iconX, iconY, iconBoxSize, iconBoxSize, iconRadius)
    .fill(theme["neutral.s10"])
    .stroke({ color: iconBorder.color, alpha: iconBorder.alpha, width: 1 });
  const iconColor = isPlace
    ? placeBorderColor(node.typeColor)
      ? theme.color(placeBorderColor(node.typeColor)!).color
      : theme["neutral.s80"]
    : theme["neutral.s80"];
  const iconCenterX = iconX + iconBoxSize / 2;
  if (isPlace) {
    graphics.circle(iconCenterX, 0, 7).fill(iconColor);
  } else {
    graphics.rect(iconCenterX - 7, -7, 14, 14).fill(iconColor);
  }
  drawHandles(graphics, node);
};

const compactSubtitle = (
  node: CanvasPlaceNode | CanvasTransitionNode,
): string => {
  if (node.kind === "place")
    return node.dynamicsEnabled ? "Place (Dynamics)" : "Place";
  return node.lambdaType === "none"
    ? "Transition"
    : node.lambdaType === "stochastic"
      ? "Stochastic"
      : "Predicate";
};

// Classic shapes -----------------------------------------------------------------

const classicLabelSize = 15;

const drawClassicPlace = (
  graphics: Graphics,
  node: CanvasPlaceNode,
  theme: PixiTheme,
  look: Look,
) => {
  graphics.clear();
  const radius = node.width / 2;
  const fill = theme.color(placeFillColor(node.typeColor));
  const border = placeBorderColor(node.typeColor)
    ? theme.color(placeBorderColor(node.typeColor)!)
    : { color: untypedClassicPlaceBorder, alpha: 1 };
  strokeOutline(graphics, look, (target, inset) =>
    target.circle(0, 0, radius - inset),
  );
  graphics
    .circle(0, 0, radius)
    .fill(fill)
    .stroke({ color: border.color, alpha: border.alpha, width: 2 });
  drawHandles(graphics, node);
};

const drawClassicTransition = (
  graphics: Graphics,
  node: CanvasTransitionNode,
  theme: PixiTheme,
  look: Look,
) => {
  graphics.clear();
  const { width, height } = node;
  const box = (target: Graphics, inset: number) =>
    target.roundRect(
      -width / 2 - inset,
      -height / 2 - inset,
      width + 2 * inset,
      height + 2 * inset,
      12 - inset,
    );
  strokeOutline(graphics, look, box);
  box(graphics, 0)
    .fill(theme["neutral.s10"])
    .stroke({
      color: look.hovered ? theme["neutral.s90"] : theme["neutral.s80"],
      width: 2,
    });
  drawHandles(graphics, node);
};

// Component instances ------------------------------------------------------------

const drawComponentInstance = (
  graphics: Graphics,
  node: CanvasComponentInstanceNode,
  theme: PixiTheme,
  look: Look,
) => {
  graphics.clear();
  const { width, height } = node;
  const box = (target: Graphics, inset: number) =>
    target.roundRect(
      -width / 2 - inset,
      -height / 2 - inset,
      width + 2 * inset,
      height + 2 * inset,
      4,
    );
  strokeOutline(graphics, look, box);
  box(graphics, 0)
    .fill(theme["neutral.s15"])
    .stroke({ color: theme["neutral.s60"], width: 2 });
  // Cube icon: a small rhombus above the title.
  const iconY = -height / 2 + 18;
  graphics
    .poly([
      0,
      iconY - 8,
      8,
      iconY - 4,
      8,
      iconY + 4,
      0,
      iconY + 8,
      -8,
      iconY + 4,
      -8,
      iconY - 4,
    ])
    .stroke({ color: theme["neutral.s90"], width: 1.5 });
  drawHandles(graphics, node);
};

// Components ---------------------------------------------------------------------

const noRef: React.RefObject<null> = { current: null };

/** Publishes this node's animated objects to the registry for its lifetime. */
const useRegisteredHandles = (
  nodeId: string,
  fillRef: React.RefObject<Graphics | null>,
  boltRef: React.RefObject<Container | null> = noRef,
  badgeRef: React.RefObject<BitmapText | null> = noRef,
  badgeGroupRef: React.RefObject<Container | null> = noRef,
) => {
  const registry = useNodeRegistry();
  useEffect(() => {
    registry.set(nodeId, {
      fill: fillRef.current,
      bolt: boltRef.current,
      badge: badgeRef.current,
      badgeGroup: badgeGroupRef.current,
    });
    return () => {
      registry.delete(nodeId);
    };
  }, [registry, nodeId, fillRef, boltRef, badgeRef, badgeGroupRef]);
};

const badgeRadius = 10;

/** Token count badge: a black pill with a white number, hidden until a count exists. */
const TokenBadge: FC<{
  x: number;
  y: number;
  groupRef: React.RefObject<Container | null>;
  textRef: React.RefObject<BitmapText | null>;
  large?: boolean;
}> = ({ x, y, groupRef, textRef, large = false }) => {
  const radius = large ? 13 : badgeRadius;
  return (
    <pixiContainer ref={groupRef} x={x} y={y} visible={false}>
      <pixiGraphics
        draw={(graphics) =>
          graphics
            .clear()
            .roundRect(-radius, -radius, radius * 2, radius * 2, radius)
            .fill(tokenBadgeColor)
        }
      />
      <pixiBitmapText
        ref={textRef}
        text="0"
        anchor={0.5}
        style={boldTextStyle(large ? 15 : 12, 0xffffff)}
      />
    </pixiContainer>
  );
};

/** Lightning bolt that flares up when a transition fires. */
const FiringBolt: FC<{
  x: number;
  y: number;
  boltRef: React.RefObject<Container | null>;
  theme: PixiTheme;
}> = ({ x, y, boltRef, theme }) => (
  <pixiContainer ref={boltRef} x={x} y={y} alpha={0}>
    <pixiGraphics
      draw={(graphics) =>
        graphics
          .clear()
          .poly([1, -8, -4, 1, 0, 1, -1, 8, 4, -1, 0, -1])
          .fill(theme["yellow.s60"])
      }
    />
  </pixiContainer>
);

const PixiCompactNode: FC<{ node: CanvasPlaceNode | CanvasTransitionNode }> = ({
  node,
}) => {
  const theme = useTheme();
  const fillRef = useRef<Graphics>(null);
  const boltRef = useRef<Container>(null);
  const badgeRef = useRef<BitmapText>(null);
  const badgeGroupRef = useRef<Container>(null);
  useRegisteredHandles(node.id, fillRef, boltRef, badgeRef, badgeGroupRef);

  const look = { selected: node.selected, hovered: node.hovered };
  const textLeft = -node.width / 2 + cardPadding + iconBoxSize + 8;
  const textWidth = node.width / 2 - 12 - textLeft;
  const badgeColor =
    node.kind === "place" ? theme["blue.s110"] : theme["blue.s60"];
  const showIconBadge =
    (node.kind === "place" && node.dynamicsEnabled) ||
    (node.kind === "transition" && node.lambdaType === "stochastic");

  return (
    <pixiContainer
      x={node.position.x}
      y={node.position.y}
      alpha={node.dimmed ? dimmedAlpha : 1}
    >
      <pixiGraphics
        ref={fillRef}
        draw={(graphics) => drawCompactCard(graphics, node, theme, look)}
      />
      <pixiBitmapText
        text={truncate(node.label, textWidth, compactTitleSize)}
        x={textLeft}
        y={-2}
        anchor={{ x: 0, y: 1 }}
        style={textStyle(compactTitleSize, theme["neutral.s120"])}
      />
      <pixiBitmapText
        text={compactSubtitle(node)}
        x={textLeft}
        y={2}
        anchor={{ x: 0, y: 0 }}
        style={textStyle(compactSubtitleSize, theme["neutral.s90"])}
      />
      {showIconBadge ? (
        <pixiContainer
          x={-node.width / 2 + cardPadding + iconBoxSize - 6}
          y={iconBoxSize / 2 - 6}
        >
          <pixiGraphics
            draw={(graphics) =>
              graphics.clear().circle(0, 0, 8).fill(theme["neutral.s00"])
            }
          />
          <pixiBitmapText
            text={node.kind === "place" ? "ƒ" : "λ"}
            anchor={0.5}
            y={-1}
            style={boldTextStyle(11, badgeColor)}
          />
        </pixiContainer>
      ) : null}
      {node.kind === "place" ? (
        <TokenBadge
          x={node.width / 2 - 2}
          y={-node.height / 2 + 2}
          groupRef={badgeGroupRef}
          textRef={badgeRef}
        />
      ) : (
        <FiringBolt
          x={node.width / 2 - 2}
          y={-node.height / 2 + 2}
          boltRef={boltRef}
          theme={theme}
        />
      )}
    </pixiContainer>
  );
};

const PixiClassicPlace: FC<{ node: CanvasPlaceNode }> = ({ node }) => {
  const theme = useTheme();
  const fillRef = useRef<Graphics>(null);
  const badgeRef = useRef<BitmapText>(null);
  const badgeGroupRef = useRef<Container>(null);
  useRegisteredHandles(node.id, fillRef, noRef, badgeRef, badgeGroupRef);
  const look = { selected: node.selected, hovered: node.hovered };

  return (
    <pixiContainer
      x={node.position.x}
      y={node.position.y}
      alpha={node.dimmed ? dimmedAlpha : 1}
    >
      <pixiGraphics
        ref={fillRef}
        draw={(graphics) => drawClassicPlace(graphics, node, theme, look)}
      />
      {node.dynamicsEnabled ? (
        <pixiBitmapText
          text="ƒ"
          anchor={0.5}
          y={-node.height / 2 + 30}
          style={boldTextStyle(16, theme["blue.s110"])}
        />
      ) : null}
      <pixiBitmapText
        text={splitPascalCase(node.label).join("​")}
        anchor={0.5}
        style={textStyle(classicLabelSize, theme["neutral.s120"], {
          align: "center",
          wordWrap: true,
          wordWrapWidth: node.width - 40,
          breakWords: true,
        })}
      />
      <TokenBadge
        x={0}
        y={node.height * 0.2 + 13}
        groupRef={badgeGroupRef}
        textRef={badgeRef}
        large
      />
    </pixiContainer>
  );
};

const PixiClassicTransition: FC<{ node: CanvasTransitionNode }> = ({
  node,
}) => {
  const theme = useTheme();
  const fillRef = useRef<Graphics>(null);
  const boltRef = useRef<Container>(null);
  useRegisteredHandles(node.id, fillRef, boltRef);
  const look = { selected: node.selected, hovered: node.hovered };

  return (
    <pixiContainer
      x={node.position.x}
      y={node.position.y}
      alpha={node.dimmed ? dimmedAlpha : 1}
    >
      <pixiGraphics
        ref={fillRef}
        draw={(graphics) => drawClassicTransition(graphics, node, theme, look)}
      />
      {node.lambdaType === "stochastic" ? (
        <pixiBitmapText
          text="λ"
          anchor={0.5}
          y={-node.height / 2 + 14}
          style={boldTextStyle(16, theme["blue.s60"])}
        />
      ) : null}
      <pixiBitmapText
        text={node.label}
        anchor={0.5}
        style={textStyle(classicLabelSize, theme["neutral.s120"], {
          align: "center",
          wordWrap: true,
          wordWrapWidth: node.width - 16,
          breakWords: true,
        })}
      />
      <FiringBolt
        x={0}
        y={node.height / 2 - 14}
        boltRef={boltRef}
        theme={theme}
      />
    </pixiContainer>
  );
};

const PixiComponentInstance: FC<{ node: CanvasComponentInstanceNode }> = ({
  node,
}) => {
  const theme = useTheme();
  const fillRef = useRef<Graphics>(null);
  useRegisteredHandles(node.id, fillRef);
  const look = { selected: node.selected, hovered: node.hovered };
  const ports = handlesOf(node).filter((handle) => handle.kind === "target");

  return (
    <pixiContainer
      x={node.position.x}
      y={node.position.y}
      alpha={node.dimmed ? dimmedAlpha : 1}
    >
      <pixiGraphics
        ref={fillRef}
        draw={(graphics) => drawComponentInstance(graphics, node, theme, look)}
      />
      <pixiBitmapText
        text={truncate(node.label, node.width - 24, compactTitleSize)}
        anchor={0.5}
        y={4}
        style={boldTextStyle(compactTitleSize, theme["neutral.s120"])}
      />
      <pixiBitmapText
        text={truncate(node.subnetName, node.width - 24, compactSubtitleSize)}
        anchor={0.5}
        y={20}
        style={textStyle(compactSubtitleSize, theme["neutral.s80"])}
      />
      {ports.map((port) => (
        <pixiBitmapText
          key={port.portId ?? port.nodeId}
          text={node.ports.find(({ id }) => id === port.portId)?.name ?? ""}
          x={port.position.x - node.position.x + portHandleSize + 4}
          y={port.position.y - node.position.y}
          anchor={{ x: 0, y: 0.5 }}
          style={textStyle(9, theme["neutral.s80"])}
        />
      ))}
    </pixiContainer>
  );
};

/** One node in the active visual style. */
export const PixiNode: FC<{ node: CanvasNode; compact: boolean }> = ({
  node,
  compact,
}) => {
  switch (node.kind) {
    case "componentInstance":
      return <PixiComponentInstance node={node} />;
    case "place":
      return compact || !isRoundNode(node) ? (
        <PixiCompactNode node={node} />
      ) : (
        <PixiClassicPlace node={node} />
      );
    case "transition":
      return compact ? (
        <PixiCompactNode node={node} />
      ) : (
        <PixiClassicTransition node={node} />
      );
  }
};
