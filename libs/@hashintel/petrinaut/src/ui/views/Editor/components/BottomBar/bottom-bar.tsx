import { use, useCallback, useEffect, useRef, useState } from "react";

import { Icon } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";
import { refractive } from "@hashintel/refractive";

import { LanguageClientContext } from "../../../../../react/lsp/context";
import { ActiveNetContext } from "../../../../../react/state/active-net-context";
import {
  type CursorMode,
  EditorContext,
  type EditorState,
} from "../../../../../react/state/editor-context";
import { AiAssistantIcon } from "../../../../components/ai-assistant-icon";
import {
  VIEWPORT_CONTROLS_OFFSET,
  VIEWPORT_CONTROLS_WIDTH,
} from "../../../../constants/ui";
import { fitsWithinBounds, getBottomBarOffset } from "./bottom-bar-placement";
import {
  BottomBarCollapseContext,
  type CollapsibleGroupWidth,
} from "./collapse-context";
import { CollapsibleGroup } from "./collapsible-group";
import { DiagnosticsIndicator } from "./diagnostics-indicator";
import { SimulationControls } from "./simulation-controls";
import { ToolbarButton } from "./toolbar-button";
import { ToolbarDivider } from "./toolbar-divider";
import { CursorModeDropdown, EditionTools } from "./toolbar-modes";
import { useElementWidth } from "./use-element-width";
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts";

/** Gap kept between the bar and a panel it has been pushed away from. */
const BOTTOM_BAR_MARGIN = 12;

const glassPanelStyle = css({
  padding: "1",
  backgroundColor: "white.a95",
  borderWidth: "thin",
  borderColor: "neutral.a50",
  boxShadow: "[0 3px 11px rgba(0, 0, 0, 0.1)]",
  // Named rather than `all`: the segment's width changes when a group
  // collapses, and `all` animated that over 0.3s on top of the group's own
  // 150ms, which left the bar drifting past its place and back.
  transition: "[background-color 0.3s ease, box-shadow 0.3s ease]",
  _hover: {
    backgroundColor: "white.a110",
    boxShadow: "[0 4px 13px rgba(0, 0, 0, 0.15)]",
  },
});

const toolbarContainerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
});

// Spans the canvas so the bar centers on the canvas rather than on the space
// between the panels, and lets clicks through everywhere the bar itself is not.
const bottomBarLaneStyle = css({
  position: "absolute",
  left: "[0]",
  right: "[0]",
  display: "flex",
  justifyContent: "center",
  pointerEvents: "none",
  zIndex: "[calc(var(--z-index-sticky) + 1)]",
});

const bottomBarStyle = css({
  display: "flex",
  gap: "[20px]",
  pointerEvents: "auto",
});

/**
 * Only a panel opening or closing animates the bar into place. A collapse
 * moves it too, but there the offset follows the width the bar is measured at,
 * frame by frame, and a transition would race that with a curve of its own.
 * A resize drag wants no transition either: the bar tracks the panel edge.
 */
const animatingStyle = cva({
  base: {},
  variants: {
    animating: {
      true: {
        transition: "[bottom 150ms ease-in-out]",
      },
    },
  },
});

const barAnimatingStyle = cva({
  base: {},
  variants: {
    animating: {
      true: {
        transition: "[transform 150ms ease-in-out]",
        "@media (prefers-reduced-motion: reduce)": {
          transition: "[none]",
        },
      },
    },
  },
});

type EditorMode = EditorState["globalMode"];
type EditorEditionMode = EditorState["editionMode"];

interface BottomBarProps {
  mode: EditorMode;
  editionMode: EditorEditionMode;
  onEditionModeChange: (mode: EditorEditionMode) => void;
  cursorMode: CursorMode;
  onCursorModeChange: (mode: CursorMode) => void;
  hasAiAssistant: boolean;
}

export const BottomBar: React.FC<BottomBarProps> = ({
  mode,
  editionMode,
  hasAiAssistant,
  onEditionModeChange,
  cursorMode,
  onCursorModeChange,
}) => {
  const isActualMode = mode === "actual";
  const {
    isBottomPanelOpen,
    setBottomPanelOpen,
    setActiveBottomPanelTab,
    bottomPanelHeight,
    isAiAssistantOpen,
    isPanelAnimating,
    isLeftSidebarOpen,
    isSearchOpen,
    leftSidebarWidth,
    hasSelection,
    propertiesPanelWidth,
    toggleAiAssistant,
  } = use(EditorContext);

  // Only error-severity diagnostics block simulation — warnings and hints
  // (e.g. HIR semantic lints) are informational.
  const { errorDiagnosticsCount } = use(LanguageClientContext);
  const hasDiagnostics = errorDiagnosticsCount > 0;
  const { activeSubnetId } = use(ActiveNetContext);
  const isInSubnet = activeSubnetId !== null;

  const showDiagnostics = useCallback(() => {
    setBottomPanelOpen(true);
    setActiveBottomPanelTab("diagnostics");
  }, [setBottomPanelOpen, setActiveBottomPanelTab]);

  const toggleBottomPanel = useCallback(() => {
    setBottomPanelOpen(!isBottomPanelOpen);
  }, [setBottomPanelOpen, isBottomPanelOpen]);

  // Fallback to cursor mode when switching away from edit while in a mutative mode.
  useEffect(() => {
    if (mode !== "edit" && editionMode !== "cursor") {
      onEditionModeChange("cursor");
    }
  }, [mode, editionMode, onEditionModeChange]);

  // Setup keyboard shortcuts
  useKeyboardShortcuts(mode, onEditionModeChange, onCursorModeChange);

  const laneRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const containerWidth = useElementWidth(laneRef);
  const barWidth = useElementWidth(barRef);

  const [groupWidths, setGroupWidths] = useState<
    ReadonlyMap<string, CollapsibleGroupWidth>
  >(() => new Map());

  // Identity is load-bearing rather than a performance nicety: every group
  // measures from an effect keyed on this callback, and a new one each render
  // would tear the observers down and report a width in a loop.
  const reportGroupWidth = useCallback(
    (id: string, width: CollapsibleGroupWidth | null) => {
      setGroupWidths((previous) => {
        const current = previous.get(id);
        if (width === null) {
          if (!current) {
            return previous;
          }
          const next = new Map(previous);
          next.delete(id);
          return next;
        }
        if (
          current &&
          current.natural === width.natural &&
          current.hidden === width.hidden
        ) {
          return previous;
        }
        return new Map(previous).set(id, width);
      });
    },
    [],
  );

  const [isPointerOver, setIsPointerOver] = useState(false);
  const [isFocusWithin, setIsFocusWithin] = useState(false);
  const [hasActiveInteraction, setHasActiveInteraction] = useState(false);

  // A menu opened from the bar renders outside it, so the pointer leaving for
  // the menu would otherwise collapse the bar out from under the click that
  // opened it. A click inside the bar holds it expanded until one lands
  // elsewhere.
  useEffect(() => {
    if (!hasActiveInteraction) {
      return;
    }

    const release = (event: PointerEvent) => {
      const bar = barRef.current;
      if (bar && event.target instanceof Node && bar.contains(event.target)) {
        return;
      }
      setHasActiveInteraction(false);
    };

    document.addEventListener("pointerdown", release);
    return () => document.removeEventListener("pointerdown", release);
  }, [hasActiveInteraction]);

  const bounds = {
    containerWidth,
    leftInset: isLeftSidebarOpen || isSearchOpen ? leftSidebarWidth : 0,
    // The viewport controls sit in the bar's row on the right of the canvas,
    // so they bound it the same way a panel does.
    rightInset:
      (hasSelection ? propertiesPanelWidth : 0) +
      (isActualMode ? 0 : VIEWPORT_CONTROLS_OFFSET + VIEWPORT_CONTROLS_WIDTH),
    margin: BOTTOM_BAR_MARGIN,
  };

  let hiddenWidth = 0;
  for (const width of groupWidths.values()) {
    hiddenWidth += width.hidden;
  }

  // What the bar measures now plus what it is already hiding: the width it
  // would take with every control shown. Both terms move together while a
  // group collapses, so the sum holds still throughout.
  const naturalWidth = barWidth + hiddenWidth;
  const isPeeking = isPointerOver || isFocusWithin || hasActiveInteraction;
  const isCollapsed = !isPeeking && !fitsWithinBounds(bounds, naturalWidth);

  // Calculate bottom offset based on bottom panel visibility
  const bottomOffset = isBottomPanelOpen
    ? bottomPanelHeight + 24 // panel height + margin + spacing
    : 24;

  return (
    <div
      ref={laneRef}
      className={`${bottomBarLaneStyle} ${animatingStyle({ animating: isPanelAnimating })}`}
      style={{ bottom: bottomOffset }}
    >
      <div
        ref={barRef}
        className={`${bottomBarStyle} ${barAnimatingStyle({ animating: isPanelAnimating })}`}
        style={{
          transform: `translateX(${getBottomBarOffset(bounds, barWidth)}px)`,
        }}
        onPointerEnter={() => setIsPointerOver(true)}
        onPointerLeave={() => setIsPointerOver(false)}
        onPointerDown={() => setHasActiveInteraction(true)}
        onFocus={() => setIsFocusWithin(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setIsFocusWithin(false);
          }
        }}
      >
        <BottomBarCollapseContext value={{ isCollapsed, reportGroupWidth }}>
          {/* Edition tools segment */}
          <refractive.div
            className={glassPanelStyle}
            refraction={{
              radius: 8,
              blur: 3,
              bezelWidth: 20,
              glassThickness: 100,
            }}
          >
            <div className={toolbarContainerStyle}>
              <CursorModeDropdown
                editionMode={editionMode}
                onEditionModeChange={onEditionModeChange}
                cursorMode={cursorMode}
                onCursorModeChange={onCursorModeChange}
              />
              {!isActualMode && (
                <CollapsibleGroup>
                  <EditionTools
                    editionMode={editionMode}
                    onEditionModeChange={onEditionModeChange}
                  />
                  {hasAiAssistant && (
                    <>
                      <ToolbarDivider />
                      <ToolbarButton
                        tooltip={
                          isAiAssistantOpen
                            ? "Hide AI assistant"
                            : "Show AI assistant"
                        }
                        onClick={toggleAiAssistant}
                        isSelected={isAiAssistantOpen}
                        ariaLabel={
                          isAiAssistantOpen
                            ? "Hide AI assistant"
                            : "Show AI assistant"
                        }
                        ariaExpanded={isAiAssistantOpen}
                      >
                        <AiAssistantIcon size={18} />
                      </ToolbarButton>
                    </>
                  )}
                </CollapsibleGroup>
              )}
            </div>
          </refractive.div>

          {/* Playback segment */}
          <refractive.div
            className={glassPanelStyle}
            refraction={{
              radius: 8,
              blur: 3,
              bezelWidth: 20,
              glassThickness: 100,
            }}
          >
            <div className={toolbarContainerStyle}>
              <ToolbarButton
                tooltip={isBottomPanelOpen ? "Hide Panel" : "Show Panel"}
                onClick={toggleBottomPanel}
                ariaLabel={isBottomPanelOpen ? "Hide panel" : "Show panel"}
                ariaExpanded={isBottomPanelOpen}
              >
                {isBottomPanelOpen ? (
                  <Icon name="chevronDown" size="sm" />
                ) : (
                  <Icon name="chevronUp" size="sm" />
                )}
              </ToolbarButton>
              {!isActualMode && (
                <>
                  <DiagnosticsIndicator
                    onClick={showDiagnostics}
                    isExpanded={isBottomPanelOpen}
                  />
                  <ToolbarDivider />
                  <SimulationControls
                    disabled={hasDiagnostics}
                    inSubnet={isInSubnet}
                  />
                </>
              )}
            </div>
          </refractive.div>
        </BottomBarCollapseContext>
      </div>
    </div>
  );
};
