import { use } from "react";

import { css, cva, cx } from "@hashintel/ds-helpers/css";
import {
  isInterface,
  sameComponent,
  type ComponentReference,
  type ImportState,
  type Subnet,
} from "@hashintel/petrinaut-core";

import { ActiveNetContext } from "../../../../../../react/state/active-net-context";
import { CompositionContext } from "../../../../../../react/state/composition-context";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { useIsReadOnly } from "../../../../../../react/state/use-is-read-only";
import { ComponentGlyph } from "../../../../../components/component-glyph";
import { problemTextStyle } from "../../../../../constants/problem-severity";
import { writeDraggedComponent } from "../../../../shared/canvas-node-drag";

import type { SubView } from "../../../../../components/sub-view/types";

const panelStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "3",
});

const libraryNameStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s85",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

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

const noteStyle = css({
  fontSize: "xs",
  color: "neutral.s85",
});

/**
 * One component of a library. Clicking it arms it, so the next click on the
 * canvas places an instance; dragging it onto the canvas places an instance
 * where it is dropped.
 */
const ComponentRow: React.FC<{
  reference: ComponentReference;
  component: Subnet;
  canPlace: boolean;
}> = ({ reference, component, canPlace }) => {
  const { editionMode, componentToAdd, setAddComponentMode, setEditionMode } =
    use(EditorContext);
  const armed =
    editionMode === "add-component" &&
    componentToAdd !== null &&
    sameComponent(componentToAdd, reference);

  return (
    <button
      type="button"
      className={rowStyle({ armed })}
      disabled={!canPlace}
      draggable={canPlace}
      aria-pressed={armed}
      onClick={() =>
        armed ? setEditionMode("cursor") : setAddComponentMode(reference)
      }
      onDragStart={(event) => {
        // eslint-disable-next-line no-param-reassign
        event.dataTransfer.effectAllowed = "move";
        writeDraggedComponent(event.dataTransfer, reference);
      }}
    >
      <span className={glyphStyle} style={{ color: component.displayColor }}>
        <ComponentGlyph
          iconSvg={component.iconSvg}
          fallback={isInterface(component) ? "puzzlePiece" : "cube"}
          size="sm"
        />
      </span>
      <span className={textStyle}>
        <span className={nameStyle}>{component.name}</span>
        {component.description ? (
          <span className={descriptionStyle}>{component.description}</span>
        ) : null}
      </span>
    </button>
  );
};

/** A library on offer: its components once it resolved, and until then where it stands. */
const LibraryGroup: React.FC<{
  id: string;
  state: ImportState | undefined;
  canPlace: boolean;
}> = ({ id, state, canPlace }) => {
  if (state?.status !== "resolved") {
    return (
      <section aria-label={id}>
        <div className={libraryNameStyle}>{id}</div>
        {state?.status === "resolving" ? (
          <div className={noteStyle}>Resolving</div>
        ) : (
          <div
            className={cx(noteStyle, problemTextStyle)}
            data-severity="error"
          >
            {state?.message ?? "This library did not resolve."}
          </div>
        )}
      </section>
    );
  }
  const { library } = state;
  return (
    <section aria-label={library.name}>
      <div className={libraryNameStyle}>{library.name}</div>
      <div className={listStyle}>
        {library.components.map((component) => (
          <ComponentRow
            key={component.id}
            reference={{ from: id, id: component.id }}
            component={component}
            canPlace={canPlace}
          />
        ))}
      </div>
    </section>
  );
};

/**
 * The components of the libraries on offer, each under its library's name.
 * Instances go into the root net, as the toolbar's component tool has it.
 */
const ComponentsPanel: React.FC = () => {
  const { imports, offered } = use(CompositionContext);
  const { activeSubnetId } = use(ActiveNetContext);
  const isReadOnly = useIsReadOnly();
  const canPlace = !isReadOnly && activeSubnetId === null;

  return (
    <div className={panelStyle}>
      {offered.map((id) => (
        <LibraryGroup
          key={id}
          id={id}
          state={imports.get(id)}
          canPlace={canPlace}
        />
      ))}
    </div>
  );
};

export const componentsSubView: SubView = {
  id: "components",
  title: "Components",
  tooltip:
    "The components of the libraries this editor offers. Click one, then the canvas, to place an instance of it, or drag it onto the canvas.",
  component: ComponentsPanel,
};
