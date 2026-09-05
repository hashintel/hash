import { use } from "react";

import {
  Banner,
  Icon,
  NumberInput,
  Select,
  Toggle,
} from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { SimulationContext } from "../../../react/simulation/context";
import { SDCPNContext } from "../../../react/state/sdcpn-context";
import { Slider } from "../../components/slider";
import { useScrollOverflow } from "../../hooks/use-scroll-overflow";
import { clampSimulationParameterValue } from "./simulation-parameter-bounds";

import type {
  SimulationParameterBounds,
  SimulationParameterBoundsByIdentifier,
} from "./simulation-parameter-bounds";

const NO_SCENARIO = "__none__";

const rootStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "5",
  minHeight: "0",
  height: "full",
});

const scenarioRowStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  flexShrink: "0",
  paddingRight: "2",
});

const scenarioLabelStyle = css({
  fontSize: "[10px]",
  fontWeight: "semibold",
  textTransform: "uppercase",
  color: "neutral.a100",
  letterSpacing: "[0.5px]",
  flexShrink: "0",
});

const scenarioSelectWrapperStyle = css({
  flex: "1",
  minWidth: "0",
  "& > div > div": { minWidth: "0" },
});

const actionsStyle = css({
  display: "flex",
  flexShrink: "0",
});

const sectionStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  flex: "1",
  minHeight: "0",
});

const sectionTitleStyle = css({
  fontSize: "[10px]",
  fontWeight: "semibold",
  textTransform: "uppercase",
  color: "neutral.a100",
  letterSpacing: "[0.5px]",
});

const scrollWrapperStyle = css({
  position: "relative",
  flex: "1",
  minHeight: "0",
  display: "flex",
  flexDirection: "column",
});

const listStyle = css({
  display: "flex",
  flexDirection: "column",
  overflowY: "auto",
  flex: "1",
  minHeight: "0",
  paddingBottom: "3",
  paddingRight: "2",
});

const fadeStyle = css({
  position: "absolute",
  left: "0",
  right: "0",
  height: "[16px]",
  pointerEvents: "none",
  zIndex: "[1]",
  opacity: "var(--scroll-fade-opacity)",
  transition: "[opacity 150ms ease]",
});

const topFadeStyle = css({
  top: "0",
  background:
    "[linear-gradient(to bottom, var(--colors-neutral-s00), transparent)]",
});

const bottomFadeStyle = css({
  bottom: "0",
  background:
    "[linear-gradient(to top, var(--colors-neutral-s00), transparent)]",
});

const parameterRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "4",
  paddingY: "2",
  paddingX: "1",
  borderBottomWidth: "thin",
  borderBottomColor: "neutral.a25",
  "&:last-child": { borderBottomWidth: "0" },
});

const parameterNameStyle = css({
  fontSize: "[13px]",
  color: "neutral.fg.heading",
});

const parameterVariableStyle = css({
  fontSize: "[11px]",
  color: "neutral.s100",
  fontFamily: "mono",
});

const parameterVariableOnlyStyle = css({
  fontSize: "[12px]",
  color: "neutral.fg.heading",
  fontFamily: "mono",
});

const parameterInputStyle = css({ width: "[80px]" });
const parameterSliderInputStyle = css({ width: "[65px]" });
const ratioRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: "2",
});
const ratioSliderStyle = css({ width: "[120px]", opacity: "1" });

const emptyMessageStyle = css({
  fontSize: "xs",
  color: "neutral.s85",
  fontStyle: "italic",
});

const scenarioBannerStyle = css({
  flexShrink: "0",
  textStyle: "xs",
  lineHeight: "[1.3]",
  padding: "[6px 8px]",
});

const scenarioMessagesStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[4px]",
  marginTop: "[4px !important]",
  overflowWrap: "anywhere",
});

const ParametersScrollArea: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { scrollRef, canScrollUp, canScrollDown, onScroll } =
    useScrollOverflow();

  return (
    <div className={scrollWrapperStyle}>
      <div
        className={cx(fadeStyle, topFadeStyle)}
        style={
          {
            "--scroll-fade-opacity": canScrollUp ? 1 : 0,
          } as React.CSSProperties
        }
      />
      <div ref={scrollRef} className={listStyle} onScroll={onScroll}>
        {children}
      </div>
      <div
        className={cx(fadeStyle, bottomFadeStyle)}
        style={
          {
            "--scroll-fade-opacity": canScrollDown ? 1 : 0,
          } as React.CSSProperties
        }
      />
    </div>
  );
};

type DisplayParameter = {
  key: string;
  name?: string;
  variableName: string;
  type: "real" | "integer" | "boolean" | "ratio";
  defaultValue: string;
};

const parameterBounds = (
  parameter: DisplayParameter,
  boundsByIdentifier?: SimulationParameterBoundsByIdentifier,
): SimulationParameterBounds | undefined => {
  const declared = boundsByIdentifier?.[parameter.variableName];
  if (declared) {
    return declared;
  }
  return parameter.type === "ratio"
    ? { min: 0, max: 1, step: 0.00001 }
    : undefined;
};

export type SimulationScenarioControlsProps = {
  actions?: React.ReactNode;
  allowNoScenario?: boolean;
  parameterBounds?: SimulationParameterBoundsByIdentifier;
  className?: string;
};

/**
 * Shared scenario picker and typed parameter controls, decoupled from the full
 * editor settings panel so the embedded Preview composes them too. Internal to
 * this package: a host embeds `Petrinaut` or `PetrinautPreview`, and neither
 * this component nor the bottom-bar controls are part of a published entry.
 */
export const SimulationScenarioControls: React.FC<
  SimulationScenarioControlsProps
> = ({
  actions,
  allowNoScenario = true,
  parameterBounds: boundsByIdentifier,
  className,
}) => {
  const {
    extensions,
    petriNetDefinition: { parameters, scenarios },
  } = use(SDCPNContext);
  const {
    state: simulationState,
    parameterValues,
    setParameterValue,
    selectedScenarioId: contextScenarioId,
    setSelectedScenarioId,
    scenarioParameterValues,
    setScenarioParameterValue,
    scenarioCompilationErrors,
  } = use(SimulationContext);

  const selectedScenarioId = contextScenarioId ?? NO_SCENARIO;
  const selectedScenario = scenarios?.find(
    (scenario) => scenario.id === selectedScenarioId,
  );
  const isSimulationActive =
    simulationState === "Running" || simulationState === "Paused";
  const globalParameters = extensions.parameters ? parameters : [];
  const displayParameters: DisplayParameter[] = selectedScenario
    ? selectedScenario.scenarioParameters.map((parameter) => ({
        key: `scenario-${parameter.identifier}`,
        variableName: parameter.identifier,
        type: parameter.type,
        defaultValue: String(parameter.default),
      }))
    : globalParameters.map((parameter) => ({
        key: parameter.id,
        name: parameter.name,
        variableName: parameter.variableName,
        type: parameter.type,
        defaultValue: parameter.defaultValue,
      }));
  const scenarioOptions = [
    ...(scenarios ?? []).map((scenario) => ({
      value: scenario.id,
      text: scenario.name,
    })),
    ...(allowNoScenario ? [{ value: NO_SCENARIO, text: "No scenario" }] : []),
  ];

  return (
    <div className={cx(rootStyle, className)}>
      <div className={scenarioRowStyle}>
        <span className={scenarioLabelStyle}>Scenario</span>
        <div className={scenarioSelectWrapperStyle}>
          <Select
            required
            value={selectedScenarioId}
            onChange={(scenarioId) =>
              setSelectedScenarioId(
                scenarioId === NO_SCENARIO ? null : scenarioId,
              )
            }
            items={scenarioOptions}
            size="xs"
            disabled={isSimulationActive || scenarioOptions.length < 2}
            renderItem={(value) => {
              const option = scenarioOptions.find(
                (candidate) => candidate.value === value,
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
        {actions && <div className={actionsStyle}>{actions}</div>}
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
            {scenarioCompilationErrors.map((error) => (
              <span key={`${error.source}:${error.itemId}:${error.message}`}>
                {error.message}
              </span>
            ))}
          </Banner.Description>
        </Banner>
      )}

      <div className={sectionStyle}>
        <div className={sectionTitleStyle}>Parameters</div>
        {displayParameters.length > 0 ? (
          <ParametersScrollArea>
            {displayParameters.map((parameter) => {
              const bounds = parameterBounds(parameter, boundsByIdentifier);
              const value = selectedScenario
                ? (scenarioParameterValues[parameter.variableName] ??
                  parameter.defaultValue)
                : (parameterValues[parameter.variableName] ??
                  parameter.defaultValue);
              const updateValue = (nextValue: string) => {
                if (selectedScenario) {
                  setScenarioParameterValue(parameter.variableName, nextValue);
                } else {
                  setParameterValue(parameter.variableName, nextValue);
                }
              };

              return (
                <div key={parameter.key} className={parameterRowStyle}>
                  <div>
                    {parameter.name === undefined ? (
                      <div className={parameterVariableOnlyStyle}>
                        {parameter.variableName}
                      </div>
                    ) : (
                      <>
                        <div className={parameterNameStyle}>
                          {parameter.name}
                        </div>
                        <div className={parameterVariableStyle}>
                          {parameter.variableName}
                        </div>
                      </>
                    )}
                  </div>
                  {parameter.type === "boolean" ? (
                    <Toggle
                      size="xs"
                      value={
                        selectedScenario ? value !== "0" : value === "true"
                      }
                      onChange={(checked) =>
                        updateValue(
                          selectedScenario
                            ? checked
                              ? "1"
                              : "0"
                            : String(checked),
                        )
                      }
                      disabled={isSimulationActive}
                    />
                  ) : parameter.type === "ratio" && selectedScenario ? (
                    <div className={ratioRowStyle}>
                      <Slider
                        className={ratioSliderStyle}
                        min={bounds?.min ?? 0}
                        max={bounds?.max ?? 1}
                        step={bounds?.step ?? 0.00001}
                        value={Number(value)}
                        onChange={(event) => updateValue(event.target.value)}
                        disabled={isSimulationActive}
                      />
                      <NumberInput
                        size="xs"
                        min={bounds?.min}
                        max={bounds?.max}
                        step={bounds?.step ?? 0.00001}
                        align="right"
                        hideStepper
                        value={Number(value)}
                        onChange={(nextValue) =>
                          updateValue(
                            nextValue === null
                              ? ""
                              : String(
                                  clampSimulationParameterValue(
                                    nextValue,
                                    bounds,
                                  ),
                                ),
                          )
                        }
                        disabled={isSimulationActive}
                        className={parameterSliderInputStyle}
                      />
                    </div>
                  ) : (
                    <NumberInput
                      size="xs"
                      min={bounds?.min}
                      max={bounds?.max}
                      align="right"
                      step={
                        bounds?.step ??
                        (parameter.type === "integer" ? 1 : 0.001)
                      }
                      hideStepper
                      value={Number(value)}
                      onChange={(nextValue) =>
                        updateValue(
                          nextValue === null
                            ? ""
                            : String(
                                clampSimulationParameterValue(
                                  nextValue,
                                  bounds,
                                ),
                              ),
                        )
                      }
                      placeholder={parameter.defaultValue}
                      disabled={isSimulationActive}
                      className={parameterInputStyle}
                    />
                  )}
                </div>
              );
            })}
          </ParametersScrollArea>
        ) : (
          <div className={emptyMessageStyle}>
            {selectedScenario
              ? "No scenario parameters defined"
              : "No parameters defined"}
          </div>
        )}
      </div>
    </div>
  );
};
