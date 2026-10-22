import {
  type ReactNode,
  use,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { Button } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { EditorContext } from "../../../../react/state/editor-context";
import { AiAssistantIcon } from "../../../components/ai-assistant-icon";
import {
  ExperimentalIcon,
  useExperimentalIconMotionAllowed,
} from "../../../experimental-icons";
import {
  type AssistantPanel,
  AssistantPanelContext,
  AssistantTitleBarContext,
} from "../../../plugins/plugin-assistant";
import { ResizeHandle } from "../../../resize/resize-handle";
import { FloatingResizeHandles } from "../shared/floating-resize-handles";
import { useFloatingPanel } from "../shared/use-floating-panel";

const dockSpaceStyle = css({
  flexShrink: 0,
  minWidth: "[0]",
  maxWidth: "[100%]",
  pointerEvents: "none",
  '&[data-animating="true"]': {
    transition: "[width 150ms ease-in-out]",
    "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
  },
});

const shellStyle = cva({
  base: {
    position: "absolute",
    top: "[0]",
    right: "[0]",
    height: "full",
    maxHeight: "full",
    maxWidth: "full",
    transform: "[translateX(0)]",
    visibility: "visible",
    zIndex: "[calc(var(--z-index-sticky) + 2)]",
    pointerEvents: "auto",
    '&[data-animating="true"]': {
      transition:
        "[top 150ms ease-in-out, right 150ms ease-in-out, height 150ms ease-in-out, max-height 150ms ease-in-out, transform 150ms ease-in-out, visibility 0s]",
      "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
    },
  },
  variants: {
    floating: {
      true: {
        top: "[12px]",
        right: "[12px]",
        height: "[calc(100% - 24px)]",
        maxHeight: "[640px]",
        maxWidth: "[calc(100% - 24px)]",
      },
    },
    open: {
      false: {
        transform: "[translateX(100%)]",
        visibility: "hidden",
        pointerEvents: "none",
        '&[data-animating="true"]': {
          transitionDelay: "[0s, 0s, 0s, 0s, 0s, 150ms]",
        },
      },
    },
    collapsed: {
      true: {
        top: "[auto]",
        bottom: "[12px]",
        right: "[12px]",
        height: "auto",
        maxWidth: "[calc(100% - 24px)]",
      },
    },
  },
});

const resizeAnchorStyle = css({
  position: "absolute",
  top: "[0]",
  bottom: "[0]",
  left: "[0]",
  width: "[0]",
});

const cardStyle = cva({
  base: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    height: "full",
    overflow: "hidden",
    backgroundColor: "neutral.s00",
    borderLeft: "[1px solid {colors.neutral.s40}]",
    borderRadius: "[0]",
    '&[data-animating="true"]': {
      transition:
        "[border-radius 150ms ease-in-out, box-shadow 150ms ease-in-out]",
      "@media (prefers-reduced-motion: reduce)": { transition: "[none]" },
    },
  },
  variants: {
    // A collapsed panel's content may overflow its dock, for a popover above it.
    collapsed: {
      true: { overflow: "visible" },
    },
    floating: {
      true: {
        borderLeftColor: "[transparent]",
        borderRadius: "xl",
        boxShadow:
          "[0 0 0 1px rgba(0,0,0,0.08), 0 4px 8px -4px rgba(0,0,0,0.12), 0 12px 32px -12px rgba(0,0,0,0.16)]",
      },
    },
  },
});

/** Hides a part of the panel without unmounting it while the panel is collapsed. */
const panelPartStyle = cva({
  variants: {
    visible: {
      false: { display: "none" },
    },
  },
});

const headerStyle = css({
  position: "relative",
  userSelect: "none",
  display: "flex",
  alignItems: "center",
  gap: "1",
  height: "[40px]",
  paddingLeft: "3",
  paddingRight: "2",
  borderBottom: "[1px solid {colors.neutral.bd.subtle}]",
  flexShrink: 0,
});

// Covers the whole title bar, so a floating panel drags from any spot the
// title leaves free.
const headerLabelStyle = css({
  position: "absolute",
  inset: "[0]",
  width: "[100%]",
  display: "flex",
  alignItems: "center",
  minWidth: "[0]",
  color: "neutral.fg.heading",
  border: "none",
  padding: "[0 12px]",
  backgroundColor: "[transparent]",
  textAlign: "left",
  _enabled: {
    cursor: "grab",
    touchAction: "none",
    _active: { cursor: "grabbing" },
  },
  _focusVisible: {
    outline: "[2px solid {colors.blue.s50}]",
    outlineOffset: "[-2px]",
  },
  '&[data-icon-motion="true"] > svg': {
    transition: "[transform 180ms ease-out]",
  },
  '&[data-icon-motion="true"]:is(:hover, :focus-visible) > svg': {
    transform: "[rotate(8deg) scale(1.06)]",
  },
  '&[data-icon-motion="true"]:active > svg': {
    transform: "[rotate(-8deg) scale(0.94)]",
  },
});

// Clicks on the title's text and containers, such as a tab list, reach the
// drag handle beneath it. Its controls take their own: a container with
// `tabindex="-1"` only receives focus from code, so it stays a drag area.
const titleStyle = css({
  position: "relative",
  flex: "[1]",
  minWidth: "[0]",
  display: "flex",
  alignItems: "center",
  marginLeft: "[24px]",
  color: "neutral.fg.heading",
  fontSize: "sm",
  fontWeight: "medium",
  whiteSpace: "nowrap",
  pointerEvents: "none",
  "& :is(button, a, input, select, textarea, [tabindex]:not([tabindex='-1']))":
    {
      pointerEvents: "auto",
    },
});

// A positioned row paints above the drag handle, so every button in it takes
// clicks, whatever its own styles. Hidden while empty, so it adds no gap.
const actionsStyle = css({
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: "1",
  _empty: { display: "none" },
});

const buttonStyle = css({
  position: "relative",
  color: "neutral.s90",
  _hover: {
    color: "neutral.s110",
  },
});

/**
 * The AI assistant panel around a plugin's content: the space it takes beside
 * the canvas, its docked or floating placement, resizing, and a title bar with
 * the assistant icon, the dock toggle and Close. The content fills the rest,
 * and the title bar through `AssistantPanelTitle`; it reads `panel` with
 * `useAssistantPanel`. Collapsed, the panel shrinks to a dock in the corner,
 * hides its title bar and resizing, and reports the dock's height for the
 * canvas insets.
 */
export const PluginAssistantPanel = ({
  panel,
  focusRequest,
  children,
}: {
  panel: AssistantPanel;
  /** Changes each time the user opens the panel; the panel then takes focus. */
  focusRequest: number;
  children: ReactNode;
}) => {
  const {
    aiAssistantPlacement,
    aiAssistantWidth,
    isPanelAnimating,
    setAiAssistantPlacement,
    setAiAssistantWidth,
    setAiAssistantDockHeight,
  } = use(EditorContext);
  const { isOpen, close, collapsed } = panel;

  const isFloating = aiAssistantPlacement === "floating";
  const HeaderLabel = isFloating ? "button" : "div";
  const iconMotionAllowed = useExperimentalIconMotionAllowed();
  const {
    panelRef,
    isInteracting,
    handleProps,
    getResizeHandleProps,
    style: floatingPositionStyle,
  } = useFloatingPanel({
    width: aiAssistantWidth,
    onWidthChange: setAiAssistantWidth,
  });
  const panelWidth = `min(${aiAssistantWidth}px, 100cqw)`;
  const animating = isPanelAnimating && !isInteracting;
  const placementLabel = isFloating
    ? "Dock AI assistant"
    : "Float AI assistant";

  const [titleElement, setTitleElement] = useState<HTMLElement | null>(null);
  const [actionsElement, setActionsElement] = useState<HTMLElement | null>(
    null,
  );
  // The handler `AssistantPanelTitle` registers, run by Close before it closes.
  const closeHandlerRef = useRef<(() => void) | undefined>(undefined);
  const [setCloseHandler] = useState(
    () => (handler: (() => void) | undefined) => {
      closeHandlerRef.current = handler;
    },
  );

  // The collapsed dock reports its height, so the canvas's viewport controls
  // clear it.
  const reportDockHeight = useEffectEvent((height: number | null) => {
    setAiAssistantDockHeight(height);
  });
  useLayoutEffect(() => {
    const shell = panelRef.current;
    if (!isOpen || !collapsed || !shell) {
      return;
    }
    const measure = () =>
      reportDockHeight(shell.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    return () => {
      observer.disconnect();
      reportDockHeight(null);
    };
  }, [isOpen, collapsed, panelRef]);

  // Opening or expanding the panel moves focus to the content's element
  // marked `data-autofocus`, or else to the panel. Otherwise an expanded panel
  // that already holds focus keeps it, and a collapsed panel focuses itself.
  const wasCollapsedRef = useRef(collapsed);
  useEffect(() => {
    const expanded = wasCollapsedRef.current && !collapsed;
    wasCollapsedRef.current = collapsed;
    const panelElement = panelRef.current;
    if (
      !isOpen ||
      panelElement === null ||
      (!collapsed && !expanded && panelElement.contains(document.activeElement))
    ) {
      return;
    }
    const autofocusTarget =
      panelElement.querySelector<HTMLElement>("[data-autofocus]");
    const target =
      !collapsed && autofocusTarget && !autofocusTarget.matches(":disabled")
        ? autofocusTarget
        : panelElement;
    target.focus({ preventScroll: true });
  }, [collapsed, focusRequest, isOpen, panelRef]);

  const isFloatingPanel = isFloating && !collapsed;

  return (
    <AssistantPanelContext value={panel}>
      <AssistantTitleBarContext
        value={{
          title: titleElement,
          actions: actionsElement,
          setCloseHandler,
        }}
      >
        <div
          aria-hidden="true"
          className={dockSpaceStyle}
          data-animating={animating}
          style={{
            width: isOpen && !isFloating && !collapsed ? panelWidth : 0,
          }}
        />
        <aside
          ref={panelRef}
          aria-hidden={!isOpen ? true : undefined}
          aria-label="AI assistant"
          tabIndex={-1}
          inert={!isOpen}
          className={shellStyle({
            collapsed,
            open: isOpen,
            floating: isFloatingPanel,
          })}
          data-placement={aiAssistantPlacement}
          data-animating={animating}
          style={{
            width: panelWidth,
            ...(isFloatingPanel ? floatingPositionStyle : {}),
          }}
        >
          {isFloatingPanel ? (
            <FloatingResizeHandles
              label="AI assistant"
              getHandleProps={getResizeHandleProps}
            />
          ) : (
            <div
              className={`${resizeAnchorStyle} ${panelPartStyle({
                visible: !collapsed,
              })}`}
            >
              <ResizeHandle
                edge="left"
                appearance="hidden"
                size={aiAssistantWidth}
                onResize={setAiAssistantWidth}
                minSize={320}
                maxSize={720}
                label="Resize AI assistant"
              />
            </div>
          )}
          <div
            className={cardStyle({
              floating: isFloating || collapsed,
              collapsed,
            })}
            data-animating={animating}
          >
            <div
              className={`${headerStyle} ${panelPartStyle({
                visible: !collapsed,
              })}`}
            >
              <HeaderLabel
                type={isFloating ? "button" : undefined}
                className={headerLabelStyle}
                data-icon-motion={iconMotionAllowed}
                aria-label={isFloating ? "Move AI assistant" : undefined}
                title={
                  isFloating ? "Drag to move, or use the arrow keys" : undefined
                }
                {...(isFloating ? handleProps : {})}
              >
                <AiAssistantIcon size={16} />
              </HeaderLabel>
              <div ref={setTitleElement} className={titleStyle} />
              <Button
                size="xs"
                variant="ghost"
                className={buttonStyle}
                aria-label={placementLabel}
                onClick={() =>
                  setAiAssistantPlacement(isFloating ? "docked" : "floating")
                }
                prefix={
                  <ExperimentalIcon
                    name={isFloating ? "sidebar" : "externalLink"}
                    size={14}
                  />
                }
                tooltip={placementLabel}
              />
              <div ref={setActionsElement} className={actionsStyle} />
              <Button
                size="xs"
                variant="ghost"
                className={buttonStyle}
                aria-label="Close AI assistant"
                onClick={() => {
                  closeHandlerRef.current?.();
                  close();
                }}
                prefix={<ExperimentalIcon name="close" size={14} />}
                tooltip="Close AI assistant"
              />
            </div>
            {children}
          </div>
        </aside>
      </AssistantTitleBarContext>
    </AssistantPanelContext>
  );
};
