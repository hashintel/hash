import {
  type ReactNode,
  use,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useState,
} from "react";

import { Button, Icon, Menu } from "@hashintel/ds-components";
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
  useAssistantChoice,
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
    compact: {
      true: {
        top: "[auto]",
        bottom: "[12px]",
        right: "[12px]",
        height: "auto",
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
  },
});

const resizeAnchorStyle = cva({
  base: {
    position: "absolute",
    top: "[0]",
    bottom: "[0]",
    left: "[0]",
    width: "[0]",
  },
  variants: { compact: { true: { display: "none" } } },
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
    floating: {
      true: {
        borderLeftColor: "[transparent]",
        borderRadius: "xl",
        boxShadow:
          "[0 0 0 1px rgba(0,0,0,0.08), 0 4px 8px -4px rgba(0,0,0,0.12), 0 12px 32px -12px rgba(0,0,0,0.16)]",
      },
    },
    // A dock's content may overflow it, for a popover above.
    compact: {
      true: { overflow: "visible" },
    },
  },
});

const headerStyle = cva({
  base: {
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
  },
  variants: { compact: { true: { display: "none" } } },
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
  "[data-assistant-switcher] + &": { marginLeft: "[6px]" },
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

// Positioned, so it paints above the drag handle, right after its icon.
const switcherStyle = css({
  position: "relative",
  display: "flex",
  marginLeft: "[18px]",
});

/** Switches between the running plugins' assistants, while there are several. */
const AssistantSwitcher = () => {
  const { assistants, shownId, choose } = useAssistantChoice();

  return assistants.length > 1 ? (
    <div className={switcherStyle} data-assistant-switcher>
      <Menu
        position="bottom-start"
        items={assistants.map(({ id, name }) => ({
          id,
          text: name,
          selected: id === shownId,
          onClick: choose,
        }))}
        trigger={
          <Button
            size="xs"
            variant="ghost"
            className={buttonStyle}
            aria-label="Switch AI assistant"
            prefix={<Icon name="chevronDown" size="xs" />}
            tooltip="Switch AI assistant"
          />
        }
      />
    </div>
  ) : null;
};

/**
 * The AI assistant panel around a plugin's content: the space it takes beside
 * the canvas, its docked or floating placement, resizing, and a title bar with
 * the assistant icon, the dock toggle and Close. The content fills the rest,
 * and the title bar through `AssistantPanelTitle`; it reads `panel` with
 * `useAssistantPanel`. Compact, the panel is a dock in the canvas's corner
 * without its title bar, and the canvas's controls clear its height.
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
    setAiAssistantDockHeight,
    setAiAssistantPlacement,
    setAiAssistantWidth,
  } = use(EditorContext);
  const { isOpen, close, compact } = panel;

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

  // The canvas's controls clear the dock's height, measured as it changes.
  const reportDockHeight = useEffectEvent((height: number | null) =>
    setAiAssistantDockHeight(height),
  );
  useLayoutEffect(() => {
    const panelElement = panelRef.current;
    if (!isOpen || !compact || panelElement === null) {
      return;
    }
    const measure = () =>
      reportDockHeight(panelElement.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panelElement);

    return () => {
      observer.disconnect();
      reportDockHeight(null);
    };
  }, [compact, isOpen, panelRef]);

  // Opening the panel moves focus to the content's element marked
  // `data-autofocus`, or else to the panel. An expanded panel that already
  // holds focus keeps it; a dock focuses itself.
  useEffect(() => {
    const panelElement = panelRef.current;
    if (
      !isOpen ||
      panelElement === null ||
      (!compact && panelElement.contains(document.activeElement))
    ) {
      return;
    }
    const target = compact
      ? panelElement
      : (panelElement.querySelector<HTMLElement>("[data-autofocus]") ??
        panelElement);
    target.focus({ preventScroll: true });
  }, [compact, focusRequest, isOpen, panelRef]);

  return (
    <AssistantPanelContext value={panel}>
      <AssistantTitleBarContext
        value={{ title: titleElement, actions: actionsElement }}
      >
        <div
          aria-hidden="true"
          className={dockSpaceStyle}
          data-animating={animating}
          style={{ width: isOpen && !isFloating && !compact ? panelWidth : 0 }}
        />
        <aside
          ref={panelRef}
          aria-hidden={!isOpen ? true : undefined}
          aria-label="AI assistant"
          tabIndex={-1}
          inert={!isOpen}
          className={shellStyle({
            compact,
            open: isOpen,
            floating: isFloating && !compact,
          })}
          data-placement={aiAssistantPlacement}
          data-compact={compact}
          data-animating={animating}
          style={{
            width: panelWidth,
            ...(isFloating && !compact ? floatingPositionStyle : {}),
          }}
        >
          {isFloating && !compact ? (
            <FloatingResizeHandles
              label="AI assistant"
              getHandleProps={getResizeHandleProps}
            />
          ) : (
            <div className={resizeAnchorStyle({ compact })}>
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
            className={cardStyle({ floating: isFloating || compact, compact })}
            data-animating={animating}
          >
            <div className={headerStyle({ compact })}>
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
              <AssistantSwitcher />
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
                onClick={close}
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
