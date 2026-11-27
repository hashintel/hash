import { Handle, Position, type NodeProps } from "@xyflow/react";

import { Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import { componentInstanceHeaderHeight } from "@hashintel/petrinaut-core";

import { useEditorActions } from "../../../../../../react/state/editor-context";
import { ComponentGlyph } from "../../../../../shared/component-glyph";
import { nodeFocusStyle } from "../../../styles/focus";
import { InstanceVisualizer } from "./instance-visualizer";
import {
  iconContainerBaseStyle,
  nodeContainerStyle,
  nodeSubtitleStyle,
  nodeTextAreaStyle,
  nodeTitleStyle,
} from "./node-card-styles";
import { pinLayout, pinSides, portOnSide } from "./pin-layout";
import { portInHandleId, portOutHandleId } from "./port-handles";
import { pinColorStyle, pinStyle } from "./port-pin-style";
import { useRemeasureHandles } from "./use-remeasure-handles";

import type { CanvasInstanceBinding, CanvasPort } from "../../../canvas-scene";
import type { ComponentInstanceNodeType } from "./react-flow-types";

const cardStyle = cx(
  "node-surface",
  "node-border",
  css({
    width: "full",
    height: "full",
    display: "flex",
    flexDirection: "column",
    boxSizing: "border-box",
    "--node-border": "var(--colors-neutral-s70)",
    "--node-fill": "var(--colors-neutral-s00)",
    border: "1px solid",
    borderColor: "[var(--node-border)]",
    borderRadius: "lg",
    backgroundColor: "[var(--node-fill)]",
    cursor: "default",
    // Contributed to the shadow `nodeFocusStyle` owns, so the focus glow
    // and the elevation can sit in one declaration.
    "--node-elevation": "0px 2px 9px rgba(0, 0, 0, 0.04)",
    _hover: {
      "--node-border": "var(--colors-neutral-s100)",
      "--node-elevation": "0px 4px 11px rgba(0, 0, 0, 0.1)",
    },
  }),
);

/**
 * `componentInstanceHeaderHeight` as a literal: Panda extracts no style value
 * it has to import. The type holds the two equal.
 */
const headerHeight: typeof componentInstanceHeaderHeight = 48;

/** The header matches the compact place and transition cards: tile, name, kind. */
const headerStyle = cx(
  "node-border",
  css({
    display: "flex",
    alignItems: "center",
    gap: "[8px]",
    height: `[${headerHeight}px]`,
    flexShrink: "0",
    padding: "[4px 6px 4px 4px]",
    "--node-border": "var(--colors-neutral-s30)",
    borderBottom: "1px solid",
    borderBottomColor: "[var(--node-border)]",
  }),
);

const iconTileStyle = css({
  borderRadius: "md",
});

/**
 * A component's colour paints its glyph and washes its tile. Set inline: the
 * tile's own colours come from a shared class this must win over.
 */
const tileTint = (color: string) =>
  ({
    color,
    "--node-fill": `color-mix(in srgb, ${color} 12%, transparent)`,
    "--node-border": `color-mix(in srgb, ${color} 30%, transparent)`,
  }) as React.CSSProperties;

/** A component's own glyph is a mask over a background of the tile's colour. */
const glyphFillStyle = cx("node-fill", css({ "--node-fill": "currentColor" }));

/** An instance that nothing runs for says so in the colour of an error. */
const unboundSubtitleStyle = css({
  "&[data-severity=error]": { "--node-text": "var(--colors-red-s100)" },
});

/** The cards' text column, grown to push the fold toggle to the header's end. */
const textStyle = cx(
  nodeTextAreaStyle,
  css({ flex: "1", color: "neutral.s120" }),
);

const foldToggleStyle = cx(
  "node-fill",
  css({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: "0",
    width: "[22px]",
    height: "[22px]",
    border: "none",
    borderRadius: "sm",
    "--node-fill": "transparent",
    backgroundColor: "[var(--node-fill)]",
    color: "neutral.s90",
    cursor: "pointer",
    _hover: {
      "--node-fill": "var(--colors-neutral-s20)",
      color: "neutral.s115",
    },
  }),
);

/**
 * Every part of a fold moves on one clock, which the canvas sets: the card's
 * height, its pins, their labels and the count that stands in for them.
 */
const foldMotionStyle = css({
  transitionDuration: "[var(--canvas-fold-duration, 180ms)]",
  transitionTimingFunction: "[var(--canvas-fold-easing)]",
});

/** Faded out, not unmounted, so a fold has something to fade. */
const fadedOutStyle = css({
  opacity: "[0]",
});

/** The chevron turns over as the card unfolds. */
const foldChevronStyle = css({
  display: "flex",
  transitionProperty: "[transform]",
});

const foldChevronTurnedStyle = css({
  transform: "[rotate(180deg)]",
});

/**
 * The folded body: how many ports the card hides, in place of their rows. It
 * keeps the height of a folded card's body, so it stays where it is while
 * the card grows under it.
 */
const foldedBodyStyle = cx(
  "node-text",
  css({
    flexShrink: "0",
    display: "flex",
    alignItems: "center",
    padding: "[0 14px]",
    fontSize: "xs",
    "--node-text": "var(--colors-neutral-a90)",
    color: "[var(--node-text)]",
    transitionProperty: "[opacity]",
  }),
);

const portLabelStyle = cx(
  "node-text",
  css({
    position: "absolute",
    fontSize: "[11px]",
    fontWeight: "medium",
    lineHeight: "[1]",
    "--node-text": "var(--colors-neutral-s105)",
    color: "[var(--node-text)]",
    // An unfolded port has its row to itself, short of the pin on each edge.
    maxWidth: "[calc(100% - 24px)]",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    pointerEvents: "none",
    transform: "translateY(-50%)",
    transitionProperty: "[top, opacity]",
  }),
);

/** A pin slides to its row, and grows to its full size, as the card unfolds. */
const pinMotionStyle = css({
  transitionProperty: "[top, width, height, border-width]",
});

/** How far in from the card's edge a port's name starts. */
const portLabelInset = 12;

const handles = {
  left: { position: Position.Left, idOf: portInHandleId },
  right: { position: Position.Right, idOf: portOutHandleId },
};

/**
 * What the card says under its name: the component, or for an instance of an
 * interface what runs for it. The line is short, so it leads with that.
 */
const describeBinding = (
  componentName: string,
  binding: CanvasInstanceBinding,
): string => {
  switch (binding.kind) {
    case "component":
      return componentName;
    case "unresolved":
      return `${componentName}, unresolved`;
    case "interface":
      return binding.implementationName ?? "no implementation";
  }
};

const describeFoldedPorts = (ports: CanvasPort[]): string => {
  const inputs = ports.filter((port) => port.direction !== "out").length;
  const outputs = ports.filter((port) => port.direction !== "in").length;
  return `${inputs} in · ${outputs} out`;
};

export const ComponentInstanceNode: React.FC<
  NodeProps<ComponentInstanceNodeType>
> = ({
  data,
  selected,
  isConnectable,
}: NodeProps<ComponentInstanceNodeType>) => {
  const { toggleComponentInstanceFold } = useEditorActions();

  // React Flow marks a node selected as a drag-selection is drawn, before the
  // change reaches the editor's own selection.
  const focus = selected ? "focused" : data.focus;

  const { ports, binding, unfolded, foldable } = data;
  const isInterface = binding.kind === "interface";
  // Nothing runs for it: no implementation is bound, or its component cannot
  // be read.
  const unbound =
    binding.kind === "unresolved" ||
    (isInterface && binding.implementationName === null);
  const subtitle = describeBinding(data.componentName, binding);

  // A card that keeps its height moves its pins when a port comes, goes or
  // changes side. They are measured at once, and again once they have slid
  // into place.
  const remeasure = useRemeasureHandles(
    data.id,
    ports.map(({ id, direction }) => `${id}:${direction}`).join(" "),
  );

  return (
    <div
      className={nodeContainerStyle}
      onTransitionEnd={(event) => {
        if (event.propertyName === "top") {
          remeasure();
        }
      }}
    >
      <div className={cx(cardStyle, nodeFocusStyle({ focus }))}>
        <div className={headerStyle}>
          <div
            // A plain tile is nearly the white of the card. A tinted one is
            // a wash of the component's colour, drawn at the node's strength.
            className={cx(
              data.color === null ? "node-inlay" : "node-fill",
              iconContainerBaseStyle,
              iconTileStyle,
            )}
            style={data.color === null ? undefined : tileTint(data.color)}
          >
            <ComponentGlyph
              iconSvg={data.icon}
              fallback={isInterface ? "puzzlePiece" : "cube"}
              maskClassName={glyphFillStyle}
            />
          </div>
          <div className={textStyle}>
            <div className={nodeTitleStyle}>{data.label}</div>
            <div
              className={cx(nodeSubtitleStyle, unboundSubtitleStyle)}
              data-severity={unbound ? "error" : undefined}
              title={
                isInterface ? `${data.componentName}: ${subtitle}` : undefined
              }
            >
              {subtitle}
            </div>
          </div>
          {foldable ? (
            <button
              type="button"
              // nodrag, nopan: a press is neither a drag of the card nor a
              // pan. nokey: Space and Enter fold the card without selecting it.
              className={cx("nodrag", "nopan", "nokey", foldToggleStyle)}
              aria-label="Ports"
              aria-expanded={unfolded}
              onClick={(event) => {
                event.stopPropagation();
                toggleComponentInstanceFold(data.id);
              }}
            >
              <span
                className={cx(
                  foldChevronStyle,
                  foldMotionStyle,
                  unfolded ? foldChevronTurnedStyle : undefined,
                )}
              >
                <Icon name="chevronDown" size="xs" />
              </span>
            </button>
          ) : null}
        </div>
        {foldable ? (
          <div
            className={cx(
              foldedBodyStyle,
              foldMotionStyle,
              unfolded ? fadedOutStyle : undefined,
            )}
            // The body of the card folded, whatever height the card has now:
            // the offset is half of what unfolding added, so
            // height - 2 * anchorOffset is the folded height.
            style={{
              height:
                data.height -
                2 * data.anchorOffset -
                componentInstanceHeaderHeight,
            }}
            aria-hidden={unfolded}
          >
            {describeFoldedPorts(ports)}
          </div>
        ) : null}
        {data.visualizerHeight > 0 ? (
          <InstanceVisualizer
            instanceId={data.id}
            // Less the card's border on either side.
            width={data.width - 2}
            height={data.visualizerHeight}
          />
        ) : null}
      </div>

      {/* The pins keep to the ports' part of the card, above its picture. */}
      {pinLayout(ports, data.height - data.visualizerHeight, unfolded).map(
        ({ port, ...tops }) => (
          <div key={port.id}>
            {pinSides.map((side) => {
              // A side the port does not use keeps its pin, hidden, so a link
              // that reaches the card from that side has somewhere to end.
              // Nothing is drawn from it or dropped on it.
              const shown = portOnSide(port.direction, side);
              return (
                <Handle
                  key={side}
                  // Both pins are source handles: a connection's source is then
                  // where the drag began, whichever pin that was.
                  type="source"
                  position={handles[side].position}
                  id={handles[side].idOf(port.id)}
                  title={shown ? port.name : undefined}
                  isConnectable={isConnectable}
                  isConnectableStart={shown}
                  isConnectableEnd={shown}
                  className={cx(
                    pinStyle({
                      size: unfolded ? "full" : "wireEnd",
                      hidden: !shown,
                    }),
                    pinMotionStyle,
                    foldMotionStyle,
                    "node-cover",
                    "node-border",
                  )}
                  style={{ top: tops[side], ...pinColorStyle(port.typeColor) }}
                />
              );
            })}
            <span
              className={cx(
                portLabelStyle,
                foldMotionStyle,
                unfolded ? undefined : fadedOutStyle,
              )}
              style={{
                top: tops.left,
                [port.direction === "out" ? "right" : "left"]: portLabelInset,
              }}
              aria-hidden={!unfolded}
            >
              {port.name}
            </span>
          </div>
        ),
      )}
    </div>
  );
};
