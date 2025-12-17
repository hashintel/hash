import { css } from "@hashintel/ds-helpers/css";
import { useCallback, useMemo, useState } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa6";
import ts from "typescript";

import { useCheckerContext } from "../../../../state/checker-provider";
import { useEditorStore } from "../../../../state/editor-provider";
import { useSDCPNContext } from "../../../../state/sdcpn-provider";

/**
 * Formats a TypeScript diagnostic message to a readable string
 */
const formatDiagnosticMessage = (
  messageText: string | ts.DiagnosticMessageChain
): string => {
  if (typeof messageText === "string") {
    return messageText;
  }
  return ts.flattenDiagnosticMessageText(messageText, "\n");
};

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
 * DiagnosticsContent shows the full list of diagnostics grouped by entity.
 */
export const DiagnosticsContent: React.FC = () => {
  const { checkResult, totalDiagnosticsCount } = useCheckerContext();
  const { petriNetDefinition } = useSDCPNContext();
  const setSelectedResourceId = useEditorStore(
    (state) => state.setSelectedResourceId
  );
  const [expandedEntities, setExpandedEntities] = useState<Set<string>>(
    new Set()
  );

  // Handler to select an entity when clicking on a diagnostic
  const handleSelectEntity = useCallback(
    (entityId: string) => {
      setSelectedResourceId(entityId);
    },
    [setSelectedResourceId]
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
          (deItem) => deItem.id === entityId
        );
        entityName = de?.name ?? entityId;
        subType = null;
      } else {
        entityType = "transition";
        const transition = petriNetDefinition.transitions.find(
          (tr) => tr.id === entityId
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

  if (totalDiagnosticsCount === 0) {
    return <div className={emptyMessageStyle}>No diagnostics</div>;
  }

  return (
    <>
      {groupedDiagnostics.map((group) => {
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
                      <div className={subTypeStyle} style={{ marginBottom: 2 }}>
                        {itemGroup.subType === "lambda" ? "Lambda" : "Kernel"}
                      </div>
                    )}

                    {/* Diagnostics list */}
                    <ul
                      className={diagnosticsListStyle}
                      style={{ paddingLeft: 12 }}
                    >
                      {itemGroup.diagnostics.map((diagnostic, index) => (
                        <li
                          key={`${group.entityId}-${itemGroup.subType}-${
                            diagnostic.start ?? index
                          }`}
                          style={{ marginBottom: 4 }}
                        >
                          <button
                            type="button"
                            onClick={() => handleSelectEntity(group.entityId)}
                            className={diagnosticButtonStyle}
                            style={{ marginLeft: 8, padding: "2px 4px" }}
                          >
                            <span style={{ marginRight: 4 }}>•</span>
                            {formatDiagnosticMessage(diagnostic.messageText)}
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
      })}
    </>
  );
};
