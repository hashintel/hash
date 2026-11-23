import { type ReactNode, useEffect, useState } from "react";

import { Button, Icon, Menu } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";
import { HashIcon, useHashIconMotionAllowed } from "@hashintel/ds-icons";

import {
  useEditorActions,
  useEditorState,
} from "../../../../react/state/editor-context";
import { usePanelPresence } from "../../../../react/state/panel-presence-context";
import { usePanelSizes } from "../../../../react/state/panel-sizes-context";
import { useUserSettings } from "../../../../react/state/user-settings-context";
import {
  type AssistantPanel,
  AssistantPanelContext,
  AssistantTitleBarContext,
  useAssistantChoice,
} from "../../../plugins/plugin-assistant";
import { styleRef, useReading } from "../../../shared/readings";
import { FloatingResizeHandles } from "../../shared/floating-resize-handles";
import { AiAssistantIcon } from "../shared/ai-assistant-icon";
import { slideFromEdge } from "../shared/slide-from-edge";
import { useFloatingPanel } from "../shared/use-floating-panel";

// The room the docked panel takes beside the editor. Its width is bound to
// `aiAssistantHasRoom`, which changes in one step: a width that eases makes
// the browser lay the whole editor out on every frame, which takes longer
// than a frame.
const dockSpaceStyle = css({
  flexShrink: 0,
  minWidth: "[0]",
  maxWidth: "[100%]",
  pointerEvents: "none",
});

// The panel's box and its slide from the right edge are bound to the panels'
// presence and to the floating window's position, and are no part of this
// style.
const shellStyle = cva({
  base: {
    position: "absolute",
    zIndex: "[calc(var(--z-index-sticky) + 2)]",
    pointerEvents: "auto",
  },
  variants: {
    open: {
      false: {
        pointerEvents: "none",
      },
    },
  },
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
    // Neither is laid out, so the browser eases them itself when the panel
    // docks or floats.
    '&[data-animated="true"]': {
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

// Positioned, so it paints above the drag handle, right after its icon. The
// negative right margin gives back the room the title keeps for the icon, so
// the title follows the switcher closely.
const switcherStyle = css({
  position: "relative",
  display: "flex",
  marginLeft: "[18px]",
  marginRight: "[-18px]",
});

/** Switches between the running plugins' assistants, while there are several. */
const AssistantSwitcher = () => {
  const { assistants, shownId, choose } = useAssistantChoice();

  return assistants.length > 1 ? (
    <div className={switcherStyle}>
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
 * A CSS length between the floating window's and the docked column's, for how
 * far the panel is docked: the first at 0, the second at 1.
 */
const between = (floating: string, docked: string, howDocked: number) => {
  if (howDocked === 0) {
    return floating;
  }
  if (howDocked === 1) {
    return docked;
  }
  return `calc(${floating} * ${1 - howDocked} + ${docked} * ${howDocked})`;
};

/**
 * The AI assistant panel around a plugin's content: the space it takes beside
 * the canvas, its docked or floating placement, resizing, and a title bar with
 * the assistant icon, the dock toggle and Close. The content fills the rest,
 * and the title bar through `AssistantPanelTitle`; it reads `panel` with
 * `useAssistantPanel`.
 */
export const PluginAssistantPanel = ({
  panel,
  children,
}: {
  panel: AssistantPanel;
  children: ReactNode;
}) => {
  const placement = useEditorState((editor) => editor.assistantPlacement);
  const { setAssistantPlacement } = useEditorActions();
  const showAnimations = useUserSettings((settings) => settings.showAnimations);
  const { aiAssistantWidth } = usePanelSizes();
  const { shown, aiAssistantDocked, aiAssistantHasRoom } = usePanelPresence();
  const { isOpen, close } = panel;

  const isFloating = placement === "floating";
  const HeaderLabel = isFloating ? "button" : "div";
  const iconMotionAllowed = useHashIconMotionAllowed();
  const {
    panelRef,
    bindPanel,
    handleProps,
    getResizeHandleProps,
    box: floating,
  } = useFloatingPanel({ width: aiAssistantWidth });
  const dockedWidth = () => `min(${aiAssistantWidth.get()}px, 100cqw)`;
  // A closed panel is hidden once it has slid out, and not before.
  const isInView = useReading(() => shown.aiAssistant.get() > 0);
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
  }, [isOpen, panelRef]);

  return (
    <AssistantPanelContext value={panel}>
      <AssistantTitleBarContext
        value={{ title: titleElement, actions: actionsElement }}
      >
        <div
          aria-hidden="true"
          className={dockSpaceStyle}
          ref={styleRef({
            width: () => {
              const width = dockedWidth();
              return aiAssistantHasRoom.get() === 1 ? width : "0px";
            },
          })}
        />
        <aside
          // The panel's box, anywhere between the floating window and the
          // docked column. Motion animates `aiAssistantDocked` from one to
          // the other, and `shown.aiAssistant` as the panel slides in or out.
          ref={bindPanel({
            transform: () => slideFromEdge("right", shown.aiAssistant.get()),
            width: () =>
              between(floating.width, dockedWidth(), aiAssistantDocked.get()),
            maxWidth: () =>
              between(floating.maxWidth, "100%", aiAssistantDocked.get()),
            top: () => between(floating.top, "0px", aiAssistantDocked.get()),
            right: () =>
              between(floating.right, "0px", aiAssistantDocked.get()),
            height: () =>
              between(floating.height, "100%", aiAssistantDocked.get()),
            maxHeight: () =>
              between(floating.maxHeight, "100%", aiAssistantDocked.get()),
          })}
          aria-hidden={!isOpen ? true : undefined}
          aria-label="AI assistant"
          tabIndex={-1}
          inert={!isOpen}
          className={shellStyle({ open: isOpen })}
          data-placement={placement}
          style={{ visibility: isOpen || isInView ? undefined : "hidden" }}
        >
          {/* Docked, the panel is resized by `EditorResizers`. */}
          {isFloating && (
            <FloatingResizeHandles
              label="AI assistant"
              getHandleProps={getResizeHandleProps}
            />
          )}
          <div
            className={cardStyle({ floating: isFloating })}
            data-animated={showAnimations}
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
              <AssistantSwitcher />
              <div ref={setTitleElement} className={titleStyle} />
              <Button
                size="xs"
                variant="ghost"
                className={buttonStyle}
                aria-label={placementLabel}
                onClick={() =>
                  setAssistantPlacement(isFloating ? "docked" : "floating")
                }
                prefix={
                  <HashIcon
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
                prefix={<HashIcon name="close" size={14} />}
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
