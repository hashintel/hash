import { type ReactNode, use, useEffect, useState } from "react";

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
 * `useAssistantPanel`.
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
  } = use(EditorContext);
  const { isOpen, close } = panel;

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

  // Opening the panel moves focus to the content's element marked
  // `data-autofocus`, or else to the panel, unless focus is already inside.
  useEffect(() => {
    const panelElement = panelRef.current;
    if (
      !isOpen ||
      panelElement === null ||
      panelElement.contains(document.activeElement)
    ) {
      return;
    }
    const target =
      panelElement.querySelector<HTMLElement>("[data-autofocus]") ??
      panelElement;
    target.focus({ preventScroll: true });
  }, [focusRequest, isOpen, panelRef]);

  return (
    <AssistantPanelContext value={panel}>
      <AssistantTitleBarContext
        value={{ title: titleElement, actions: actionsElement }}
      >
        <div
          aria-hidden="true"
          className={dockSpaceStyle}
          data-animating={animating}
          style={{ width: isOpen && !isFloating ? panelWidth : 0 }}
        />
        <aside
          ref={panelRef}
          aria-hidden={!isOpen ? true : undefined}
          aria-label="AI assistant"
          tabIndex={-1}
          inert={!isOpen}
          className={shellStyle({ open: isOpen, floating: isFloating })}
          data-placement={aiAssistantPlacement}
          data-animating={animating}
          style={{
            width: panelWidth,
            ...(isFloating ? floatingPositionStyle : {}),
          }}
        >
          {isFloating ? (
            <FloatingResizeHandles
              label="AI assistant"
              getHandleProps={getResizeHandleProps}
            />
          ) : (
            <div className={resizeAnchorStyle}>
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
            className={cardStyle({ floating: isFloating })}
            data-animating={animating}
          >
            <div className={headerStyle}>
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

/**
 * Renders `children` as a plugin's `assistant.content` in the assistant
 * panel, outside an editor, for stories and tests. The panel starts open and
 * docked; `state` overrides any of its state. Its dock toggle and resizing
 * work as in the editor.
 */
export const AssistantPanelPreview = ({
  state,
  children,
}: {
  state?: Partial<AssistantPanel>;
  children: ReactNode;
}) => {
  const editor = use(EditorContext);
  const [placement, setPlacement] = useState(editor.aiAssistantPlacement);
  const [width, setWidth] = useState(editor.aiAssistantWidth);

  return (
    <EditorContext
      value={{
        ...editor,
        aiAssistantPlacement: placement,
        setAiAssistantPlacement: setPlacement,
        aiAssistantWidth: width,
        setAiAssistantWidth: setWidth,
      }}
    >
      <PluginAssistantPanel
        panel={{ isOpen: true, close: () => {}, ...state }}
        focusRequest={0}
      >
        {children}
      </PluginAssistantPanel>
    </EditorContext>
  );
};
