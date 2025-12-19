import { css } from "@hashintel/ds-helpers/css";
import { useCallback, useMemo, useRef, useState } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa6";
import ts from "typescript";

import { useCheckerContext } from "../../../../state/checker-provider";
import { useEditorStore } from "../../../../state/editor-provider";
import { useSDCPNContext } from "../../../../state/sdcpn-provider";

/**
 * Formats a TypeScript diagnostic message to a readable string
 */
function formatDiagnosticMessage(
  messageText: string | ts.DiagnosticMessageChain,
): string {
  if (typeof messageText === "string") {
    return messageText;
  }
  return ts.flattenDiagnosticMessageText(messageText, "\n");
}

// Position offsets (accounting for sidebar padding/margins)
const MIN_HEIGHT = 100;
const MAX_HEIGHT = 600;
const LEFT_SIDEBAR_WIDTH = 344; // 320px + 24px padding
const PANEL_MARGIN = 12;

// Styles
const panelContainerStyle = css({
  borderRadius: "[12px]",
  backgroundColor: "[rgba(255, 255, 255, 0.7)]",
  boxShadow: "[0 3px 13px rgba(0, 0, 0, 0.1)]",
  border: "[1px solid rgba(255, 255, 255, 0.8)]",
  backdropFilter: "[blur(12px)]",
  display: "flex",
  flexDirection: "column",
});

const headerStyle = css({
  fontSize: "[12px]",
  fontWeight: "[500]",
  textTransform: "uppercase",
  color: "core.gray.90",
  borderBottom: "[1px solid rgba(0, 0, 0, 0.1)]",
});

const contentStyle = css({
  fontSize: "[12px]",
});

const emptyMessageStyle = css({
  color: "core.gray.50",
  fontStyle: "italic",
});

const entityButtonStyle = css({
  fontSize: "[12px]",
  fontWeight: "medium",
  color: "core.gray.80",
  "&:hover": {
    color: "core.gray.90",
  },
});

const errorCountStyle = css({
  color: "[#dc2626]",
  fontWeight: "normal",
});

const subTypeStyle = css({
  fontSize: "[11px]",
  fontWeight: "medium",
  color: "core.gray.60",
});

const diagnosticsListStyle = css({
  margin: "[0]",
  listStyle: "none",
});

const diagnosticButtonStyle = css({
  fontSize: "[11px]",
  fontFamily:
    "[ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace]",
  color: "[#dc2626]",
  lineHeight: "[1.5]",
  cursor: "pointer",
  borderRadius: "[4px]",
  transition: "[background-color 0.15s]",
  backgroundColor: "[transparent]",
  border: "none",
  textAlign: "left",
  width: "[100%]",
  "&:hover": {
    backgroundColor: "[rgba(220, 38, 38, 0.08)]",
  },
});

const positionStyle = css({
  color: "core.gray.50",
});

type EntityType = "transition" | "differential-equation";

interface GroupedDiagnostics {
  entityType: EntityType;
  entityId: string;
  entityName: string;
  errorCount: number;
  items: Array<{
    subType: "lambda" | "kernel" | null;
    diagnostics: ts.Diagnostic[];
  }>;
}

/**
 * DiagnosticsPanel shows the full list of diagnostics.
 * Positioned at the bottom of the viewport.
 * When LeftSideBar is visible, positioned to its right. Otherwise full-width.
 * Resizable from the top edge.
 */
export const DiagnosticsPanel: React.FC = () => {
  const { checkResult, totalDiagnosticsCount } = useCheckerContext();
  const { petriNetDefinition } = useSDCPNContext();
  const setSelectedResourceId = useEditorStore(
    (state) => state.setSelectedResourceId,
  );
  const isOpen = useEditorStore((state) => state.isDiagnosticsPanelOpen);
  const isLeftSidebarOpen = useEditorStore((state) => state.isLeftSidebarOpen);
  const panelHeight = useEditorStore((state) => state.diagnosticsPanelHeight);
  const setDiagnosticsPanelHeight = useEditorStore(
    (state) => state.setDiagnosticsPanelHeight,
  );
  const [expandedEntities, setExpandedEntities] = useState<Set<string>>(
    new Set(),
  );

  // Handler to select an entity when clicking on a diagnostic
  const handleSelectEntity = useCallback(
    (entityId: string) => {
      setSelectedResourceId(entityId);
    },
    [setSelectedResourceId],
  );

  // Group diagnostics by entity (transition or differential equation)
  const groupedDiagnostics = useMemo(() => {
    const groups = new Map<string, GroupedDiagnostics>();

    for (const item of checkResult.itemDiagnostics) {
      const entityId = item.itemId;
      let entityType: EntityType;
      let entityName: string;
      let subType: "lambda" | "kernel" | null;

      if (item.itemType === "differential-equation") {
        entityType = "differential-equation";
        const de = petriNetDefinition.differentialEquations.find(
          (deItem) => deItem.id === entityId,
        );
        entityName = de?.name ?? entityId;
        subType = null;
      } else {
        entityType = "transition";
        const transition = petriNetDefinition.transitions.find(
          (tr) => tr.id === entityId,
        );
        entityName = transition?.name ?? entityId;
        subType = item.itemType === "transition-lambda" ? "lambda" : "kernel";
      }

      const key = `${entityType}:${entityId}`;
      if (!groups.has(key)) {
        groups.set(key, {
          entityType,
          entityId,
          entityName,
          errorCount: 0,
          items: [],
        });
      }

      const group = groups.get(key)!;
      group.errorCount += item.diagnostics.length;
      group.items.push({
        subType,
        diagnostics: item.diagnostics,
      });
    }

    return Array.from(groups.values());
  }, [checkResult, petriNetDefinition]);

  const toggleEntity = useCallback((entityKey: string) => {
    setExpandedEntities((prev) => {
      const next = new Set(prev);
      if (next.has(entityKey)) {
        next.delete(entityKey);
      } else {
        next.add(entityKey);
      }
      return next;
    });
  }, []);

  // Resize handling
  const resizeStartYRef = useRef(0);
  const resizeStartHeightRef = useRef(panelHeight);

  const handleResizeMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      resizeStartYRef.current = event.clientY;
      resizeStartHeightRef.current = panelHeight;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        // Dragging up increases height (negative deltaY = increase)
        const deltaY = resizeStartYRef.current - moveEvent.clientY;
        const newHeight = Math.max(
          MIN_HEIGHT,
          Math.min(MAX_HEIGHT, resizeStartHeightRef.current + deltaY),
        );
        setDiagnosticsPanelHeight(newHeight);
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [panelHeight, setDiagnosticsPanelHeight],
  );

  if (!isOpen) {
    return null;
  }

  // Calculate left position based on left sidebar state
  const leftOffset = isLeftSidebarOpen ? LEFT_SIDEBAR_WIDTH : PANEL_MARGIN;

  return (
    <div
      style={{
        position: "fixed",
        bottom: PANEL_MARGIN,
        left: leftOffset,
        right: PANEL_MARGIN,
        height: panelHeight,
        zIndex: 999,
        padding: 4,
      }}
      className={panelContainerStyle}
    >
      {/* Resize handle at top */}
      <button
        type="button"
        aria-label="Resize diagnostics panel"
        onMouseDown={handleResizeMouseDown}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") {
            setDiagnosticsPanelHeight(Math.min(MAX_HEIGHT, panelHeight + 10));
          } else if (event.key === "ArrowDown") {
            setDiagnosticsPanelHeight(Math.max(MIN_HEIGHT, panelHeight - 10));
          }
        }}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 9,
          cursor: "ns-resize",
          zIndex: 1001,
          background: "transparent",
          border: "none",
          padding: 0,
          borderRadius: "12px 12px 0 0",
        }}
      />

      {/* Header */}
      <div
        style={{ padding: "7px 16px 8px 16px", flexShrink: 0 }}
        className={headerStyle}
      >
        Diagnostics
      </div>

      {/* Scrollable content */}
      <div
        style={{ padding: "8px 16px", flex: 1, overflowY: "auto" }}
        className={contentStyle}
      >
        {totalDiagnosticsCount === 0 ? (
          <div className={emptyMessageStyle}>No diagnostics</div>
        ) : (
          groupedDiagnostics.map((group) => {
            const entityKey = `${group.entityType}:${group.entityId}`;
            const isExpanded = expandedEntities.has(entityKey);
            const entityLabel =
              group.entityType === "transition"
                ? `Transition: ${group.entityName}`
                : `Differential Equation: ${group.entityName}`;

            return (
              <div key={entityKey} style={{ marginBottom: 8 }}>
                {/* Collapsible entity header */}
                <button
                  type="button"
                  onClick={() => toggleEntity(entityKey)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    width: "100%",
                    padding: "4px 0",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  className={entityButtonStyle}
                >
                  {isExpanded ? (
                    <FaChevronDown size={10} />
                  ) : (
                    <FaChevronRight size={10} />
                  )}
                  <span>{entityLabel}</span>
                  <span className={errorCountStyle}>
                    ({group.errorCount} error
                    {group.errorCount !== 1 ? "s" : ""})
                  </span>
                </button>

                {/* Expanded diagnostics */}
                {isExpanded && (
                  <div style={{ paddingLeft: 16, marginTop: 4 }}>
                    {group.items.map((itemGroup) => (
                      <div
                        key={`${group.entityId}-${itemGroup.subType ?? "de"}`}
                        style={{ marginBottom: 8 }}
                      >
                        {/* Show sub-type for transitions */}
                        {itemGroup.subType && (
                          <div
                            className={subTypeStyle}
                            style={{ marginBottom: 2 }}
                          >
                            {itemGroup.subType === "lambda"
                              ? "Lambda"
                              : "Kernel"}
                          </div>
                        )}

                        {/* Diagnostics list */}
                        <ul
                          className={diagnosticsListStyle}
                          style={{ paddingLeft: 12 }}
                        >
                          {itemGroup.diagnostics.map((diagnostic, index) => (
                            // eslint-disable-next-line react/no-array-index-key
                            <li key={index} style={{ marginBottom: 4 }}>
                              <button
                                type="button"
                                onClick={() =>
                                  handleSelectEntity(group.entityId)
                                }
                                className={diagnosticButtonStyle}
                                style={{ marginLeft: 8, padding: "2px 4px" }}
                              >
                                <span style={{ marginRight: 4 }}>•</span>
                                {formatDiagnosticMessage(
                                  diagnostic.messageText,
                                )}
                                {diagnostic.start !== undefined && (
                                  <span
                                    className={positionStyle}
                                    style={{ marginLeft: 8 }}
                                  >
                                    (pos: {diagnostic.start})
                                  </span>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
