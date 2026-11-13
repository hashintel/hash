import { use } from "react";

import { css, cva } from "@hashintel/ds-helpers/css";

import { ActiveNetContext } from "../../../../../../react/state/active-net-context";
import { CompositionContext } from "../../../../../../react/state/composition-context";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { useIsReadOnly } from "../../../../../../react/state/use-is-read-only";
import { ComponentGlyph } from "../../../../../components/component-glyph";
import { writeDraggedComponent } from "../../../../shared/canvas-node-drag";

import type { SubView } from "../../../../../components/sub-view/types";

const listStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[1px]",
  mx: "-1",
});

const rowStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "2",
    minHeight: "8",
    p: "1",
    borderRadius: "lg",
    textAlign: "left",
    color: "neutral.s115",
    cursor: "grab",
    transition: "[background-color 100ms ease-out]",
    _hover: { backgroundColor: "neutral.bg.surface.hover" },
    _focusVisible: {
      outline: "none",
      backgroundColor: "neutral.bg.surface.hover",
    },
    _disabled: { cursor: "default", opacity: "[0.5]" },
  },
  variants: {
    armed: {
      true: {
        backgroundColor: "blue.s30",
        _hover: { backgroundColor: "blue.s40" },
        _focusVisible: { backgroundColor: "blue.s40" },
      },
    },
  },
});

const glyphStyle = css({
  flexShrink: 0,
  display: "flex",
  color: "neutral.s70",
});

const textStyle = css({
  display: "flex",
  flexDirection: "column",
  minWidth: "0",
});

const nameStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const descriptionStyle = css({
  fontSize: "xs",
  color: "neutral.s85",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

/**
 * The components the host provides. Clicking one arms it, so the next click
 * on the canvas places an instance; dragging one onto the canvas places an
 * instance where it is dropped. Instances go into the root net, as the
 * toolbar's component tool has it.
 */
const ComponentsPanel: React.FC = () => {
  const { provided } = use(CompositionContext);
  const {
    editionMode,
    componentSubnetId,
    setAddComponentMode,
    setEditionMode,
  } = use(EditorContext);
  const { activeSubnetId } = use(ActiveNetContext);
  const isReadOnly = useIsReadOnly();
  const canPlace = !isReadOnly && activeSubnetId === null;

  return (
    <div className={listStyle}>
      {[...provided.values()].map((component) => {
        const armed =
          editionMode === "add-component" && componentSubnetId === component.id;
        return (
          <button
            key={component.id}
            type="button"
            className={rowStyle({ armed })}
            disabled={!canPlace}
            draggable={canPlace}
            aria-pressed={armed}
            onClick={() =>
              armed
                ? setEditionMode("cursor")
                : setAddComponentMode(component.id)
            }
            onDragStart={(event) => {
              // eslint-disable-next-line no-param-reassign
              event.dataTransfer.effectAllowed = "move";
              writeDraggedComponent(event.dataTransfer, component.id);
            }}
          >
            <span
              className={glyphStyle}
              style={
                component.displayColor
                  ? { color: component.displayColor }
                  : undefined
              }
            >
              <ComponentGlyph
                iconSvg={component.iconSvg}
                fallback="cube"
                size="sm"
              />
            </span>
            <span className={textStyle}>
              <span className={nameStyle}>{component.name}</span>
              {component.description ? (
                <span className={descriptionStyle}>
                  {component.description}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export const componentsSubView: SubView = {
  id: "components",
  title: "Components",
  tooltip:
    "The components this editor provides. Click one, then the canvas, to place an instance of it, or drag it onto the canvas.",
  component: ComponentsPanel,
};
