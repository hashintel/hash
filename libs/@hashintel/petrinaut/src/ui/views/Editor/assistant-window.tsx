/**
 * The assistant window: the frame, header, tab strip and tabs around an
 * assistant's chat. The chat draws `PetrinautAssistantWindow` and passes
 * what only it knows: its label, its footer, whether it is working, whether
 * it wants the compact window. The editor owns the rest through the host
 * context, so the shown tab and a pending start request survive the chat
 * remounting for another document.
 */

import {
  type ReactNode,
  type RefObject,
  use,
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useState,
} from "react";

import { Button } from "@hashintel/ds-components";

import { AiAssistantIcon } from "../../components/ai-assistant-icon";
import { HorizontalTabsHeader } from "../../components/sub-view/horizontal/horizontal-tabs-container";
import {
  ExperimentalIcon,
  useExperimentalIconMotionAllowed,
} from "../../experimental-icons";
import { ResizeHandle } from "../../resize/resize-handle";
import {
  advanceTabsAttention,
  type TabsAttention,
} from "./assistant-window/tab-attention";
import {
  AssistantWindowContext,
  chatTabId,
  type PetrinautAssistantStartRequest,
} from "./assistant-window/window-host";
import {
  cardStyle,
  chatPanelStyle,
  dockSpaceStyle,
  headerButtonStyle,
  headerLabelStyle,
  headerStyle,
  headerTabsStyle,
  panelContentStyle,
  resizeAnchorStyle,
  shellStyle,
  tabPanelStyle,
} from "./assistant-window/window-styles";
import { FloatingResizeHandles } from "./shared/floating-resize-handles";
import { useFloatingPanel } from "./shared/use-floating-panel";

export {
  AssistantWindowContext,
  type AssistantWindowTab,
  type PetrinautAssistantStartRequest,
} from "./assistant-window/window-host";
export { useEditorAssistantWindowHost } from "./assistant-window/use-editor-window-host";
export {
  PetrinautAssistantWindowPreview,
  type PetrinautAssistantWindowPreviewProps,
} from "./assistant-window/window-preview";

export interface PetrinautAssistantWindowProps {
  /** The chat tab's label, and the header's title while there are no other tabs. */
  readonly label: string;
  /** A small mark before the chat tab's label. */
  readonly mark?: ReactNode;
  /**
   * Whether the chat is working on a turn. When a turn ends while another tab
   * is shown, the chat tab gets an attention marker until it is shown.
   */
  readonly busy?: boolean;
  /** The tab strip's look, and the other tabs' padding to match. */
  readonly appearance?: "default" | "pill";
  /** Buttons in the header, after Float or Dock and before Close. */
  readonly headerActions?: ReactNode;
  /** Shown under every tab, e.g. the composer; the chat hides what a compact window should not show. */
  readonly footer?: ReactNode;
  /**
   * Shrinks the window to its footer, at the editor's bottom right, without
   * unmounting anything. `"overflow"` lets the footer draw above the window,
   * for a sheet that opens upward.
   */
  readonly compact?: boolean | "overflow";
  /** Receives focus when the window opens, unless it is disabled or the window is compact. */
  readonly focusTargetRef?: RefObject<HTMLElement | null>;
  /** Grows to move focus into the window again. */
  readonly focusRequest?: number;
  /** Called when the header's Close button closes the window. */
  readonly onClose?: () => void;
  /** The chat tab's content: the chat's own scroller. */
  readonly children: ReactNode;
}

/** The window as the chat inside it reads it. */
export interface PetrinautAssistantWindowState {
  readonly isOpen: boolean;
  /** Whether the chat tab, not another tab, is the shown one. */
  readonly isChatTabShown: boolean;
  /** Whether the chat asked for the compact window. */
  readonly compact: boolean;
  readonly setCompact: (compact: boolean) => void;
  readonly close: () => void;
  /** How an entry point outside the chat asked it to start, until the chat consumes it. */
  readonly startRequest: PetrinautAssistantStartRequest | null;
  readonly consumeStartRequest: () => void;
}

/**
 * The window around the calling chat. Outside an editor or a preview, it is
 * an open window without tabs whose controls do nothing.
 */
export const usePetrinautAssistantWindow =
  (): PetrinautAssistantWindowState => {
    const host = use(AssistantWindowContext);

    return {
      isOpen: host.isOpen,
      isChatTabShown: host.activeTabId === chatTabId,
      compact: host.compact,
      setCompact: host.setCompact,
      close: host.close,
      startRequest: host.startRequest,
      consumeStartRequest: host.consumeStartRequest,
    };
  };

const noTabsAttention: TabsAttention = {};

/**
 * The assistant window around a chat: header, tab strip, the other tabs and Close.
 * Render it once from the chat; the editor keeps the window's placement, size and shown tab.
 */
export const PetrinautAssistantWindow = ({
  label,
  mark,
  busy = false,
  appearance = "default",
  headerActions,
  footer,
  compact = false,
  focusTargetRef,
  focusRequest = 0,
  onClose,
  children,
}: PetrinautAssistantWindowProps) => {
  const host = use(AssistantWindowContext);
  const { isOpen, placement, tabs, activeTabId } = host;
  const panelId = useId();
  const tabDomId = (tabId: string) => `${panelId}-${tabId}`;
  const isCompact = compact !== false;
  const isFloating = placement === "floating";
  const hasTabs = tabs.length > 0;
  const chatTabShown = activeTabId === chatTabId;
  const iconMotionAllowed = useExperimentalIconMotionAllowed();
  const HeaderLabel = isFloating ? "button" : "div";
  const placementLabel = isFloating
    ? "Dock AI assistant"
    : "Float AI assistant";

  const {
    panelRef,
    isInteracting,
    handleProps,
    getResizeHandleProps,
    style: floatingPositionStyle,
  } = useFloatingPanel({ width: host.width, onWidthChange: host.setWidth });
  const panelWidth = `min(${host.width}px, 100cqw)`;
  const animating = host.isAnimating && !isInteracting;

  // One live region for the tab strip: other tabs' unseen updates and the
  // chat's finished turns.
  const [announcement, setAnnouncement] = useState("");

  // Unseen updates of the other tabs, advanced during render from the
  // identities each tab reports; the shown tab counts nothing.
  const [tabsAttention, setTabsAttention] = useState(noTabsAttention);
  const advancedAttention = advanceTabsAttention(
    tabsAttention,
    tabs,
    isOpen ? activeTabId : null,
  );
  if (advancedAttention.attention !== tabsAttention) {
    setTabsAttention(advancedAttention.attention);
    if (advancedAttention.announcement !== null) {
      setAnnouncement(advancedAttention.announcement);
    }
  }

  // A turn that ends while another tab is shown marks the chat tab until the
  // chat is shown again.
  const [chatAttention, setChatAttention] = useState(false);
  const [wasBusy, setWasBusy] = useState(busy);
  if (busy !== wasBusy) {
    setWasBusy(busy);
    if (wasBusy && isOpen && !chatTabShown) {
      setChatAttention(true);
      setAnnouncement(`${label} needs your attention`);
    }
  }
  if (chatAttention && isOpen && chatTabShown) {
    setChatAttention(false);
  }

  // Clear the live region once read, so the same text can be announced again.
  useEffect(() => {
    if (announcement.length === 0) {
      return;
    }
    const timeout = setTimeout(() => setAnnouncement(""), 0);

    return () => clearTimeout(timeout);
  }, [announcement]);

  const reportDockHeight = useEffectEvent((height: number | null) => {
    host.reportDockHeight(height);
  });
  useLayoutEffect(() => {
    const shell = panelRef.current;
    if (!isOpen || !isCompact || !shell) {
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
  }, [isOpen, isCompact, panelRef]);

  useEffect(() => {
    if (isOpen) {
      const target = focusTargetRef?.current;
      if (target && !target.matches(":disabled") && !isCompact) {
        target.focus({ preventScroll: true });
      } else {
        panelRef.current?.focus({ preventScroll: true });
      }
    }
  }, [
    focusRequest,
    focusTargetRef,
    host.focusRequest,
    isCompact,
    isOpen,
    panelRef,
  ]);

  return (
    <>
      <div
        aria-hidden="true"
        className={dockSpaceStyle}
        data-animating={animating}
        style={{
          width: isOpen && !isFloating && !isCompact ? panelWidth : 0,
        }}
      />
      <aside
        ref={panelRef}
        aria-hidden={!isOpen ? true : undefined}
        aria-label="AI assistant"
        tabIndex={-1}
        inert={!isOpen}
        className={shellStyle({
          collapsed: isCompact,
          open: isOpen,
          floating: isFloating && !isCompact,
        })}
        data-placement={placement}
        data-animating={animating}
        style={{
          width: panelWidth,
          ...(isFloating && !isCompact ? floatingPositionStyle : {}),
        }}
      >
        {isFloating && !isCompact ? (
          <FloatingResizeHandles
            label="AI assistant"
            getHandleProps={getResizeHandleProps}
          />
        ) : (
          <div
            className={`${resizeAnchorStyle} ${panelContentStyle({
              visible: !isCompact,
            })}`}
          >
            <ResizeHandle
              edge="left"
              appearance="hidden"
              size={host.width}
              onResize={host.setWidth}
              minSize={320}
              maxSize={720}
              label="Resize AI assistant"
            />
          </div>
        )}
        <div
          className={cardStyle({
            floating: isFloating || isCompact,
            setupOverlay: compact === "overflow",
          })}
          data-animating={animating}
        >
          <div
            className={`${headerStyle} ${panelContentStyle({
              visible: !isCompact,
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
              {!hasTabs && <span>{label}</span>}
            </HeaderLabel>
            <div className={headerTabsStyle}>
              {hasTabs && (
                <HorizontalTabsHeader
                  subViews={[
                    {
                      id: tabDomId(chatTabId),
                      title: label,
                      mark,
                      attention: { marker: chatAttention },
                    },
                    ...tabs.map((tab) => ({
                      id: tabDomId(tab.id),
                      title: tab.label,
                      mark: tab.mark,
                      attention: {
                        count: advancedAttention.attention[tab.id]?.count ?? 0,
                      },
                    })),
                  ]}
                  activeTabId={tabDomId(activeTabId)}
                  announcement={announcement}
                  styleVariant={appearance}
                  onTabChange={(domId) => {
                    host.setActiveTabId(
                      tabs.find((tab) => tabDomId(tab.id) === domId)?.id ??
                        chatTabId,
                    );
                  }}
                />
              )}
            </div>
            <Button
              size="xs"
              variant="ghost"
              className={headerButtonStyle}
              aria-label={placementLabel}
              onClick={() =>
                host.setPlacement(isFloating ? "docked" : "floating")
              }
              prefix={
                <ExperimentalIcon
                  name={isFloating ? "sidebar" : "externalLink"}
                  size={14}
                />
              }
              tooltip={placementLabel}
            />
            {headerActions}
            <Button
              size="xs"
              variant="ghost"
              className={headerButtonStyle}
              aria-label="Close AI assistant"
              onClick={() => {
                onClose?.();
                host.close();
              }}
              prefix={<ExperimentalIcon name="close" size={14} />}
              tooltip="Close AI assistant"
            />
          </div>

          <div
            id={hasTabs ? `tabpanel-${tabDomId(chatTabId)}` : undefined}
            role={hasTabs ? "tabpanel" : undefined}
            aria-labelledby={hasTabs ? `tab-${tabDomId(chatTabId)}` : undefined}
            hidden={!chatTabShown}
            className={`${chatPanelStyle} ${panelContentStyle({
              visible: !isCompact && chatTabShown,
            })}`}
          >
            {children}
          </div>

          {tabs.map((tab) => (
            <div
              key={tab.id}
              id={`tabpanel-${tabDomId(tab.id)}`}
              role="tabpanel"
              aria-labelledby={`tab-${tabDomId(tab.id)}`}
              hidden={activeTabId !== tab.id}
              className={`${tabPanelStyle({ appearance })} ${panelContentStyle({
                visible: !isCompact && activeTabId === tab.id,
              })}`}
            >
              {tab.content}
            </div>
          ))}

          {footer}
        </div>
      </aside>
    </>
  );
};
