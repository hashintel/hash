import { use, useCallback, useMemo, useState } from "react";

import { Banner } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { LanguageClientContext } from "../../../../../../react/lsp/context";
import { SimulationContext } from "../../../../../../react/simulation/context";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { useCodeNavigation } from "../../../../../monaco/code-navigation";
import { parseDocumentUri } from "../../../../../monaco/editor-paths";
import { useCompositionProblems } from "../../../shared/use-composition-problems";
import { CompositionDiagnostics } from "./diagnostics/composition-diagnostics";
import {
  bulletStyle,
  countOf,
  diagnosticButtonStyle,
  diagnosticItemStyle,
  DiagnosticsGroup,
  diagnosticsListStyle,
} from "./diagnostics/diagnostics-group";
import { NetClassSummary } from "./diagnostics/net-class-summary";

import type { SubView } from "../../../../../components/sub-view/types";
import type { Diagnostic, SelectionItemType } from "@hashintel/petrinaut-core";

const emptyMessageStyle = css({
  color: "neutral.s100",
  fontStyle: "italic",
});

const itemGroupStyle = css({
  marginBottom: "[8px]",
});

const subTypeStyle = css({
  fontSize: "[11px]",
  fontWeight: "medium",
  color: "neutral.s105",
  marginBottom: "[2px]",
});

const positionStyle = css({
  color: "neutral.s100",
  marginLeft: "[8px]",
});

const simulationBannerStyle = css({
  marginBottom: "3",
});

const simulationErrorTextStyle = css({
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  userSelect: "text",
  cursor: "text",
});

type EntityType = "transition" | "differential-equation" | "place";

type SubType = "lambda" | "kernel" | "visualizer" | null;

const SUB_TYPE_LABELS: Record<NonNullable<SubType>, string> = {
  lambda: "Lambda",
  kernel: "Kernel",
  visualizer: "Visualizer",
};

const ENTITY_LABELS: Record<EntityType, string> = {
  transition: "Transition",
  "differential-equation": "Differential Equation",
  place: "Place",
};

const SELECTION_TYPES: Record<EntityType, SelectionItemType> = {
  transition: "transition",
  "differential-equation": "differentialEquation",
  place: "place",
};

interface GroupedDiagnostics {
  entityType: EntityType;
  entityId: string;
  entityName: string;
  errorCount: number;
  items: Array<{
    subType: SubType;
    /** The document the diagnostics belong to. */
    uri: string;
    diagnostics: Diagnostic[];
  }>;
}

/**
 * DiagnosticsContent shows the full list of diagnostics grouped by entity.
 */
const DiagnosticsContent: React.FC = () => {
  const { diagnosticsByUri, totalDiagnosticsCount } = use(
    LanguageClientContext,
  );
  const { petriNetDefinition, getItemType } = use(SDCPNContext);
  const { navigateTo, selectItem } = use(EditorContext);
  const codeNavigation = useCodeNavigation();
  const {
    state: simulationState,
    error: simulationError,
    errorItemId,
  } = use(SimulationContext);
  // Track collapsed entities (all expanded by default)
  const [collapsedEntities, setCollapsedEntities] = useState<Set<string>>(
    new Set(),
  );

  // Clicking a diagnostic selects its entity. A visualizer's section is
  // collapsed by default, so its diagnostics also open that section.
  const handleSelectEntity = useCallback(
    (entityId: string, entityType: EntityType, uri: string) => {
      selectItem({ type: SELECTION_TYPES[entityType], id: entityId });
      if (entityType === "place") {
        codeNavigation.open(uri);
      }
    },
    [codeNavigation, selectItem],
  );

  // Group diagnostics by entity (transition or differential equation)
  const groupedDiagnostics = useMemo(() => {
    const groups = new Map<string, GroupedDiagnostics>();

    for (const [uri, diagnostics] of diagnosticsByUri) {
      const parsed = parseDocumentUri(uri);
      if (!parsed) {
        continue;
      }

      const entityId = parsed.itemId;
      let entityType: EntityType;
      let entityName: string;
      let subType: SubType;

      if (parsed.itemType === "differential-equation") {
        entityType = "differential-equation";
        const de = petriNetDefinition.differentialEquations.find(
          (deItem) => deItem.id === entityId,
        );
        entityName = de?.name ?? entityId;
        subType = null;
      } else if (parsed.itemType === "place-visualizer") {
        entityType = "place";
        const place = petriNetDefinition.places.find(
          (placeItem) => placeItem.id === entityId,
        );
        entityName = place?.name ?? entityId;
        subType = "visualizer";
      } else {
        entityType = "transition";
        const transition = petriNetDefinition.transitions.find(
          (tr) => tr.id === entityId,
        );
        entityName = transition?.name ?? entityId;
        subType = parsed.itemType === "transition-lambda" ? "lambda" : "kernel";
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
      group.errorCount += diagnostics.length;
      group.items.push({
        subType,
        uri,
        diagnostics,
      });
    }

    return Array.from(groups.values());
  }, [diagnosticsByUri, petriNetDefinition]);

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

  const hasSimulationError = simulationState === "Error" && !!simulationError;
  const compositionProblems = useCompositionProblems();

  if (
    totalDiagnosticsCount === 0 &&
    !hasSimulationError &&
    compositionProblems.length === 0
  ) {
    return (
      <div className={emptyMessageStyle}>No errors detected in your model</div>
    );
  }

  return (
    <>
      {compositionProblems.length > 0 && (
        <CompositionDiagnostics problems={compositionProblems} />
      )}
      {/* Simulation runtime error */}
      {hasSimulationError && (
        <Banner tone="error" className={simulationBannerStyle}>
          <Banner.Description className={simulationErrorTextStyle}>
            {simulationError}
          </Banner.Description>
          {errorItemId && (
            <Banner.Actions>
              <Banner.ActionButton
                iconName="arrowRight"
                iconPosition="right"
                onClick={() => {
                  // The erroring item may have been deleted since the run;
                  // still switch to edit mode so the click always responds.
                  const itemType = getItemType(errorItemId);
                  navigateTo({
                    globalMode: "edit",
                    ...(itemType
                      ? {
                          selection: new Map([
                            [errorItemId, { type: itemType, id: errorItemId }],
                          ]),
                        }
                      : {}),
                  });
                }}
              >
                Edit Item
              </Banner.ActionButton>
            </Banner.Actions>
          )}
        </Banner>
      )}

      {groupedDiagnostics.map((group) => {
        const entityKey = `${group.entityType}:${group.entityId}`;
        const isExpanded = !collapsedEntities.has(entityKey);
        const entityLabel = `${ENTITY_LABELS[group.entityType]}: ${group.entityName}`;

        return (
          <DiagnosticsGroup
            key={entityKey}
            label={entityLabel}
            count={countOf(group.errorCount, "error")}
            hasErrors
            expanded={isExpanded}
            onToggle={() => toggleEntity(entityKey)}
          >
            {group.items.map((itemGroup) => (
              <div
                key={`${group.entityId}-${itemGroup.subType ?? "de"}`}
                className={itemGroupStyle}
              >
                {/* Show sub-type for transitions and places */}
                {itemGroup.subType && (
                  <div className={subTypeStyle}>
                    {SUB_TYPE_LABELS[itemGroup.subType]}
                  </div>
                )}

                {/* Diagnostics list */}
                <ul className={diagnosticsListStyle}>
                  {itemGroup.diagnostics.map((diagnostic) => (
                    <li
                      key={`${group.entityId}-${itemGroup.subType}-${diagnostic.range.start.line}:${diagnostic.range.start.character}-${diagnostic.code}`}
                      className={diagnosticItemStyle}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          handleSelectEntity(
                            group.entityId,
                            group.entityType,
                            itemGroup.uri,
                          )
                        }
                        className={diagnosticButtonStyle}
                      >
                        <span className={bulletStyle}>•</span>
                        {diagnostic.message}
                        <span className={positionStyle}>
                          (Ln {diagnostic.range.start.line + 1}, Col{" "}
                          {diagnostic.range.start.character + 1})
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </DiagnosticsGroup>
        );
      })}
    </>
  );
};

/** The Diagnostics tab: the class of the net, then the problems in it. */
const DiagnosticsPanel: React.FC = () => (
  <>
    <NetClassSummary />
    <DiagnosticsContent />
  </>
);

/**
 * SubView definition for Diagnostics.
 */
export const diagnosticsSubView: SubView = {
  id: "diagnostics",
  title: "Diagnostics",
  tooltip:
    "View the class of your net, and the problems in its code and its composition.",
  component: DiagnosticsPanel,
};
