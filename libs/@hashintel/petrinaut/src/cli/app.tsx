import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Box, Text, useApp, useInput, useWindowSize } from "ink";

import { compileScenario } from "../core/simulation/authoring/scenario/compile-scenario";
import {
  createMonteCarloSimulator,
  type MonteCarloAdvanceResult,
  type MonteCarloRunSnapshot,
  type MonteCarloRunSummary,
  type MonteCarloSimulator,
} from "../core/simulation/monte-carlo";
import type { Scenario, ScenarioParameter } from "../core/types/sdcpn";
import type { LoadedPetrinautExample } from "./examples";

type SimulationField = "maxTime" | "dt" | "runCount";
type FocusTarget =
  | "example"
  | "scenario"
  | "parameters"
  | SimulationField
  | "run";

type ParsedSimulationSettings = {
  dt: number;
  maxTime: number;
  runCount: number;
};

type RunningSimulationState = {
  status: "running";
  startedAt: number;
  elapsedMs: number;
  maxFrames: number;
  result: MonteCarloAdvanceResult;
  summaries: MonteCarloRunSummary[];
  sampleSnapshot: MonteCarloRunSnapshot | null;
};

type FinishedSimulationState = Omit<RunningSimulationState, "status"> & {
  status: "complete";
};

type SimulationRunState =
  | { status: "idle" }
  | RunningSimulationState
  | FinishedSimulationState
  | { status: "cancelled"; message: string }
  | { status: "error"; message: string };

const numberInputPattern = /^[+\-.0-9eE]+$/;

function initialResult(runCount: number): MonteCarloAdvanceResult {
  return {
    activeRuns: runCount,
    advancedRuns: 0,
    allFinished: false,
    completedRuns: 0,
    erroredRuns: 0,
  };
}

function formatScenarioParameterDefault(parameter: ScenarioParameter): string {
  if (parameter.type === "boolean") {
    return parameter.default === 0 ? "false" : "true";
  }

  return String(parameter.default);
}

function defaultScenarioValues(
  scenario: Scenario | null,
): Record<string, string> {
  const values: Record<string, string> = {};

  for (const parameter of scenario?.scenarioParameters ?? []) {
    values[parameter.identifier] = formatScenarioParameterDefault(parameter);
  }

  return values;
}

function parseScenarioParameterValue(
  parameter: ScenarioParameter,
  rawValue: string,
): number | string {
  const value = rawValue.trim();

  if (value === "") {
    return `${parameter.identifier} is required`;
  }

  if (parameter.type === "boolean") {
    const normalizedValue = value.toLowerCase();

    if (["1", "true", "yes", "on"].includes(normalizedValue)) {
      return 1;
    }
    if (["0", "false", "no", "off"].includes(normalizedValue)) {
      return 0;
    }

    return `${parameter.identifier} must be true or false`;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return `${parameter.identifier} must be a finite number`;
  }

  if (parameter.type === "integer" && !Number.isInteger(parsed)) {
    return `${parameter.identifier} must be an integer`;
  }

  return parsed;
}

function parseScenarioParameterValues(
  scenario: Scenario,
  rawValues: Record<string, string>,
): { values: Record<string, number>; errors: string[] } {
  const values: Record<string, number> = {};
  const errors: string[] = [];

  for (const parameter of scenario.scenarioParameters) {
    const parsed = parseScenarioParameterValue(
      parameter,
      rawValues[parameter.identifier] ?? "",
    );

    if (typeof parsed === "string") {
      errors.push(parsed);
    } else {
      values[parameter.identifier] = parsed;
    }
  }

  return { values, errors };
}

function parsePositiveNumber(label: string, rawValue: string): number | string {
  const parsed = Number(rawValue.trim());

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return `${label} must be a positive number`;
  }

  return parsed;
}

function parsePositiveInteger(
  label: string,
  rawValue: string,
): number | string {
  const parsed = Number(rawValue.trim());

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return `${label} must be a positive integer`;
  }

  return parsed;
}

function parseSimulationSettings(rawSettings: {
  dt: string;
  maxTime: string;
  runCount: string;
}): { settings: ParsedSimulationSettings | null; errors: string[] } {
  const errors: string[] = [];
  const maxTime = parsePositiveNumber("Max time", rawSettings.maxTime);
  const dt = parsePositiveNumber("dt", rawSettings.dt);
  const runCount = parsePositiveInteger("Runs", rawSettings.runCount);

  for (const value of [maxTime, dt, runCount]) {
    if (typeof value === "string") {
      errors.push(value);
    }
  }

  if (errors.length > 0) {
    return { settings: null, errors };
  }

  return {
    settings: {
      dt: dt as number,
      maxTime: maxTime as number,
      runCount: runCount as number,
    },
    errors,
  };
}

function editNumericTextValue(
  value: string,
  input: string,
  key: { backspace: boolean; ctrl: boolean; delete: boolean },
): string {
  if (key.ctrl && input === "u") {
    return "";
  }

  if (key.backspace || key.delete) {
    return value.slice(0, -1);
  }

  const compactInput = input.replaceAll(/\s/g, "");
  if (compactInput !== "" && numberInputPattern.test(compactInput)) {
    return value + compactInput;
  }

  return value;
}

function toggleBooleanTextValue(value: string): string {
  const normalizedValue = value.trim().toLowerCase();

  return ["1", "true", "yes", "on"].includes(normalizedValue)
    ? "false"
    : "true";
}

function formatEditableValue(value: string, focused: boolean): string {
  if (!focused) {
    return value === "" ? "(empty)" : value;
  }

  return value === "" ? "_" : `${value}_`;
}

function formatElapsed(ms: number): string {
  if (ms < 1_000) {
    return `${ms}ms`;
  }

  return `${(ms / 1_000).toFixed(1)}s`;
}

function formatProgressRatio(
  summaries: readonly MonteCarloRunSummary[],
  maxFrames: number,
): number {
  const currentFrame = Math.max(
    0,
    ...summaries.map((summary) => summary.frameNumber),
  );

  return Math.min(1, currentFrame / Math.max(1, maxFrames));
}

function Panel({
  children,
  focused,
  title,
  width,
}: {
  children: ReactNode;
  focused: boolean;
  title: string;
  width?: number;
}) {
  return (
    <Box
      borderColor={focused ? "cyan" : "gray"}
      borderStyle="round"
      flexDirection="column"
      marginBottom={1}
      marginRight={width ? 1 : 0}
      paddingX={1}
      width={width}
    >
      <Text bold color={focused ? "cyan" : undefined}>
        {title}
      </Text>
      {children}
    </Box>
  );
}

function SelectList({
  emptyLabel,
  focused,
  options,
  selectedIndex,
}: {
  emptyLabel: string;
  focused: boolean;
  options: {
    description?: string;
    key: string;
    label: string;
  }[];
  selectedIndex: number;
}) {
  if (options.length === 0) {
    return <Text color="yellow">{emptyLabel}</Text>;
  }

  return (
    <Box flexDirection="column">
      {options.map((option, index) => {
        const selected = index === selectedIndex;

        return (
          <Box flexDirection="column" key={option.key}>
            <Text
              color={selected ? "cyan" : undefined}
              inverse={focused && selected}
            >
              {selected ? "> " : "  "}
              {option.label}
            </Text>
            {selected && option.description ? (
              <Text dimColor> {option.description}</Text>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}

function ParameterRows({
  focused,
  focusedParameterIndex,
  parameters,
  values,
}: {
  focused: boolean;
  focusedParameterIndex: number;
  parameters: readonly ScenarioParameter[];
  values: Record<string, string>;
}) {
  if (parameters.length === 0) {
    return <Text dimColor>No scenario parameters</Text>;
  }

  return (
    <Box flexDirection="column">
      {parameters.map((parameter, index) => {
        const selected = index === focusedParameterIndex;
        const value = values[parameter.identifier] ?? "";

        return (
          <Box flexDirection="column" key={parameter.identifier}>
            <Text
              color={selected ? "cyan" : undefined}
              inverse={focused && selected}
            >
              {selected ? "> " : "  "}
              {parameter.identifier}
            </Text>
            <Text color={selected ? "green" : undefined} dimColor={!selected}>
              {"  "}
              {parameter.type}:{" "}
              {formatEditableValue(value, focused && selected)}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

function FieldRow({
  focused,
  label,
  value,
}: {
  focused: boolean;
  label: string;
  value: string;
}) {
  return (
    <Box>
      <Box width={15}>
        <Text color={focused ? "cyan" : undefined} inverse={focused}>
          {focused ? "> " : "  "}
          {label}
        </Text>
      </Box>
      <Text color={focused ? "green" : undefined}>
        {formatEditableValue(value, focused)}
      </Text>
    </Box>
  );
}

function ProgressBar({ ratio, width = 28 }: { ratio: number; width?: number }) {
  const filledWidth = Math.round(width * ratio);
  const emptyWidth = width - filledWidth;

  return (
    <Text>
      <Text color="green">{"#".repeat(filledWidth)}</Text>
      <Text dimColor>{"-".repeat(emptyWidth)}</Text>
      {` ${(ratio * 100).toFixed(0)}%`}
    </Text>
  );
}

function CompletionReasons({
  summaries,
}: {
  summaries: readonly MonteCarloRunSummary[];
}) {
  const reasonCounts = new Map<string, number>();

  for (const summary of summaries) {
    if (summary.completionReason) {
      reasonCounts.set(
        summary.completionReason,
        (reasonCounts.get(summary.completionReason) ?? 0) + 1,
      );
    }
  }

  if (reasonCounts.size === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text dimColor>Completion reasons</Text>
      {[...reasonCounts].map(([reason, count]) => (
        <Text key={reason}>
          {reason}: {count}
        </Text>
      ))}
    </Box>
  );
}

function SampleSnapshot({
  placeNames,
  snapshot,
}: {
  placeNames: ReadonlyMap<string, string>;
  snapshot: MonteCarloRunSnapshot | null;
}) {
  if (!snapshot) {
    return null;
  }

  const entries = Object.entries(snapshot.placeTokenCounts);
  const visibleEntries = entries.slice(0, 8);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text dimColor>Run 1 latest place counts</Text>
      {visibleEntries.map(([placeId, count]) => (
        <Text key={placeId}>
          {placeNames.get(placeId) ?? placeId}: {count}
        </Text>
      ))}
      {entries.length > visibleEntries.length ? (
        <Text dimColor>
          + {entries.length - visibleEntries.length} more places
        </Text>
      ) : null}
    </Box>
  );
}

function RunStatus({
  placeNames,
  run,
}: {
  placeNames: ReadonlyMap<string, string>;
  run: SimulationRunState;
}) {
  if (run.status === "idle") {
    return <Text dimColor>Ready</Text>;
  }

  if (run.status === "cancelled") {
    return <Text color="yellow">{run.message}</Text>;
  }

  if (run.status === "error") {
    return (
      <Box flexDirection="column">
        <Text color="red">Cannot start simulation</Text>
        {run.message.split("\n").map((line) => (
          <Text color="red" key={line}>
            {line}
          </Text>
        ))}
      </Box>
    );
  }

  const ratio = formatProgressRatio(run.summaries, run.maxFrames);
  const currentFrame = Math.max(
    0,
    ...run.summaries.map((summary) => summary.frameNumber),
  );

  return (
    <Box flexDirection="column">
      <Text color={run.status === "complete" ? "green" : "cyan"}>
        {run.status === "complete" ? "Complete" : "Running"}
      </Text>
      <ProgressBar ratio={ratio} />
      <Text>
        Frame {currentFrame}/{run.maxFrames}
      </Text>
      <Text>
        Active {run.result.activeRuns} / complete {run.result.completedRuns} /
        errors {run.result.erroredRuns}
      </Text>
      <Text dimColor>Elapsed {formatElapsed(run.elapsedMs)}</Text>
      <CompletionReasons summaries={run.summaries} />
      <SampleSnapshot placeNames={placeNames} snapshot={run.sampleSnapshot} />
    </Box>
  );
}

export function PetrinautCliApp({
  examples,
}: {
  examples: LoadedPetrinautExample[];
}) {
  const { exit } = useApp();
  const { columns } = useWindowSize();
  const compact = columns < 118;
  const simulatorRef = useRef<MonteCarloSimulator | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialScenario =
    examples[0]?.petriNetDefinition.scenarios?.[0] ?? null;

  const [exampleIndex, setExampleIndex] = useState(0);
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [focusedParameterIndex, setFocusedParameterIndex] = useState(0);
  const [focus, setFocus] = useState<FocusTarget>("example");
  const [scenarioValues, setScenarioValues] = useState<Record<string, string>>(
    () => defaultScenarioValues(initialScenario),
  );
  const [maxTime, setMaxTime] = useState("100");
  const [dt, setDt] = useState("1");
  const [runCount, setRunCount] = useState("100");
  const [run, setRun] = useState<SimulationRunState>({ status: "idle" });

  const selectedExample = examples[exampleIndex];
  const scenarios = selectedExample?.petriNetDefinition.scenarios ?? [];
  const safeScenarioIndex =
    scenarios.length === 0 ? 0 : Math.min(scenarioIndex, scenarios.length - 1);
  const selectedScenario = scenarios[safeScenarioIndex] ?? null;
  const scenarioParameters = selectedScenario?.scenarioParameters ?? [];

  const focusOrder = useMemo(() => {
    const order: FocusTarget[] = ["example"];

    if (scenarios.length > 0) {
      order.push("scenario");
    }
    if (scenarioParameters.length > 0) {
      order.push("parameters");
    }

    order.push("maxTime", "dt", "runCount", "run");

    return order;
  }, [scenarioParameters.length, scenarios.length]);
  const activeFocus = focusOrder.includes(focus) ? focus : focusOrder[0]!;

  const placeNames = useMemo(() => {
    return new Map(
      (selectedExample?.petriNetDefinition.places ?? []).map((place) => [
        place.id,
        place.name,
      ]),
    );
  }, [selectedExample]);

  const runningStartedAt = run.status === "running" ? run.startedAt : null;
  const runningMaxFrames = run.status === "running" ? run.maxFrames : null;

  useEffect(() => {
    if (runningStartedAt === null || runningMaxFrames === null) {
      return;
    }

    let cancelled = false;
    const maxFrames = runningMaxFrames;
    const startedAt = runningStartedAt;

    const tick = () => {
      if (cancelled) {
        return;
      }

      const simulator = simulatorRef.current;
      if (!simulator) {
        return;
      }

      const result = simulator.advanceAll();
      const summaries = simulator.getSummaries();
      const sampleSnapshot = simulator.getRunSnapshot(0);
      const elapsedMs = Date.now() - startedAt;

      if (result.allFinished) {
        simulatorRef.current = null;
        setRun({
          elapsedMs,
          maxFrames,
          result,
          sampleSnapshot,
          startedAt,
          status: "complete",
          summaries,
        });
        return;
      }

      setRun({
        elapsedMs,
        maxFrames,
        result,
        sampleSnapshot,
        startedAt,
        status: "running",
        summaries,
      });
      timerRef.current = setTimeout(tick, 0);
    };

    timerRef.current = setTimeout(tick, 0);

    return () => {
      cancelled = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [runningMaxFrames, runningStartedAt]);

  useEffect(() => {
    return () => {
      simulatorRef.current = null;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const moveFocus = (offset: number) => {
    const currentIndex = Math.max(0, focusOrder.indexOf(activeFocus));
    const nextIndex =
      (currentIndex + offset + focusOrder.length) % focusOrder.length;

    setFocus(focusOrder[nextIndex]!);
  };

  const cancelRun = () => {
    simulatorRef.current = null;
    setRun({ message: "Simulation cancelled", status: "cancelled" });
  };

  const resetRun = () => {
    simulatorRef.current = null;
    setRun({ status: "idle" });
  };

  const selectExample = (nextIndex: number) => {
    const nextExample = examples[nextIndex];
    const nextScenario = nextExample?.petriNetDefinition.scenarios?.[0] ?? null;

    setExampleIndex(nextIndex);
    setScenarioIndex(0);
    setFocusedParameterIndex(0);
    setScenarioValues(defaultScenarioValues(nextScenario));
    resetRun();
  };

  const selectScenario = (nextIndex: number) => {
    const nextScenario = scenarios[nextIndex] ?? null;

    setScenarioIndex(nextIndex);
    setFocusedParameterIndex(0);
    setScenarioValues(defaultScenarioValues(nextScenario));
    resetRun();
  };

  const startSimulation = () => {
    if (!selectedExample) {
      setRun({ message: "No examples were found", status: "error" });
      return;
    }

    if (!selectedScenario) {
      setRun({
        message: "The selected example does not define a scenario",
        status: "error",
      });
      return;
    }

    const parsedScenarioValues = parseScenarioParameterValues(
      selectedScenario,
      scenarioValues,
    );
    const parsedSettings = parseSimulationSettings({ dt, maxTime, runCount });
    const errors = [...parsedScenarioValues.errors, ...parsedSettings.errors];

    if (errors.length > 0 || !parsedSettings.settings) {
      setRun({ message: errors.join("\n"), status: "error" });
      return;
    }

    const compilation = compileScenario(
      selectedScenario,
      selectedExample.petriNetDefinition.parameters,
      selectedExample.petriNetDefinition.places,
      selectedExample.petriNetDefinition.types,
      { scenarioParameterValues: parsedScenarioValues.values },
    );

    if (!compilation.ok) {
      setRun({
        message: compilation.errors
          .map((error) => `${error.source}:${error.itemId} ${error.message}`)
          .join("\n"),
        status: "error",
      });
      return;
    }

    try {
      const simulator = createMonteCarloSimulator({
        dt: parsedSettings.settings.dt,
        initialMarking: compilation.result.initialState,
        maxTime: parsedSettings.settings.maxTime,
        parameterValues: compilation.result.parameterValues,
        runCount: parsedSettings.settings.runCount,
        sdcpn: selectedExample.petriNetDefinition,
        seed: 1,
      });

      simulatorRef.current = simulator;
      setRun({
        elapsedMs: 0,
        maxFrames: Math.max(
          1,
          Math.ceil(
            parsedSettings.settings.maxTime / parsedSettings.settings.dt,
          ),
        ),
        result: initialResult(parsedSettings.settings.runCount),
        sampleSnapshot: simulator.getRunSnapshot(0),
        startedAt: Date.now(),
        status: "running",
        summaries: simulator.getSummaries(),
      });
    } catch (error) {
      simulatorRef.current = null;
      setRun({
        message: error instanceof Error ? error.message : String(error),
        status: "error",
      });
    }
  };

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit();
      return;
    }

    if (run.status === "running") {
      if (
        key.escape ||
        input === "q" ||
        (activeFocus === "run" && key.return)
      ) {
        cancelRun();
      }
      return;
    }

    if (key.escape || input === "q") {
      exit();
      return;
    }

    if (key.tab) {
      moveFocus(key.shift ? -1 : 1);
      return;
    }

    if (key.leftArrow) {
      moveFocus(-1);
      return;
    }

    if (key.rightArrow) {
      moveFocus(1);
      return;
    }

    if (activeFocus === "example") {
      if (key.upArrow) {
        selectExample(Math.max(0, exampleIndex - 1));
      } else if (key.downArrow) {
        selectExample(Math.min(examples.length - 1, exampleIndex + 1));
      } else if (key.return) {
        moveFocus(1);
      }
      return;
    }

    if (activeFocus === "scenario") {
      if (key.upArrow) {
        selectScenario(Math.max(0, safeScenarioIndex - 1));
      } else if (key.downArrow) {
        selectScenario(Math.min(scenarios.length - 1, safeScenarioIndex + 1));
      } else if (key.return) {
        moveFocus(1);
      }
      return;
    }

    if (activeFocus === "parameters") {
      const parameter = scenarioParameters[focusedParameterIndex];

      if (key.upArrow) {
        setFocusedParameterIndex((index) => Math.max(0, index - 1));
        return;
      }
      if (key.downArrow) {
        setFocusedParameterIndex((index) =>
          Math.min(scenarioParameters.length - 1, index + 1),
        );
        return;
      }

      if (!parameter) {
        return;
      }

      if (parameter.type === "boolean") {
        if (key.return || input === " ") {
          setScenarioValues((values) => ({
            ...values,
            [parameter.identifier]: toggleBooleanTextValue(
              values[parameter.identifier] ?? "",
            ),
          }));
        }
        return;
      }

      if (key.return) {
        moveFocus(1);
        return;
      }

      setScenarioValues((values) => ({
        ...values,
        [parameter.identifier]: editNumericTextValue(
          values[parameter.identifier] ?? "",
          input,
          key,
        ),
      }));
      return;
    }

    if (activeFocus === "maxTime") {
      if (key.return) {
        moveFocus(1);
      } else {
        setMaxTime((value) => editNumericTextValue(value, input, key));
      }
      return;
    }

    if (activeFocus === "dt") {
      if (key.return) {
        moveFocus(1);
      } else {
        setDt((value) => editNumericTextValue(value, input, key));
      }
      return;
    }

    if (activeFocus === "runCount") {
      if (key.return) {
        moveFocus(1);
      } else {
        setRunCount((value) => editNumericTextValue(value, input, key));
      }
      return;
    }

    if (key.return) {
      startSimulation();
    }
  });

  if (examples.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color="red">No examples found in src/examples</Text>
      </Box>
    );
  }

  const exampleOptions = examples.map((example) => ({
    description: example.title,
    key: example.fileName,
    label: example.fileName,
  }));
  const scenarioOptions = scenarios.map((scenario) => ({
    description: scenario.description,
    key: scenario.id,
    label: scenario.name,
  }));
  const selectorWidth = compact ? undefined : 42;
  const configWidth = compact ? undefined : 50;
  const runWidth = compact ? undefined : 46;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="cyan">
        Petrinaut Monte Carlo Simulator
      </Text>
      <Box flexDirection={compact ? "column" : "row"} marginTop={1}>
        <Box flexDirection="column">
          <Panel
            focused={activeFocus === "example"}
            title="Example File"
            width={selectorWidth}
          >
            <SelectList
              emptyLabel="No examples"
              focused={activeFocus === "example"}
              options={exampleOptions}
              selectedIndex={exampleIndex}
            />
          </Panel>
          <Panel
            focused={activeFocus === "scenario"}
            title="Scenario"
            width={selectorWidth}
          >
            <SelectList
              emptyLabel="No scenarios"
              focused={activeFocus === "scenario"}
              options={scenarioOptions}
              selectedIndex={safeScenarioIndex}
            />
          </Panel>
        </Box>

        <Box flexDirection="column">
          <Panel
            focused={activeFocus === "parameters"}
            title="Scenario Parameters"
            width={configWidth}
          >
            <ParameterRows
              focused={activeFocus === "parameters"}
              focusedParameterIndex={focusedParameterIndex}
              parameters={scenarioParameters}
              values={scenarioValues}
            />
          </Panel>
          <Panel
            focused={["maxTime", "dt", "runCount"].includes(activeFocus)}
            title="Simulation"
            width={configWidth}
          >
            <FieldRow
              focused={activeFocus === "maxTime"}
              label="Max time"
              value={maxTime}
            />
            <FieldRow focused={activeFocus === "dt"} label="dt" value={dt} />
            <FieldRow
              focused={activeFocus === "runCount"}
              label="Runs"
              value={runCount}
            />
          </Panel>
        </Box>

        <Panel focused={activeFocus === "run"} title="Run" width={runWidth}>
          <Text
            color={activeFocus === "run" ? "cyan" : undefined}
            inverse={activeFocus === "run"}
          >
            {run.status === "running"
              ? "> Stop simulation"
              : "> Run simulation"}
          </Text>
          <Box marginTop={1}>
            <RunStatus placeNames={placeNames} run={run} />
          </Box>
        </Panel>
      </Box>
      <Text dimColor>
        Tab changes focus. Arrows select rows. Enter advances or runs. Esc
        exits.
      </Text>
    </Box>
  );
}
