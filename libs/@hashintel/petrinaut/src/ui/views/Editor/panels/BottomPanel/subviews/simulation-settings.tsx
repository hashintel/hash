import { use, useState } from "react";

import {
  Banner,
  Button,
  HelpTooltip,
  Icon,
  NumberInput,
  Select,
  Toggle,
} from "@hashintel/ds-components";
import { css, cva, cx } from "@hashintel/ds-helpers/css";
import { EMPTY_AD_HOC_STATE } from "@hashintel/petrinaut-core";

import { SimulationContext } from "../../../../../../react/simulation/context";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { UserSettingsContext } from "../../../../../../react/state/user-settings-context";
import { AdHocScenarioForm } from "../../../../../components/ad-hoc-scenario-form/ad-hoc-scenario-form";
import { Slider } from "../../../../../components/slider";
import { useScrollOverflow } from "../../../../../hooks/use-scroll-overflow";
import { CreateScenarioDrawer } from "../../SimulateView/scenarios/create-scenario-drawer";
import { ViewScenarioDrawer } from "../../SimulateView/scenarios/view-scenario-drawer";

import type { SubView } from "../../../../../components/sub-view/types";

// -- Styles -------------------------------------------------------------------

// The subview opts out of the tab content's uniform 16px padding (noPadding)
// and owns its insets instead: a tighter top, no bottom padding at all so the
// parameters list can scroll through the panel's full height.
const rootStyle = css({
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
  // The picker sits above the columns; capped so it reads as one control,
  // not a full-panel bar.
  maxWidth: "[420px]",
  // Small right inset so the action buttons don't hug the column edge,
  // matching the parameters list below.
  paddingRight: "2",
  marginBottom: "3",
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

const parameterInputStyles = css({
  width: "[80px]",
});

const parameterSliderInputStyles = css({
  width: "[65px]",
});

const containerStyle = css({
  display: "grid",
  gap: "8",
  flex: "[1]",
  minHeight: "[0]",
});

// Two columns normally; a third, widest, carries the inline initial-state
// form when the ad-hoc setting is on and no scenario is selected. The
// scenario picker sits above the grid, so each column starts with its
// section header and the three headers align.
const twoColumnContainerStyle = css({
  gridTemplateColumns: "[1fr 1fr]",
});

const threeColumnContainerStyle = css({
  gridTemplateColumns: "[1fr 1.4fr 0.7fr]",
});

// The form wraps the whole grid when the ad-hoc embedding is live, so its
// keyboard handling covers both form columns; it must fill the panel like
// the grid it contains.
const adHocFormRootStyle = css({
  display: "flex",
  flexDirection: "column",
  flex: "[1]",
  minHeight: "[0]",
});

const initialStateTitleRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
});

const initialStateSpacerStyle = css({
  flex: "[1]",
});

// The inline form while a simulation is live: visible but inert and dimmed,
// matching the panel's disabled inputs.
const lockedFormStyle = css({
  opacity: "[0.5]",
});

const sectionStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  minHeight: "[0]",
});

// Lets the parameters section absorb the column's remaining height so its
// list scrolls to the panel bottom.
const fillSectionStyle = css({
  flex: "[1]",
});

const sectionTitleStyle = css({
  fontSize: "[10px]",
  fontWeight: "semibold",
  textTransform: "uppercase",
  color: "neutral.a100",
  letterSpacing: "[0.5px]",
});

const settingsRowStyle = css({
  display: "flex",
  flexDirection: "row",
  gap: "6",
  flexWrap: "wrap",
});

const settingGroupStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  minWidth: "[120px]",
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

const parametersScrollWrapperStyle = css({
  position: "relative",
  flex: "[1]",
  minHeight: "[0]",
  display: "flex",
  flexDirection: "column",
});

/**
 * White fades over the edges the list can still be scrolled towards — at the
 * top once scrolled, at the bottom while more content is below. Overflow state
 * is tracked by the shared `useScrollOverflow` hook.
 */
const parametersFadeStyle = cva({
  base: {
    position: "absolute",
    left: "[0]",
    right: "[0]",
    height: "[16px]",
    pointerEvents: "none",
    zIndex: "[1]",
    opacity: "[0]",
    transition: "[opacity 150ms ease]",
  },
  variants: {
    position: {
      top: {
        top: "[0]",
        background:
          "[linear-gradient(to bottom, var(--colors-neutral-s00), transparent)]",
      },
      bottom: {
        bottom: "[0]",
        background:
          "[linear-gradient(to top, var(--colors-neutral-s00), transparent)]",
      },
    },
    visible: { true: { opacity: "[1]" } },
  },
});

const parametersListStyle = css({
  display: "flex",
  flexDirection: "column",
  overflowY: "auto",
  flex: "[1]",
  minHeight: "[0]",
  // End padding: scrolls with the content, giving the last row breathing
  // room without reserving fixed space below the list.
  paddingBottom: "3",
  // Small right inset so row values don't hug the scrollbar/column edge.
  paddingRight: "2",
});

// Plain rows separated by hairline dividers, matching the sidebar's
// parameter list, rather than card-like boxes. A small horizontal inset
// nudges the name and value off the row edges; the divider still spans the
// full width.
const parameterRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "4",
  paddingY: "2",
  paddingX: "1",
  borderBottomWidth: "thin",
  borderBottomColor: "neutral.a25",
  "&:last-child": {
    borderBottomWidth: "[0]",
  },
});

const parameterNameStyle = css({
  fontSize: "[13px]",
  color: "neutral.fg.heading",
});

// Row label for parameters without a display name (scenario parameters are
// identified by their variable name alone).
const parameterVarNameOnlyStyle = css({
  fontSize: "[12px]",
  color: "neutral.fg.heading",
  fontFamily: "mono",
});

const parameterVarNameStyle = css({
  fontSize: "[11px]",
  color: "neutral.s100",
  fontFamily: "mono",
});

const ratioRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "2",
});

const ratioSliderStyle = css({
  width: "[120px]",
  opacity: "[1]",
});

const emptyMessageStyle = css({
  fontSize: "xs",
  color: "neutral.s85",
  fontStyle: "italic",
});

// Error callout shown when the selected scenario fails to compile, so a broken
// scenario is never silently ignored. `flexShrink` keeps it from collapsing in
// the settings column; the compact `textStyle`/`padding` keep the banner to the
// same footprint (and wrap points) as the plain callout it replaced.
const scenarioBannerStyle = css({
  flexShrink: 0,
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

/**
 * Wraps the parameters list in a container with white scroll fades: at the top
 * once the list is scrolled, at the bottom while more content is below.
 */
const ParametersScrollArea: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { scrollRef, canScrollUp, canScrollDown, onScroll } =
    useScrollOverflow();

  return (
    <div className={parametersScrollWrapperStyle}>
      <div
        className={parametersFadeStyle({
          position: "top",
          visible: canScrollUp,
        })}
      />
      <div ref={scrollRef} className={parametersListStyle} onScroll={onScroll}>
        {children}
      </div>
      <div
        className={parametersFadeStyle({
          position: "bottom",
          visible: canScrollDown,
        })}
      />
    </div>
  );
};

const NO_SCENARIO = "__none__";

/**
 * SimulationSettingsContent displays simulation settings in the BottomPanel.
 * Includes a scenario picker, parameters section, and computation settings.
 */
const SimulationSettingsContent: React.FC = () => {
  const { setGlobalMode } = use(EditorContext);
  const {
    extensions,
    petriNetDefinition: { parameters, scenarios, places, types },
  } = use(SDCPNContext);
  const globalParameters = extensions.parameters ? parameters : [];
  const {
    state: simulationState,
    dt,
    setDt,
    parameterValues,
    setParameterValue,
    selectedScenarioId: contextScenarioId,
    setSelectedScenarioId: setContextScenarioId,
    scenarioParameterValues,
    setScenarioParameterValue,
    scenarioCompilationErrors,
    adHocScenario,
    setAdHocScenario,
  } = use(SimulationContext);

  const { enableAdHocScenarios } = use(UserSettingsContext);

  const selectedScenarioId = contextScenarioId ?? NO_SCENARIO;
  const [isCreateScenarioOpen, setIsCreateScenarioOpen] = useState(false);
  const [isViewScenarioOpen, setIsViewScenarioOpen] = useState(false);

  const isSimulationActive =
    simulationState === "Running" || simulationState === "Paused";

  const selectedScenario = scenarios?.find((s) => s.id === selectedScenarioId);

  // The inline ad-hoc embedding: only behind the user setting, and only
  // with no scenario selected. Off, the panel renders exactly as before
  // the feature.
  const adHocActive = enableAdHocScenarios && !selectedScenario;

  // When a scenario is selected, show its scenario parameters + overridden net params.
  // When no scenario, show net-level parameters.
  const displayParams: Array<{
    key: string;
    /** Human-readable name — scenario parameters only have an identifier. */
    name?: string;
    variableName: string;
    type: "real" | "integer" | "boolean" | "ratio";
    defaultValue: string;
  }> = selectedScenario
    ? selectedScenario.scenarioParameters.map((sp) => ({
        key: `sp-${sp.identifier}`,
        variableName: sp.identifier,
        type: sp.type,
        defaultValue: String(sp.default),
      }))
    : globalParameters.map((p) => ({
        key: p.id,
        name: p.name,
        variableName: p.variableName,
        type: p.type,
        defaultValue: p.defaultValue,
      }));

  const scenarioOptions = [
    ...(scenarios ?? []).map((s) => ({ value: s.id, text: s.name })),
    { value: NO_SCENARIO, text: "No scenario" },
  ];

  const computationSection = (
    <div className={sectionStyle}>
      <div className={sectionTitleStyle}>Computation</div>
      <div className={settingsRowStyle}>
        {/* Time Step Input */}
        <div className={settingGroupStyle}>
          <label htmlFor="time-step-input" className={labelStyle}>
            Time Step <span className={smallLabelStyle}>(sec/frame)</span>
            <HelpTooltip content="Controls the resolution of the ODE solver. Smaller steps yield finer approximations but take longer to compute." />
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
      </div>
    </div>
  );

  return (
    <div className={rootStyle}>
      <CreateScenarioDrawer
        open={isCreateScenarioOpen}
        onClose={() => setIsCreateScenarioOpen(false)}
      />
      <ViewScenarioDrawer
        open={isViewScenarioOpen}
        onClose={() => setIsViewScenarioOpen(false)}
        scenario={selectedScenario}
      />

      {/* The scenario picker sits above the columns, so the PARAMETERS,
          INITIAL STATE, and COMPUTATION headers all start their columns at
          the same height. */}
      <div className={scenarioRowStyle}>
        <span className={scenarioLabelStyle}>Scenario</span>
        <div className={scenarioSelectWrapperStyle}>
          <Select
            required
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
              const option = scenarioOptions.find((opt) => opt.value === value);
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
            onClick={() => setIsCreateScenarioOpen(true)}
          />
          <Button
            size="xs"
            variant="ghost"
            aria-label="Manage scenarios"
            tooltip="Manage Scenarios"
            iconName="list"
            onClick={() => setGlobalMode("simulate")}
          />
        </div>
      </div>

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

      {adHocActive ? (
        /* The ad-hoc embedding: Parameters become the form's override
           spreadsheet and Initial state its places, laid out as panel
           columns through renderLayout — the form's keyboard handling
           wraps the whole grid. This embedding still offers no scenario
           Variables and no Optimize/expose toggles. */
        <AdHocScenarioForm
          state={adHocScenario ?? EMPTY_AD_HOC_STATE}
          onChange={setAdHocScenario}
          context={{
            netParameters: globalParameters,
            places,
            types: extensions.colors ? types : [],
          }}
          selection="none"
          withVariables={false}
          className={adHocFormRootStyle}
          renderLayout={({ parameters: parameterRows, places: placesList }) => (
            <div className={cx(containerStyle, threeColumnContainerStyle)}>
              <div className={cx(sectionStyle, fillSectionStyle)}>
                <div className={initialStateTitleRowStyle}>
                  <div className={sectionTitleStyle}>Parameters</div>
                  <HelpTooltip content="Override a parameter's value for this run with an expression. Empty keeps the default. Expressions may read parameters.<name>." />
                </div>
                {parameterRows ? (
                  <ParametersScrollArea>
                    <div
                      inert={isSimulationActive}
                      className={cx(isSimulationActive && lockedFormStyle)}
                    >
                      {parameterRows}
                    </div>
                  </ParametersScrollArea>
                ) : (
                  <div className={emptyMessageStyle}>No parameters defined</div>
                )}
              </div>

              <div className={cx(sectionStyle, fillSectionStyle)}>
                <div className={initialStateTitleRowStyle}>
                  <div className={sectionTitleStyle}>Initial state</div>
                  <HelpTooltip content="Token counts and values for this run, without saving a scenario. Every value is an expression and may read parameters.<name>." />
                  <span className={initialStateSpacerStyle} />
                  <Button
                    size="xs"
                    variant="ghost"
                    tone="neutral"
                    disabled={adHocScenario === null || isSimulationActive}
                    onClick={() => setAdHocScenario(null)}
                  >
                    Clear
                  </Button>
                </div>
                <ParametersScrollArea>
                  {/* Like every input in this panel, the definition locks
                      while a simulation is live — an edit would dispose the
                      run. The scroll container stays interactive so the
                      content can still be reviewed mid-run. */}
                  <div
                    inert={isSimulationActive}
                    className={cx(isSimulationActive && lockedFormStyle)}
                  >
                    {placesList}
                  </div>
                </ParametersScrollArea>
              </div>

              {computationSection}
            </div>
          )}
        />
      ) : (
        <div className={cx(containerStyle, twoColumnContainerStyle)}>
          {/* Parameters Section */}
          <div className={cx(sectionStyle, fillSectionStyle)}>
            <div className={sectionTitleStyle}>Parameters</div>
            {displayParams.length > 0 ? (
              <ParametersScrollArea>
                {displayParams.map((param) => (
                  <div key={param.key} className={parameterRowStyle}>
                    <div>
                      {param.name === undefined ? (
                        <div className={parameterVarNameOnlyStyle}>
                          {param.variableName}
                        </div>
                      ) : (
                        <>
                          <div className={parameterNameStyle}>{param.name}</div>
                          <div className={parameterVarNameStyle}>
                            {param.variableName}
                          </div>
                        </>
                      )}
                    </div>
                    {param.type === "boolean" ? (
                      <Toggle
                        size="xs"
                        value={
                          selectedScenario
                            ? (scenarioParameterValues[param.variableName] ??
                                param.defaultValue) !== "0"
                            : (parameterValues[param.variableName] ??
                                param.defaultValue) === "true"
                        }
                        onChange={(checked) => {
                          if (selectedScenario) {
                            setScenarioParameterValue(
                              param.variableName,
                              checked ? "1" : "0",
                            );
                          } else {
                            setParameterValue(
                              param.variableName,
                              checked ? "true" : "false",
                            );
                          }
                        }}
                        disabled={isSimulationActive}
                      />
                    ) : param.type === "ratio" && selectedScenario ? (
                      <div className={ratioRowStyle}>
                        <Slider
                          className={ratioSliderStyle}
                          min={0}
                          max={1}
                          step={0.00001}
                          value={Number(
                            scenarioParameterValues[param.variableName] ??
                              param.defaultValue,
                          )}
                          onChange={(e) =>
                            setScenarioParameterValue(
                              param.variableName,
                              e.target.value,
                            )
                          }
                          disabled={isSimulationActive}
                        />
                        <NumberInput
                          size="xs"
                          min={0}
                          max={1}
                          step={0.00001}
                          align="right"
                          hideStepper
                          value={Number(
                            scenarioParameterValues[param.variableName] ??
                              param.defaultValue,
                          )}
                          onChange={(paramValue) =>
                            setScenarioParameterValue(
                              param.variableName,
                              paramValue === null ? "" : String(paramValue),
                            )
                          }
                          disabled={isSimulationActive}
                          className={parameterSliderInputStyles}
                        />
                      </div>
                    ) : (
                      <NumberInput
                        size="xs"
                        align="right"
                        step={param.type === "integer" ? 1 : 0.001}
                        hideStepper
                        value={Number(
                          selectedScenario
                            ? (scenarioParameterValues[param.variableName] ??
                                param.defaultValue)
                            : (parameterValues[param.variableName] ??
                                param.defaultValue),
                        )}
                        onChange={(paramValue) => {
                          const next =
                            paramValue === null ? "" : String(paramValue);
                          if (selectedScenario) {
                            setScenarioParameterValue(param.variableName, next);
                          } else {
                            setParameterValue(param.variableName, next);
                          }
                        }}
                        placeholder={param.defaultValue}
                        disabled={isSimulationActive}
                        className={parameterInputStyles}
                      />
                    )}
                  </div>
                ))}
              </ParametersScrollArea>
            ) : (
              <div className={emptyMessageStyle}>
                {selectedScenario
                  ? "No scenario parameters defined"
                  : "No parameters defined"}
              </div>
            )}
          </div>

          {computationSection}
        </div>
      )}
    </div>
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
