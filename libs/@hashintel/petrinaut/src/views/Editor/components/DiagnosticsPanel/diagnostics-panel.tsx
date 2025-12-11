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
const LEFT_OFFSET = 356; // LeftSideBar: 320px width + 12px padding + 12px margin + 12px gap
const MIN_HEIGHT = 100;
const MAX_HEIGHT = 400;
const DEFAULT_HEIGHT = 180;

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

interface DiagnosticsPanelProps {
  isOpen: boolean;
  propertiesPanelWidth: number;
}

/**
 * DiagnosticsPanel shows the full list of diagnostics.
 * Positioned at the bottom of the viewport, centered between LeftSideBar and PropertiesPanel.
 * Resizable from the top edge.
 */
export const DiagnosticsPanel: React.FC<DiagnosticsPanelProps> = ({
  isOpen,
  propertiesPanelWidth,
}) => {
  const { checkResult, totalDiagnosticsCount } = useCheckerContext();
  const { petriNetDefinition } = useSDCPNContext();
  const setSelectedResourceId = useEditorStore(
    (state) => state.setSelectedResourceId,
  );
  const [panelHeight, setPanelHeight] = useState(DEFAULT_HEIGHT);
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
  const resizeStartHeightRef = useRef(DEFAULT_HEIGHT);

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
        setPanelHeight(newHeight);
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [panelHeight],
  );

  if (!isOpen) {
    return null;
  }

  // Calculate right offset: propertiesPanelWidth + padding (12px each side) + gap (12px)
  const rightOffset = propertiesPanelWidth + 31;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 94,
        left: LEFT_OFFSET,
        right: rightOffset,
        height: panelHeight,
        zIndex: 900,
        padding: 4,
      }}
      className={css({
        borderRadius: "[16px]",
        backgroundColor: "[rgba(255, 255, 255, 0.7)]",
        boxShadow: "[0 4px 30px rgba(0, 0, 0, 0.15)]",
        border: "[1px solid rgba(255, 255, 255, 0.8)]",
        backdropFilter: "[blur(12px)]",
        display: "flex",
        flexDirection: "column",
      })}
    >
      {/* Resize handle at top */}
      <button
        type="button"
        aria-label="Resize diagnostics panel"
        onMouseDown={handleResizeMouseDown}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") {
            setPanelHeight((prev) => Math.min(MAX_HEIGHT, prev + 10));
          } else if (event.key === "ArrowDown") {
            setPanelHeight((prev) => Math.max(MIN_HEIGHT, prev - 10));
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
          borderRadius: "16px 16px 0 0",
        }}
      />

      {/* Header */}
      <div
        style={{ padding: "7px 16px 8px 16px", flexShrink: 0 }}
        className={css({
          fontSize: "[12px]",
          fontWeight: "[500]",
          textTransform: "uppercase",
          color: "core.gray.90",
          borderBottom: "[1px solid rgba(0, 0, 0, 0.1)]",
        })}
      >
        Diagnostics
      </div>

      {/* Scrollable content */}
      <div
        style={{ padding: "8px 16px", flex: 1, overflowY: "auto" }}
        className={css({
          fontSize: "[12px]",
        })}
      >
        {totalDiagnosticsCount === 0 ? (
          <div
            className={css({
              color: "core.gray.50",
              fontStyle: "italic",
            })}
          >
            No diagnostics
          </div>
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
                  className={css({
                    fontSize: "[12px]",
                    fontWeight: "medium",
                    color: "core.gray.80",
                    "&:hover": {
                      color: "core.gray.90",
                    },
                  })}
                >
                  {isExpanded ? (
                    <FaChevronDown size={10} />
                  ) : (
                    <FaChevronRight size={10} />
                  )}
                  <span>{entityLabel}</span>
                  <span
                    className={css({
                      color: "[#dc2626]",
                      fontWeight: "normal",
                    })}
                  >
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
                            className={css({
                              fontSize: "[11px]",
                              fontWeight: "medium",
                              color: "core.gray.60",
                            })}
                            style={{ marginBottom: 2 }}
                          >
                            {itemGroup.subType === "lambda"
                              ? "Lambda"
                              : "Kernel"}
                          </div>
                        )}

                        {/* Diagnostics list */}
                        <ul
                          className={css({
                            margin: "[0]",
                            listStyle: "none",
                          })}
                          style={{ paddingLeft: 12 }}
                        >
                          {itemGroup.diagnostics.map((diagnostic, index) => (
                            <li
                              key={`${group.entityId}-${itemGroup.subType}-${diagnostic.start ?? index}`}
                              style={{ marginBottom: 4 }}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  handleSelectEntity(group.entityId)
                                }
                                className={css({
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
                                    backgroundColor:
                                      "[rgba(220, 38, 38, 0.08)]",
                                  },
                                })}
                                style={{ marginLeft: 8, padding: "2px 4px" }}
                              >
                                <span style={{ marginRight: 4 }}>•</span>
                                {formatDiagnosticMessage(
                                  diagnostic.messageText,
                                )}
                                {diagnostic.start !== undefined && (
                                  <span
                                    className={css({
                                      color: "core.gray.50",
                                    })}
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
