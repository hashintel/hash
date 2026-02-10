import { css } from "@hashintel/ds-helpers/css";
import { use, useCallback, useMemo, useState } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa6";
import ts from "typescript";

import type { SubView } from "../../../components/sub-view/types";
import { CheckerContext } from "../../../state/checker-context";
import { EditorContext } from "../../../state/editor-context";
import { SDCPNContext } from "../../../state/sdcpn-context";

const emptyMessageStyle = css({
  color: "neutral.s50",
  fontStyle: "italic",
});

const entityGroupStyle = css({
  marginBottom: "[8px]",
});

const entityButtonStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
  width: "[100%]",
  padding: "[4px 0]",
  border: "none",
  cursor: "pointer",
  textAlign: "left",
  fontSize: "[12px]",
  fontWeight: "medium",
  color: "neutral.s80",
  _hover: {
    color: "neutral.s90",
  },
});

const errorCountStyle = css({
  color: "[#dc2626]",
  fontWeight: "normal",
});

const expandedContentStyle = css({
  paddingLeft: "[16px]",
  marginTop: "[4px]",
});

const itemGroupStyle = css({
  marginBottom: "[8px]",
});

const subTypeStyle = css({
  fontSize: "[11px]",
  fontWeight: "medium",
  color: "neutral.s60",
  marginBottom: "[2px]",
});

const diagnosticsListStyle = css({
  margin: "[0]",
  paddingLeft: "[12px]",
  listStyle: "none",
});

const diagnosticItemStyle = css({
  marginBottom: "[4px]",
});

const diagnosticButtonStyle = css({
  marginLeft: "[8px]",
  padding: "[2px 4px]",
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
  _hover: {
    backgroundColor: "[rgba(220, 38, 38, 0.08)]",
  },
});

const bulletStyle = css({
  marginRight: "[4px]",
});

const positionStyle = css({
  color: "neutral.s50",
  marginLeft: "[8px]",
});

// --- Helpers ---

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

// --- Types ---

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
const DiagnosticsContent: React.FC = () => {
  const { checkResult, totalDiagnosticsCount } = use(CheckerContext);
  const { petriNetDefinition } = use(SDCPNContext);
  const { setSelectedResourceId } = use(EditorContext);
  // Track collapsed entities (all expanded by default)
  const [collapsedEntities, setCollapsedEntities] = useState<Set<string>>(
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
    setCollapsedEntities((prev) => {
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
    return (
      <div className={emptyMessageStyle}>No errors detected in your model</div>
    );
  }

  return (
    <>
      {groupedDiagnostics.map((group) => {
        const entityKey = `${group.entityType}:${group.entityId}`;
        const isExpanded = !collapsedEntities.has(entityKey);
        const entityLabel =
          group.entityType === "transition"
            ? `Transition: ${group.entityName}`
            : `Differential Equation: ${group.entityName}`;

        return (
          <div key={entityKey} className={entityGroupStyle}>
            {/* Collapsible entity header */}
            <button
              type="button"
              onClick={() => toggleEntity(entityKey)}
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
              <div className={expandedContentStyle}>
                {group.items.map((itemGroup) => (
                  <div
                    key={`${group.entityId}-${itemGroup.subType ?? "de"}`}
                    className={itemGroupStyle}
                  >
                    {/* Show sub-type for transitions */}
                    {itemGroup.subType && (
                      <div className={subTypeStyle}>
                        {itemGroup.subType === "lambda" ? "Lambda" : "Kernel"}
                      </div>
                    )}

                    {/* Diagnostics list */}
                    <ul className={diagnosticsListStyle}>
                      {itemGroup.diagnostics.map((diagnostic, index) => (
                        <li
                          key={`${group.entityId}-${itemGroup.subType}-${
                            diagnostic.start ?? index
                          }`}
                          className={diagnosticItemStyle}
                        >
                          <button
                            type="button"
                            onClick={() => handleSelectEntity(group.entityId)}
                            className={diagnosticButtonStyle}
                          >
                            <span className={bulletStyle}>•</span>
                            {formatDiagnosticMessage(diagnostic.messageText)}
                            {diagnostic.start !== undefined && (
                              <span className={positionStyle}>
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

/**
 * SubView definition for Diagnostics.
 */
export const diagnosticsSubView: SubView = {
  id: "diagnostics",
  title: "Diagnostics",
  tooltip: "View compilation errors and warnings in your model code.",
  component: DiagnosticsContent,
};
