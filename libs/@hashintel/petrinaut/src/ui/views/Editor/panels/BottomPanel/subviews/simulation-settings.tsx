import { use, useState } from "react";

import {
  Banner,
  Button,
  Icon,
  NumberInput,
  Select,
} from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import {
  classicRunParameterValues,
  classicRunVariables,
  classicScenarioRunState,
  compileScenario,
  createUserKeyedRecord,
  EMPTY_AD_HOC_STATE,
  initialMarkingToAdHocPlaces,
} from "@hashintel/petrinaut-core";

import { SimulationContext } from "../../../../../../react/simulation/context";
import { useScenarioHir } from "../../../../../../react/simulation/use-scenario-hir";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import {
  AdHocScenarioForm,
  FormLayoutColumn,
  FormSectionHeader,
} from "../../../../../components/ad-hoc-scenario-form/ad-hoc-scenario-form";
import { OverlayScrollArea } from "../../../../../components/overlay-scroll-area";
import { PointerHelpTooltip } from "../../../../../components/pointer-help-tooltip";
import { StackedSections } from "../../../../../components/stacked-sections";
import { FocusControls } from "../../../../../worksheet/focus-controls";
import { FocusRoot, FocusStack } from "../../../../../worksheet/focus-stack";
import { scenarioExpressions } from "../../../../shared/scenario-expressions";
import { ViewScenarioDrawer } from "../../SimulateView/scenarios/view-scenario-drawer";
import {
  scenarioRunParameterValues,
  seedScenarioRunState,
} from "./scenario-run-state";

import type { SubView } from "../../../../../components/sub-view/types";
import type { AdHocScenarioState } from "@hashintel/petrinaut-core";

// -- Styles -------------------------------------------------------------------

// The subview opts out of the tab content's uniform 16px padding (noPadding)
// and owns its insets instead: a tighter top, no bottom padding at all so the
// form's columns can scroll through the panel's full height.
const rootStyle = css({
  "--form-heading-case": "uppercase",
  "--form-heading-size": "10px",
  "--form-heading-spacing": "0.5px",
  display: "flex",
  flexDirection: "column",
  height: "full",
  minHeight: "[0]",
  paddingTop: "2",
  paddingX: "4",
});

const scenarioRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  flexShrink: 0,
  // Small right inset so the row's controls don't hug the panel edge,
  // matching the form's columns below.
  paddingRight: "2",
  marginBottom: "1.5",
});

// The picker reads as one control, not a full-panel bar; the Time Step
// control fills the row's right edge.
const scenarioPickerGroupStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  flex: "[1]",
  minWidth: "[0]",
  maxWidth: "[420px]",
});

// Time Step sits inline on the picker row, pushed to the right edge — the
// columns below keep the full panel width to themselves.
const timeStepInlineStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  marginLeft: "auto",
  flexShrink: 0,
});

const scenarioLabelStyle = css({
  fontSize: "[10px]",
  fontWeight: "semibold",
  textTransform: "uppercase",
  color: "neutral.a100",
  letterSpacing: "[0.5px]",
  flexShrink: 0,
});

// Sized like the Timeline metric picker: fill the remaining row width, and
// let the inner select box shrink below its content's min width so long
// scenario names truncate instead of overflowing.
const scenarioSelectWrapperStyle = css({
  flex: "[1]",
  minWidth: "[0]",
  "& > div > div": {
    minWidth: "[0]",
  },
});

// The form's two columns: Variables and Parameters on the left, the wider
// Initial state on the right. The scenario picker and Time Step sit above
// the grid, so the columns keep the full panel width and their headers
// align.
const containerStyle = css({
  display: "grid",
  gridTemplateColumns: "[minmax(0, 1fr) minmax(0, 1.4fr)]",
  gap: "3",
  minWidth: "[0]",
  flex: "[1]",
  minHeight: "[0]",
});

// The left column stacks two titled blocks in one scroll area; the gap
// separates them.
const leftColumnSectionsStyle = css({
  display: "contents",
  "& > div": { display: "contents" },
});

// The form wraps the whole grid, so its keyboard handling covers both
// columns; it must fill the panel like the grid it contains.
const adHocFormRootStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
  minHeight: "[0]",
});

// The inline form while a simulation is live: visible but inert and dimmed,
// matching the panel's disabled inputs.
const lockedFormStyle = css({
  opacity: "[0.5]",
});

const labelStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.fg.body",
});

const smallLabelStyle = css({
  fontSize: "[10px]",
  fontWeight: "normal",
});

const parametersListStyle = css({
  overflowY: "auto",
  flex: "[1]",
  minHeight: "[0]",
  minWidth: "[0]",
  paddingBottom: "4",
});

// The Clear affordance stays quiet until pointed at: it wipes the whole
// draft, so it should not compete with the fields it clears.
const quietClearButtonStyle = css({
  opacity: "[0.55]",
  transition: "[opacity 0.12s ease]",
  _hover: { opacity: "[1]" },
  _focusVisible: { opacity: "[1]" },
  _disabled: { opacity: "[0.3]" },
});

const emptyMessageStyle = css({
  fontSize: "xs",
  color: "neutral.s85",
  fontStyle: "italic",
});

// The classic-scenario preview's status line: why the Initial state section
// is not (fully) showing yet — compiling, a compilation error, or a row cap.
const runNoticeStyle = css({
  fontSize: "xs",
  color: "neutral.s90",
  backgroundColor: "[rgb(217 119 6 / 0.08)]",
  border: "1px solid",
  borderColor: "[rgb(217 119 6 / 0.35)]",
  borderRadius: "sm",
  paddingX: "2",
  paddingY: "1.5",
  marginBottom: "2",
});

// Error callout shown when the selected scenario fails to compile, so a
// broken scenario is never silently ignored. It docks at the panel's bottom,
// below the columns: appearing takes height from the content grid — whose
// columns scroll internally, so nothing becomes unreachable — rather than
// covering it or shifting it downward. Flat and barely rounded, so it reads
// as a bar of the panel, not a floating toast; a long error list scrolls
// inside the banner rather than swallowing the panel.
const scenarioBannerStyle = css({
  flexShrink: 0,
  marginTop: "2",
  marginBottom: "2",
  maxHeight: "[40%]",
  overflowY: "auto",
  borderRadius: "sm",
  textStyle: "xs",
  lineHeight: "[1.3]",
  padding: "[6px 8px]",
});

// Stack the per-error messages with the same 4px rhythm as the lead line, and
// let long ones (stack traces, expression bodies) wrap instead of stretching
// the column.
const scenarioMessagesStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[4px]",
  marginTop: "[4px !important]",
  overflowWrap: "anywhere",
});

// -- Component ----------------------------------------------------------------

const ParametersScrollArea: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <OverlayScrollArea viewportClassName={parametersListStyle}>
    <StackedSections>{children}</StackedSections>
  </OverlayScrollArea>
);

const NO_SCENARIO = "__none__";

/**
 * SimulationSettingsContent displays simulation settings in the BottomPanel:
 * a scenario picker, the Time Step, and the scenario form — editable with no
 * scenario selected, in run mode for a saved scenario.
 */
const SimulationSettingsContent: React.FC = () => {
  const { navigateTo, setSimulateDrawer } = use(EditorContext);
  const {
    extensions,
    petriNetDefinition: { parameters, scenarios, places, types },
  } = use(SDCPNContext);
  const globalParameters = extensions.parameters ? parameters : [];
  const {
    state: simulationState,
    dt,
    setDt,
    selectedScenarioId: contextScenarioId,
    setSelectedScenarioId: setContextScenarioId,
    scenarioParameterValues,
    setScenarioParameterValue,
    scenarioCompilationErrors,
    adHocScenario,
    setAdHocScenario,
    adHocNetParameters,
    initialMarking,
  } = use(SimulationContext);

  const selectedScenarioId = contextScenarioId ?? NO_SCENARIO;
  const [isViewScenarioOpen, setIsViewScenarioOpen] = useState(false);

  const isSimulationActive =
    simulationState === "Running" || simulationState === "Paused";

  const selectedScenario = scenarios?.find((s) => s.id === selectedScenarioId);

  // With no scenario selected the form edits the inline definition the
  // next run compiles against.
  const adHocActive = !selectedScenario;

  // A selected ad-hoc scenario shows through the form in run mode: the
  // panel edits a local copy whose only writable slots are the exposed
  // Variables (the scenario's parameters); every edit resolves to ordinary
  // scenario-parameter values, so the run path is the selected scenario's.
  const selectedAdHocScenario =
    selectedScenario?.initialState.type === "adhoc"
      ? selectedScenario
      : undefined;
  // Any other selected scenario shows through the same form: its scenario
  // parameters stay editable, and the right column previews the state the
  // run will actually start with — the compiled initial marking,
  // materialized into literal read-only rows.
  const selectedClassicScenario =
    selectedScenario && !selectedAdHocScenario ? selectedScenario : undefined;
  const scenarioHir = useScenarioHir(selectedScenario, {
    adHocContext: {
      netParameters: globalParameters,
      places,
      types: extensions.colors ? types : [],
    },
  });
  // `seededFrom` is the persisted scenario definition the run state came
  // from, by content: saving an edit to the selected scenario changes it, so
  // the form reseeds to the new definition instead of showing the old one
  // while the run compiles the new. By content, not identity — the document
  // hands out a fresh scenario object on every edit anywhere in the net,
  // and reseeding on those remounted the form (and restarted its language
  // session) for every node dragged on the canvas. `seed` counts reseeds —
  // it keys the form so a reseed (or a scenario switch) remounts it,
  // discarding an undo history whose snapshots belong to another definition.
  const selectedScenarioContent = selectedScenario
    ? JSON.stringify(selectedScenario)
    : null;
  const [scenarioRun, setScenarioRun] = useState<{
    scenarioId: string;
    seededFrom: string;
    seed: number;
    state: AdHocScenarioState;
  } | null>(null);
  if (
    selectedAdHocScenario &&
    selectedAdHocScenario.initialState.type === "adhoc" &&
    selectedScenarioContent !== null &&
    (scenarioRun?.scenarioId !== selectedAdHocScenario.id ||
      scenarioRun.seededFrom !== selectedScenarioContent)
  ) {
    setScenarioRun({
      scenarioId: selectedAdHocScenario.id,
      seededFrom: selectedScenarioContent,
      seed: (scenarioRun?.seed ?? 0) + 1,
      state: seedScenarioRunState(
        selectedAdHocScenario.initialState.content,
        scenarioParameterValues,
      ),
    });
  }
  if (
    selectedClassicScenario &&
    selectedScenarioContent !== null &&
    (scenarioRun?.scenarioId !== selectedClassicScenario.id ||
      scenarioRun.seededFrom !== selectedScenarioContent)
  ) {
    // Only the Variables (the editable scenario parameters) live in local
    // state; the overrides and places are derived from compilation below.
    setScenarioRun({
      scenarioId: selectedClassicScenario.id,
      seededFrom: selectedScenarioContent,
      seed: (scenarioRun?.seed ?? 0) + 1,
      state: {
        variables: classicRunVariables(
          selectedClassicScenario,
          scenarioParameterValues,
        ),
        netParameters: [],
        places: {},
      },
    });
  }
  // Deselecting (No scenario) drops the run state entirely: reselecting the
  // same scenario later must reseed from the then-current parameter values,
  // not resurface stale edits the run no longer uses.
  if (!selectedAdHocScenario && !selectedClassicScenario && scenarioRun) {
    setScenarioRun(null);
  }
  // Until a definition exists, the form stands in for the markings entered
  // on the canvas: those are what a run uses while the draft is null, so
  // showing an empty place for each of them would be a lie the run does not
  // tell. Seeding also means the first edit materializes a draft that
  // already holds them, so nothing is silently zeroed. No row cap: a cap
  // here would drop tokens from the draft the moment the user typed.
  const seededAdHocState: AdHocScenarioState = {
    ...EMPTY_AD_HOC_STATE,
    places: initialMarkingToAdHocPlaces(
      initialMarking,
      { places, types: extensions.colors ? types : [] },
      Number.POSITIVE_INFINITY,
    ).places,
  };

  const adHocFormContext = {
    // With no scenario the form sees the overlaid parameters the run
    // compiles against; a selected scenario keeps the net's own defaults —
    // its overrides rule.
    netParameters: adHocActive ? adHocNetParameters : globalParameters,
    places,
    types: extensions.colors ? types : [],
  };
  const onScenarioRunChange = (next: AdHocScenarioState) => {
    if (!selectedAdHocScenario || !scenarioRun) {
      return;
    }
    const updated = { ...scenarioRun.state, variables: next.variables };
    setScenarioRun((current) => current && { ...current, state: updated });
    for (const { identifier, value } of scenarioRunParameterValues(
      updated,
      adHocFormContext,
    )) {
      setScenarioParameterValue(identifier, value);
    }
  };
  const onClassicRunChange = (next: AdHocScenarioState) => {
    if (!selectedClassicScenario) {
      return;
    }
    setScenarioRun(
      (current) =>
        current && {
          ...current,
          state: { variables: next.variables, netParameters: [], places: {} },
        },
    );
    for (const { identifier, value } of classicRunParameterValues(
      next,
      selectedClassicScenario,
    )) {
      setScenarioParameterValue(identifier, value);
    }
  };

  const scenarioRunView: {
    state: AdHocScenarioState;
    onChange: (next: AdHocScenarioState) => void;
    notice: string | null;
    previewReady: boolean;
  } | null = (() => {
    if (!selectedScenario || scenarioRun?.scenarioId !== selectedScenario.id) {
      return null;
    }
    const withoutPreview = (notice: string) => ({
      state: {
        variables: scenarioRun.state.variables,
        netParameters: Object.entries(selectedScenario.parameterOverrides).map(
          ([parameterId, expression]) => ({
            parameterId,
            expression,
            optimize: null,
          }),
        ),
        places: {},
      },
      onChange: selectedAdHocScenario
        ? onScenarioRunChange
        : onClassicRunChange,
      notice,
      previewReady: false,
    });
    if (scenarioHir.error !== null) {
      return withoutPreview(
        `The initial state preview could not be compiled: ${scenarioHir.error}`,
      );
    }
    if (scenarioHir.hir === null) {
      return withoutPreview("Compiling the initial state preview…");
    }
    const numericValues = createUserKeyedRecord<number>();
    for (const [identifier, value] of Object.entries(scenarioParameterValues)) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        numericValues[identifier] = parsed;
      }
    }
    const outcome = compileScenario(
      selectedScenario,
      scenarioHir.hir,
      globalParameters,
      places,
      adHocFormContext.types,
      { scenarioParameterValues: numericValues },
    );
    if (!outcome.ok) {
      return withoutPreview(
        `The initial state preview could not be computed: ${outcome.errors
          .map((error) => error.message)
          .join(" · ")}`,
      );
    }
    const materialized = classicScenarioRunState(
      selectedScenario,
      outcome.result.initialState,
      { places, types: adHocFormContext.types },
      scenarioParameterValues,
    );
    return {
      state: {
        ...materialized.state,
        variables: scenarioRun.state.variables,
        netParameters: globalParameters.flatMap((parameter) => {
          const resolved =
            outcome.result.parameterValues[parameter.variableName];
          return resolved === undefined
            ? []
            : [
                {
                  parameterId: parameter.id,
                  expression: resolved,
                  optimize: null,
                },
              ];
        }),
      },
      onChange: selectedAdHocScenario
        ? onScenarioRunChange
        : onClassicRunChange,
      notice:
        materialized.truncated.length > 0
          ? `Preview truncated: ${materialized.truncated
              .map(
                (cut) =>
                  `${cut.placeName} shows ${cut.shown} of ${cut.total} rows`,
              )
              .join(" · ")}`
          : null,
      previewReady: true,
    };
  })();

  const scenarioOptions = [
    ...(scenarios ?? []).map((s) => ({ value: s.id, text: s.name })),
    { value: NO_SCENARIO, text: "No scenario" },
  ];

  const timeStepControl = (
    <div className={timeStepInlineStyle}>
      <label htmlFor="time-step-input" className={labelStyle}>
        Time Step <span className={smallLabelStyle}>(sec/frame)</span>
        <PointerHelpTooltip content="Controls the resolution of the ODE solver. Smaller steps yield finer approximations but take longer to compute." />
      </label>
      <NumberInput
        htmlForId="time-step-input"
        size="xs"
        width="xs"
        min={0.001}
        step={0.001}
        hideStepper
        value={dt}
        onChange={(nextDt) => {
          if (nextDt !== null && nextDt > 0) {
            setDt(nextDt);
          }
        }}
        disabled={isSimulationActive}
      />
    </div>
  );

  return (
    <FocusRoot>
      <FocusStack axis="vertical">
        <div className={rootStyle}>
          <ViewScenarioDrawer
            open={isViewScenarioOpen}
            onClose={() => setIsViewScenarioOpen(false)}
            scenario={selectedScenario}
          />

          {/* The scenario picker and Time Step share the top row, so the form's
          two columns below keep the full panel width and their headers
          start at the same height. */}
          <FocusControls axis="horizontal">
            <div className={scenarioRowStyle}>
              <div className={scenarioPickerGroupStyle}>
                <span className={scenarioLabelStyle}>Scenario</span>
                <div className={scenarioSelectWrapperStyle}>
                  <Select
                    required
                    aria-label="Scenario"
                    value={selectedScenarioId}
                    onChange={(scenarioId) =>
                      setContextScenarioId(
                        scenarioId === NO_SCENARIO ? null : scenarioId,
                      )
                    }
                    items={scenarioOptions}
                    size="xs"
                    disabled={isSimulationActive}
                    renderItem={(value) => {
                      const option = scenarioOptions.find(
                        (opt) => opt.value === value,
                      );
                      return (
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            minWidth: 0,
                          }}
                        >
                          {value === NO_SCENARIO && (
                            <Icon
                              name="dash"
                              size="xs"
                              className={css({ opacity: "[0.4]" })}
                            />
                          )}
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {option?.text}
                          </span>
                        </span>
                      );
                    }}
                  />
                </div>
                <div style={{ display: "flex" }}>
                  {selectedScenario && (
                    <Button
                      size="xs"
                      variant="ghost"
                      aria-label="Edit scenario"
                      tooltip="Edit Scenario"
                      iconName="pencil"
                      onClick={() => setIsViewScenarioOpen(true)}
                    />
                  )}
                  <Button
                    size="xs"
                    variant="ghost"
                    aria-label="Create scenario"
                    tooltip="Create Scenario"
                    iconName="plus"
                    onClick={() =>
                      setSimulateDrawer({ type: "create-scenario" })
                    }
                  />
                  <Button
                    size="xs"
                    variant="ghost"
                    aria-label="Manage scenarios"
                    tooltip="Manage Scenarios"
                    iconName="list"
                    onClick={() =>
                      navigateTo({
                        globalMode: "simulate",
                        simulateViewMode: "scenarios",
                      })
                    }
                  />
                </div>
              </div>
              {timeStepControl}
            </div>
          </FocusControls>

          {adHocActive ? (
            /* No scenario: Variables and Parameters share the left panel
           column, Initial state fills the right one, laid out through
           renderLayout — the form's keyboard handling wraps the whole grid,
           and each visual column is one FormLayoutColumn in the keyboard
           flow. This embedding offers no Optimize/expose toggles. */
            <AdHocScenarioForm
              state={adHocScenario ?? seededAdHocState}
              onChange={setAdHocScenario}
              context={adHocFormContext}
              selection="none"
              className={adHocFormRootStyle}
              renderLayout={({
                variables,
                parameters: parameterRows,
                places: placesList,
                placesVisibilityControl,
              }) => (
                <div className={containerStyle}>
                  <FormLayoutColumn>
                    <ParametersScrollArea>
                      <div
                        inert={isSimulationActive}
                        className={cx(
                          leftColumnSectionsStyle,
                          isSimulationActive && lockedFormStyle,
                        )}
                      >
                        <div>
                          <FormSectionHeader
                            title="Variables"
                            tooltip="Named values available as scenario.<name> in expressions."
                          />
                          {variables}
                        </div>
                        <div>
                          <FormSectionHeader
                            title="Parameters"
                            spaceBefore={variables !== null}
                            tooltip="Override a parameter for this run. Empty keeps its default."
                          />
                          {parameterRows ?? (
                            <div className={emptyMessageStyle}>
                              No parameters defined
                            </div>
                          )}
                        </div>
                      </div>
                    </ParametersScrollArea>
                  </FormLayoutColumn>
                  <FormLayoutColumn>
                    <ParametersScrollArea>
                      <FormSectionHeader
                        title="Initial state"
                        tooltip="Token counts and values for this run."
                      >
                        {placesVisibilityControl}
                        <FocusControls axis="horizontal">
                          <Button
                            size="xs"
                            variant="ghost"
                            tone="neutral"
                            iconName="rotateLeft"
                            className={quietClearButtonStyle}
                            disabled={
                              adHocScenario === null || isSimulationActive
                            }
                            onClick={() => setAdHocScenario(null)}
                          >
                            Clear
                          </Button>
                        </FocusControls>
                      </FormSectionHeader>
                      <div
                        inert={isSimulationActive}
                        className={cx(isSimulationActive && lockedFormStyle)}
                      >
                        {placesList}
                      </div>
                    </ParametersScrollArea>
                  </FormLayoutColumn>
                </div>
              )}
            />
          ) : scenarioRunView ? (
            /* A selected scenario, shown through the form in run mode: the
           scenario's parameters (its exposed Variables) take value edits in
           the left column; Parameters and Initial state sit read-only in
           the right one, still walkable and selectable. The run state
           reseeds in the same render pass as the selection, so this arm
           renders whenever a scenario is selected. */
            <AdHocScenarioForm
              key={`${scenarioRun?.scenarioId}:${scenarioRun?.seed}`}
              state={scenarioRunView.state}
              onChange={scenarioRunView.onChange}
              context={adHocFormContext}
              selection="none"
              mode="run"
              className={adHocFormRootStyle}
              expressionFor={scenarioExpressions(
                selectedScenario,
                adHocFormContext,
              )}
              renderLayout={({
                variables,
                parameters: parameterRows,
                places: placesList,
                placesVisibilityControl,
              }) => (
                <div className={containerStyle}>
                  <FormLayoutColumn>
                    <ParametersScrollArea>
                      <FormSectionHeader
                        title="Scenario parameters"
                        tooltip="Change a value for this run without changing the saved scenario."
                      />
                      <div
                        inert={isSimulationActive}
                        className={cx(isSimulationActive && lockedFormStyle)}
                      >
                        {variables ?? (
                          <div className={emptyMessageStyle}>
                            This scenario exposes no parameters
                          </div>
                        )}
                      </div>
                    </ParametersScrollArea>
                  </FormLayoutColumn>
                  <FormLayoutColumn>
                    <ParametersScrollArea>
                      <div className={leftColumnSectionsStyle}>
                        <div>
                          <FormSectionHeader
                            title="Parameters"
                            tooltip="Computed values for this run. Select a value to see its expression over the selected cell."
                          />
                          {scenarioRunView.previewReady
                            ? (parameterRows ?? (
                                <div className={emptyMessageStyle}>
                                  No parameters defined
                                </div>
                              ))
                            : null}
                        </div>
                        <div>
                          <FormSectionHeader
                            title="Initial state"
                            spaceBefore={scenarioRunView.previewReady}
                            tooltip="Computed token counts and values for this run."
                          >
                            {placesVisibilityControl}
                          </FormSectionHeader>
                          {scenarioRunView.notice === null ? null : (
                            <div className={runNoticeStyle}>
                              {scenarioRunView.notice}
                            </div>
                          )}
                          {scenarioRunView.previewReady ? placesList : null}
                        </div>
                      </div>
                    </ParametersScrollArea>
                  </FormLayoutColumn>
                </div>
              )}
            />
          ) : null}

          {scenarioCompilationErrors && (
            <Banner
              tone="error"
              icon={false}
              role="alert"
              className={scenarioBannerStyle}
            >
              <Banner.Title as="h3">
                Scenario failed to compile — its parameter overrides and initial
                state are not applied.
              </Banner.Title>
              <Banner.Description className={scenarioMessagesStyle}>
                {scenarioCompilationErrors.map((compilationError) => (
                  <span
                    key={`${compilationError.source}:${compilationError.itemId}:${compilationError.message}`}
                  >
                    {compilationError.message}
                  </span>
                ))}
              </Banner.Description>
            </Banner>
          )}
        </div>
      </FocusStack>
    </FocusRoot>
  );
};

/**
 * SubView definition for Simulation Settings tab.
 */
export const simulationSettingsSubView: SubView = {
  id: "simulation-settings",
  title: "Simulation Settings",
  tooltip: "Configure simulation parameters and the computation time step.",
  component: SimulationSettingsContent,
  noPadding: true,
};
