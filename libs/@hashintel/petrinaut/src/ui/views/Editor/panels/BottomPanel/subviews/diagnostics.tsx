import { use, useCallback, useMemo, useState } from "react";

import { Banner, Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { LanguageClientContext } from "../../../../../../react/lsp/context";
import { SimulationContext } from "../../../../../../react/simulation/context";
import { ActiveNetContext } from "../../../../../../react/state/active-net-context";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { problemTextStyle } from "../../../../../constants/problem-severity";
import { useCodeNavigation } from "../../../../../monaco/code-navigation";
import { parseDocumentUri } from "../../../../../monaco/editor-paths";
import { useCompositionProblems } from "../../../shared/use-composition-problems";
import { NetClassSummary } from "./diagnostics/net-class-summary";

import type { SubView } from "../../../../../components/sub-view/types";
import type {
  CompositionProblem,
  Diagnostic,
  SelectionItemType,
} from "@hashintel/petrinaut-core";

const emptyMessageStyle = css({
  color: "neutral.s100",
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
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s115",
  _hover: {
    color: "neutral.s120",
  },
});

const countStyle = css({
  fontWeight: "normal",
  color: "neutral.s100",
  "&[data-errors]": { color: "[#dc2626]" },
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
  color: "neutral.s105",
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
  fontFamily: "mono",
  color: "[#dc2626]",
  lineHeight: "[1.5]",
  cursor: "pointer",
  borderRadius: "sm",
  transition: "[background-color 0.15s]",
  backgroundColor: "[transparent]",
  border: "none",
  textAlign: "left",
  width: "[100%]",
  _hover: {
    backgroundColor: "[rgba(220, 38, 38, 0.08)]",
  },
  // A warning or a note is not an error: its hover is plain.
  "&:is([data-severity=warning], [data-severity=info]):hover": {
    backgroundColor: "neutral.bg.surface.hover",
  },
});

const bulletStyle = css({
  marginRight: "[4px]",
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

/** A group of diagnostics under a heading that folds it away. */
const DiagnosticsGroup = ({
  label,
  count,
  hasErrors,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  /** What the group holds, in words: "2 errors". */
  count: string;
  hasErrors: boolean;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) => (
  <div className={entityGroupStyle}>
    <button
      type="button"
      aria-expanded={expanded}
      onClick={onToggle}
      className={entityButtonStyle}
    >
      <Icon name={expanded ? "chevronDown" : "chevronRight"} size="xs" />
      <span>{label}</span>
      <span className={countStyle} data-errors={hasErrors ? "" : undefined}>
        ({count})
      </span>
    </button>
    {expanded && <div className={expandedContentStyle}>{children}</div>}
  </div>
);

const countOf = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

/**
 * The problems with the net's composition, its fusions and its ports.
 * Clicking one opens the net it is in and selects the fusion or the port.
 */
const CompositionDiagnostics = ({
  problems,
}: {
  problems: CompositionProblem[];
}) => {
  const { setActiveSubnetId } = use(ActiveNetContext);
  const { selectItem } = use(EditorContext);
  const [isExpanded, setIsExpanded] = useState(true);
  const countWith = (severity: CompositionProblem["severity"]) =>
    problems.filter((problem) => problem.severity === severity).length;
  const errorCount = countWith("error");
  // Each kind the list holds, said apart: "1 error, 2 notes".
  const counts = [
    [errorCount, "error"],
    [countWith("warning"), "warning"],
    [countWith("info"), "note"],
  ] as const;

  const reveal = (problem: CompositionProblem) => {
    setActiveSubnetId(problem.subnetId);
    selectItem(
      problem.kind === "fusion"
        ? { type: "fusion", id: problem.fusionId }
        : { type: "place", id: problem.placeId },
    );
  };

  return (
    <DiagnosticsGroup
      label="Composition"
      count={counts
        .filter(([count]) => count > 0)
        .map(([count, noun]) => countOf(count, noun))
        .join(", ")}
      hasErrors={errorCount > 0}
      expanded={isExpanded}
      onToggle={() => setIsExpanded((expanded) => !expanded)}
    >
      <ul className={diagnosticsListStyle}>
        {problems.map((problem, index) => (
          <li
            // The list is derived afresh on every render, and one check can
            // report twice on one fusion.
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            className={diagnosticItemStyle}
          >
            <button
              type="button"
              onClick={() => reveal(problem)}
              className={cx(diagnosticButtonStyle, problemTextStyle)}
              data-severity={problem.severity}
            >
              <span className={bulletStyle}>•</span>
              {problem.message}
            </button>
          </li>
        ))}
      </ul>
    </DiagnosticsGroup>
  );
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
