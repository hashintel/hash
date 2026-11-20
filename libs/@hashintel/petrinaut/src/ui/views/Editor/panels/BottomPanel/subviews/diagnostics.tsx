import { use, useState } from "react";

import { Banner } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { LanguageClientContext } from "../../../../../../react/lsp/context";
import { SimulationContext } from "../../../../../../react/simulation/context";
import { useEditorActions } from "../../../../../../react/state/editor-context";
import { useSDCPNState } from "../../../../../../react/state/sdcpn-context";
import { useCodeNavigation } from "../../../../../monaco/code-navigation";
import { useCompositionProblems } from "../../../shared/use-composition-problems";
import { CompositionDiagnostics } from "./diagnostics/composition-diagnostics";
import { countOf } from "./diagnostics/count-of";
import { DiagnosticsGroup } from "./diagnostics/diagnostics-group";
import {
  groupDiagnosticsByEntity,
  type EntityDiagnostics,
} from "./diagnostics/group-diagnostics";
import { NetClassSummary } from "./diagnostics/net-class-summary";
import {
  bulletStyle,
  diagnosticButtonStyle,
  diagnosticItemStyle,
  diagnosticsListStyle,
} from "./diagnostics/styles";

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

/**
 * DiagnosticsContent shows the full list of diagnostics grouped by entity.
 */
const DiagnosticsContent: React.FC = () => {
  const { diagnosticsByUri, totalDiagnosticsCount } = use(
    LanguageClientContext,
  );
  const petriNetDefinition = useSDCPNState(
    (document) => document.petriNetDefinition,
  );
  const getItemType = useSDCPNState((document) => document.getItemType);
  const { navigateTo, selectItem } = useEditorActions();
  const codeNavigation = useCodeNavigation();
  const {
    state: simulationState,
    error: simulationError,
    errorItemId,
  } = use(SimulationContext);
  const compositionProblems = useCompositionProblems();
  // Track collapsed entities (all expanded by default)
  const [collapsedEntities, setCollapsedEntities] = useState<Set<string>>(
    new Set(),
  );

  const entities = groupDiagnosticsByEntity(
    diagnosticsByUri,
    petriNetDefinition,
  );
  const hasSimulationError = simulationState === "Error" && !!simulationError;

  // Clicking a diagnostic selects its entity. A visualizer's section is
  // collapsed by default, so its diagnostics also open that section.
  const revealDiagnostic = (entity: EntityDiagnostics, uri: string) => {
    selectItem({ type: entity.entityType, id: entity.entityId });
    if (entity.entityType === "place") {
      codeNavigation.open(uri);
    }
  };

  const toggleEntity = (entityKey: string) => {
    setCollapsedEntities((prev) => {
      const next = new Set(prev);
      if (next.has(entityKey)) {
        next.delete(entityKey);
      } else {
        next.add(entityKey);
      }
      return next;
    });
  };

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

      {entities.map((entity) => {
        const entityKey = `${entity.entityType}:${entity.entityId}`;

        return (
          <DiagnosticsGroup
            key={entityKey}
            label={entity.label}
            count={countOf(entity.errorCount, "error")}
            hasErrors
            expanded={!collapsedEntities.has(entityKey)}
            onToggle={() => toggleEntity(entityKey)}
          >
            {entity.documents.map((codeDocument) => (
              <div key={codeDocument.uri} className={itemGroupStyle}>
                {codeDocument.part && (
                  <div className={subTypeStyle}>{codeDocument.part}</div>
                )}

                <ul className={diagnosticsListStyle}>
                  {codeDocument.diagnostics.map((diagnostic) => (
                    <li
                      key={`${diagnostic.range.start.line}:${diagnostic.range.start.character}-${diagnostic.code}`}
                      className={diagnosticItemStyle}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          revealDiagnostic(entity, codeDocument.uri)
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
export const DiagnosticsPanel: React.FC = () => (
  <>
    <NetClassSummary />
    <DiagnosticsContent />
  </>
);
