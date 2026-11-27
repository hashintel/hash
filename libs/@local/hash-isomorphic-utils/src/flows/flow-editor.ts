import { getValueSources, mapValueSources } from "./built-sources.js";
import {
  addStepIdsToDiagnostics,
  type FlowDefinitionDiagnosticWithStepId,
  validateFlowDefinition,
} from "./validate-flow-definition.js";

import type {
  ActionStepDefinition,
  FlowDefinition,
  FlowInputDefinition,
  ForEachStepDefinition,
  StepDefinition,
  StepInputSource,
  ValueSource,
} from "./types.js";

export type StepPosition = NonNullable<StepDefinition<string>["position"]>;

/**
 * A connection: a line between two steps that only sets the order they run in. Step `to` runs after step `from`,
 * which is in its `runAfter`. With `outputName`, the line leaves one of `from`'s paths, such as an If's `true`.
 */
export type FlowConnection = { from: string; to: string; outputName?: string };

type RunAfter = NonNullable<StepDefinition<string>["runAfter"]>;

/** The `runAfter` entry for following `stepId`, or one of its paths. */
const runAfterEntry = (stepId: string, outputName: string | undefined) =>
  outputName === undefined ? { stepId } : { stepId, outputName };

const isEntryFor =
  (stepId: string, outputName: string | undefined) =>
  (entry: RunAfter[number]) =>
    entry.stepId === stepId && entry.outputName === outputName;

/**
 * Where a new step goes: after a step or one of its paths, into a connection (`from` → new step → `to`), or on its
 * own, inside the for-each step `inside` if given. After a step or into a connection, it goes in that step's for-each
 * step, if any.
 */
export type NewStepPlacement =
  | { after: string; outputName?: string; position?: StepPosition }
  | { into: FlowConnection; position?: StepPosition }
  | { position: StepPosition; inside?: string };

export type FlowEditorState = {
  flowDefinition: FlowDefinition<string>;
  /** The problems found in the definition, by the id of the innermost step each is in. */
  problemsByStepId: Map<string, FlowDefinitionDiagnosticWithStepId[]>;
  /** The problems outside every step, e.g. with the flow's inputs or outputs. */
  flowProblems: FlowDefinitionDiagnosticWithStepId[];
};

/**
 * What can change about a flow input. Its name can't: steps refer to the input by it, so a rename changes the label.
 */
export type FlowInputChanges = Partial<
  Pick<FlowInputDefinition, "label" | "payloadKind" | "array" | "required">
>;

/** A change to the state. It's an edit unless it came from `placeSteps`, which shouldn't be saved on its own. */
export type FlowEditorChange = { edited: boolean };

const checkFlowDefinition = (
  flowDefinition: FlowDefinition<string>,
): FlowEditorState => {
  const problemsByStepId = new Map<
    string,
    FlowDefinitionDiagnosticWithStepId[]
  >();
  const flowProblems: FlowDefinitionDiagnosticWithStepId[] = [];

  for (const problem of addStepIdsToDiagnostics(
    flowDefinition,
    validateFlowDefinition(flowDefinition).diagnostics,
  )) {
    if (problem.stepId === undefined) {
      flowProblems.push(problem);
      continue;
    }

    const stepProblems = problemsByStepId.get(problem.stepId);

    if (stepProblems) {
      stepProblems.push(problem);
    } else {
      problemsByStepId.set(problem.stepId, [problem]);
    }
  }

  return { flowDefinition, problemsByStepId, flowProblems };
};

const getStepIds = (step: StepDefinition<string>): string[] => [
  step.stepId,
  ...(step.kind === "for-each" ? step.steps.flatMap(getStepIds) : []),
];

/**
 * A new step id from the step's action id, e.g. `answerQuestion2`. It isn't the id of any step, nor one that
 * anything refers to: an input left referring to a removed step would otherwise take its values from the new one.
 */
const newStepId = (
  flowDefinition: FlowDefinition<string>,
  actionDefinitionId: string,
) => {
  const usedStepIds = new Set(
    flowDefinition.outputs.map(({ stepId }) => stepId),
  );

  const addSource = (source: StepInputSource) => {
    for (const valueSource of getValueSources(source)) {
      if (valueSource.kind === "step-output") {
        usedStepIds.add(valueSource.stepId);
      }
    }
  };

  const addSteps = (steps: StepDefinition<string>[]) => {
    for (const step of steps) {
      usedStepIds.add(step.stepId);

      for (const { stepId } of step.runAfter ?? []) {
        usedStepIds.add(stepId);
      }

      if (step.kind === "action") {
        for (const source of Object.values(step.inputs)) {
          addSource(source);
        }
      } else {
        if (step.over) {
          addSource(step.over);
        }
        if (step.collect) {
          usedStepIds.add(step.collect.stepId);
        }
        addSteps(step.steps);
      }
    }
  };

  addSteps(flowDefinition.steps);

  let stepId = actionDefinitionId;

  for (let index = 2; usedStepIds.has(stepId); index++) {
    stepId = `${actionDefinitionId}${index}`;
  }

  return stepId;
};

/** A step that runs after the given steps, with no `runAfter` if there are none. */
const setRunAfter = (step: StepDefinition<string>, runAfter: RunAfter) => {
  const updated: StepDefinition<string> = { ...step, runAfter };

  if (runAfter.length === 0) {
    delete updated.runAfter;
  }

  return updated;
};

/** Applies `update` to every step at any depth, keeping the arrays and steps it leaves as they were. */
const mapSteps = (
  steps: StepDefinition<string>[],
  update: (step: StepDefinition<string>) => StepDefinition<string>,
): StepDefinition<string>[] => {
  const mapped = steps.map((step) => {
    let updated = update(step);

    if (updated.kind === "for-each") {
      const inner = mapSteps(updated.steps, update);

      if (inner !== updated.steps) {
        updated = { ...updated, steps: inner };
      }
    }

    return updated;
  });

  return mapped.every((step, index) => step === steps[index]) ? steps : mapped;
};

/** Removes the connections from the given steps, at any depth. */
const removeConnectionsFrom = (
  steps: StepDefinition<string>[],
  stepIds: Set<string>,
): StepDefinition<string>[] =>
  mapSteps(steps, (step) => {
    const runAfter = step.runAfter?.filter(
      ({ stepId }) => !stepIds.has(stepId),
    );

    return runAfter && runAfter.length !== step.runAfter?.length
      ? setRunAfter(step, runAfter)
      : step;
  });

const replaceStep = (
  steps: StepDefinition<string>[],
  updated: StepDefinition<string>,
) =>
  mapSteps(steps, (step) => (step.stepId === updated.stepId ? updated : step));

/** A step, and the for-each step it's directly inside, if any. */
type StepEntry = {
  step: StepDefinition<string>;
  parent: ForEachStepDefinition<string> | null;
};

const findStepEntry = (
  steps: StepDefinition<string>[],
  stepId: string,
  parent: ForEachStepDefinition<string> | null = null,
): StepEntry | undefined => {
  for (const step of steps) {
    if (step.stepId === stepId) {
      return { step, parent };
    }

    if (step.kind === "for-each") {
      const found = findStepEntry(step.steps, stepId, step);

      if (found) {
        return found;
      }
    }
  }

  return undefined;
};

/** The name a for-each step's collected output takes, from the output it collects: `body` gives `collectedBody`. */
const getCollectedOutputName = (outputName: string) =>
  `collected${outputName.charAt(0).toUpperCase()}${outputName.slice(1)}`;

/** `source` reading the for-each step's output by `as`, if it reads that step's output by another name. */
const repointToCollected = (
  source: ValueSource,
  forEachStepId: string,
  as: string,
): ValueSource =>
  source.kind === "step-output" &&
  source.stepId === forEachStepId &&
  source.outputName !== as
    ? { ...source, outputName: as }
    : source;

/**
 * Holds a flow definition being edited and applies edits to it, checking it after each one, so that a canvas and
 * panels only draw it and send edits. Each edit replaces the state rather than changing it. Edits apply to steps at
 * any depth, except flow outputs, which only top-level steps give.
 *
 * Edits never fail because a step is half-built, such as a for-each step with no list: its problems are listed
 * instead. They throw only when what they name isn't there: a step, the connection to insert a step into, an action
 * step's inputs, a for-each step's list, or a flow input.
 */
export const createFlowEditor = (flowDefinition: FlowDefinition<string>) => {
  let state = checkFlowDefinition(flowDefinition);
  const listeners = new Set<(change: FlowEditorChange) => void>();

  const setFlowDefinition = (
    updated: FlowDefinition<string>,
    change: FlowEditorChange = { edited: true },
  ) => {
    state = checkFlowDefinition(updated);

    for (const listener of listeners) {
      listener(change);
    }
  };

  const setSteps = (
    steps: StepDefinition<string>[],
    change: FlowEditorChange = { edited: true },
  ) => setFlowDefinition({ ...state.flowDefinition, steps }, change);

  const getStepEntry = (stepId: string) => {
    const entry = findStepEntry(state.flowDefinition.steps, stepId);

    if (!entry) {
      throw new Error(`The flow has no step "${stepId}"`);
    }

    return entry;
  };

  const getStep = (stepId: string) => getStepEntry(stepId).step;

  const getForEachStep = (stepId: string) => {
    const step = getStep(stepId);

    if (step.kind !== "for-each") {
      throw new Error(`Step "${stepId}" isn't a for-each step`);
    }

    return step;
  };

  const getFlowInput = (name: string) => {
    const input = state.flowDefinition.inputs.find(
      (candidate) => candidate.name === name,
    );

    if (!input) {
      throw new Error(`The flow has no input "${name}"`);
    }

    return input;
  };

  /** Adds the step `createStep` makes where `placement` says, returning its id. */
  const insertStep = (
    idBase: string,
    createStep: (stepId: string) => StepDefinition<string>,
    placement: NewStepPlacement,
  ) => {
    const stepId = newStepId(state.flowDefinition, idBase);
    let steps = state.flowDefinition.steps;
    let runAfter: RunAfter = [];
    let parent: ForEachStepDefinition<string> | null = null;

    if ("after" in placement) {
      ({ parent } = getStepEntry(placement.after));
      runAfter = [runAfterEntry(placement.after, placement.outputName)];
    } else if ("into" in placement) {
      const { from, to, outputName } = placement.into;
      const toEntry = getStepEntry(to);
      const toRunAfter = toEntry.step.runAfter ?? [];
      const index = toRunAfter.findIndex(isEntryFor(from, outputName));

      if (index === -1) {
        throw new Error(`Step "${to}" doesn't run after step "${from}"`);
      }

      /* The new step takes over the path; `to` follows the new step. */
      ({ parent } = toEntry);
      runAfter = [runAfterEntry(from, outputName)];
      steps = replaceStep(
        steps,
        setRunAfter(toEntry.step, toRunAfter.with(index, { stepId })),
      );
    } else if (placement.inside !== undefined) {
      parent = getForEachStep(placement.inside);
    }

    const step = setRunAfter(
      {
        ...createStep(stepId),
        ...(placement.position && { position: placement.position }),
      },
      runAfter,
    );

    if (parent) {
      const parentId = parent.stepId;

      steps = mapSteps(steps, (candidate) =>
        candidate.stepId === parentId && candidate.kind === "for-each"
          ? { ...candidate, steps: [...candidate.steps, step] }
          : candidate,
      );
    } else {
      steps = [...steps, step];
    }

    setSteps(steps);

    return stepId;
  };

  return {
    getState: () => state,

    /** Calls `listener` after every change to the state. Returns a function that stops it. */
    subscribe: (listener: (change: FlowEditorChange) => void) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },

    /** Giving the flow the name it has isn't an edit, so nothing is saved. */
    setName: (name: string) => {
      if (name === state.flowDefinition.name) {
        return;
      }

      setFlowDefinition({ ...state.flowDefinition, name });
    },

    /** Adds a step that runs an action, with no inputs yet, returning its id. */
    addStep: (actionDefinitionId: string, placement: NewStepPlacement) =>
      insertStep(
        actionDefinitionId,
        (stepId): ActionStepDefinition<string> => ({
          kind: "action",
          stepId,
          actionDefinitionId,
          description: "",
          inputs: {},
        }),
        placement,
      ),

    /** Adds a for-each step with no list, no steps inside and nothing collected yet, returning its id. */
    addForEach: (placement: NewStepPlacement) =>
      insertStep(
        "forEach",
        (stepId): ForEachStepDefinition<string> => ({
          kind: "for-each",
          stepId,
          description: "",
          steps: [],
        }),
        placement,
      ),

    setStepDescription: (stepId: string, description: string) => {
      setSteps(
        replaceStep(state.flowDefinition.steps, {
          ...getStep(stepId),
          description,
        }),
      );
    },

    /** Adds an input to the flow, which whatever starts a run supplies. A name already taken is listed as a problem. */
    addFlowInput: (input: FlowInputDefinition) => {
      setFlowDefinition({
        ...state.flowDefinition,
        inputs: [...state.flowDefinition.inputs, input],
      });
    },

    /**
     * Changes a flow input's label, type or whether it's required. Steps that use it keep it, and one that can't take
     * its new type lists that as a problem. A name repeated in a loaded flow changes every input with it.
     */
    updateFlowInput: (name: string, changes: FlowInputChanges) => {
      getFlowInput(name);

      setFlowDefinition({
        ...state.flowDefinition,
        inputs: state.flowDefinition.inputs.map((input) =>
          input.name === name ? { ...input, ...changes } : input,
        ),
      });
    },

    /** Removes a flow input. Inputs that take its value keep their source, which is then a problem. */
    removeFlowInput: (name: string) => {
      getFlowInput(name);

      setFlowDefinition({
        ...state.flowDefinition,
        inputs: state.flowDefinition.inputs.filter(
          (input) => input.name !== name,
        ),
      });
    },

    moveStep: (stepId: string, position: StepPosition) => {
      setSteps(
        replaceStep(state.flowDefinition.steps, {
          ...getStep(stepId),
          position,
        }),
      );
    },

    /**
     * Gives steps the positions they're drawn at, e.g. steps with none when the flow is opened. This isn't an edit:
     * the positions are saved with the next edit.
     */
    placeSteps: (positions: Map<string, StepPosition>) => {
      if (positions.size === 0) {
        return;
      }

      for (const stepId of positions.keys()) {
        getStep(stepId);
      }

      setSteps(
        mapSteps(state.flowDefinition.steps, (step) => {
          const position = positions.get(step.stepId);

          return position ? { ...step, position } : step;
        }),
        { edited: false },
      );
    },

    /**
     * Removes a step, with the steps inside it, every connection to and from them, and every flow output they give. A
     * for-each step that collected the output of a removed step collects nothing. Inputs that take a value from a
     * removed step keep their source, which is then a problem.
     */
    removeStep: (stepId: string) => {
      const { step: removed, parent } = getStepEntry(stepId);
      const removedStepIds = new Set(getStepIds(removed));
      const withoutStep = (steps: StepDefinition<string>[]) =>
        steps.filter((step) => step.stepId !== stepId);

      const steps = parent
        ? mapSteps(state.flowDefinition.steps, (step) =>
            step.stepId === parent.stepId && step.kind === "for-each"
              ? { ...step, steps: withoutStep(step.steps) }
              : step,
          )
        : withoutStep(state.flowDefinition.steps);

      setFlowDefinition({
        ...state.flowDefinition,
        steps: mapSteps(
          removeConnectionsFrom(steps, removedStepIds),
          (step) => {
            if (
              step.kind !== "for-each" ||
              !step.collect ||
              !removedStepIds.has(step.collect.stepId)
            ) {
              return step;
            }

            const { collect: _collect, ...collectingNothing } = step;

            return collectingNothing;
          },
        ),
        outputs: state.flowDefinition.outputs.filter(
          (output) => !removedStepIds.has(output.stepId),
        ),
      });
    },

    /** Sets the list a for-each step runs its steps once per item of, or clears it if `source` is `null`. */
    setForEachList: (stepId: string, source: ValueSource | null) => {
      const { over: _over, ...step } = getForEachStep(stepId);

      setSteps(
        replaceStep(
          state.flowDefinition.steps,
          source ? { ...step, over: source } : step,
        ),
      );
    },

    /**
     * Sets the output a for-each step collects from every item, named after it (`body` gives `collectedBody`), and
     * points everything that read the step's output to it. Clearing it, with `null`, leaves those as problems.
     */
    setForEachCollect: (
      stepId: string,
      collected: { stepId: string; outputName: string } | null,
    ) => {
      const { collect: _collect, ...step } = getForEachStep(stepId);

      if (!collected) {
        setSteps(replaceStep(state.flowDefinition.steps, step));
        return;
      }

      const as = getCollectedOutputName(collected.outputName);
      const repoint = (source: ValueSource) =>
        repointToCollected(source, stepId, as);

      setFlowDefinition({
        ...state.flowDefinition,
        steps: mapSteps(
          replaceStep(state.flowDefinition.steps, {
            ...step,
            collect: { ...collected, as },
          }),
          (stepToRepoint) => {
            /* A connection naming the step's output, as one on a path does, names the collected one too. */
            const candidate = stepToRepoint.runAfter?.some(
              (entry) =>
                entry.stepId === stepId &&
                entry.outputName !== undefined &&
                entry.outputName !== as,
            )
              ? setRunAfter(
                  stepToRepoint,
                  stepToRepoint.runAfter.map((entry) =>
                    entry.stepId === stepId && entry.outputName !== undefined
                      ? { ...entry, outputName: as }
                      : entry,
                  ),
                )
              : stepToRepoint;

            if (candidate.kind === "for-each") {
              const over = candidate.over && repoint(candidate.over);

              return over === candidate.over
                ? candidate
                : { ...candidate, over };
            }

            const inputs = Object.entries(candidate.inputs);
            const repointed = inputs.map(
              ([name, source]) =>
                [name, mapValueSources(source, repoint)] as const,
            );

            return repointed.every(
              ([, source], index) => source === inputs[index]?.[1],
            )
              ? candidate
              : { ...candidate, inputs: Object.fromEntries(repointed) };
          },
        ),
        outputs: state.flowDefinition.outputs.map((output) =>
          output.stepId === stepId && output.outputName !== as
            ? { ...output, outputName: as }
            : output,
        ),
      });
    },

    /**
     * Makes an output of a top-level step one of the flow's outputs, which a run gives back when it finishes. It's
     * named after the output, and numbered if a flow output already has that name: "body", then "body 2". Does
     * nothing if the output is already a flow output.
     */
    markFlowOutput: (stepId: string, outputName: string) => {
      if (getStepEntry(stepId).parent) {
        throw new Error(
          `Step "${stepId}" is inside a for-each step, so its outputs can't be flow outputs`,
        );
      }

      const { outputs } = state.flowDefinition;

      if (
        outputs.some(
          (output) =>
            output.stepId === stepId && output.outputName === outputName,
        )
      ) {
        return;
      }

      const takenNames = new Set(outputs.map(({ name }) => name));
      let name = outputName;

      for (let index = 2; takenNames.has(name); index++) {
        name = `${outputName} ${index}`;
      }

      setFlowDefinition({
        ...state.flowDefinition,
        outputs: [...outputs, { name, stepId, outputName }],
      });
    },

    /** Stops a step's output being a flow output. The step may not exist, e.g. if the output is a problem. */
    unmarkFlowOutput: (stepId: string, outputName: string) => {
      const { outputs } = state.flowDefinition;
      const kept = outputs.filter(
        (output) =>
          output.stepId !== stepId || output.outputName !== outputName,
      );

      if (kept.length === outputs.length) {
        return;
      }

      setFlowDefinition({ ...state.flowDefinition, outputs: kept });
    },

    /** Sets where an input of an action step takes its value from, or clears it if `source` is `null`. */
    setInputSource: (
      stepId: string,
      inputName: string,
      source: StepInputSource | null,
    ) => {
      const step = getStep(stepId);

      if (step.kind !== "action") {
        throw new Error(
          `Step "${stepId}" is a for-each step: set its list instead`,
        );
      }

      setSteps(
        replaceStep(state.flowDefinition.steps, {
          ...step,
          inputs: source
            ? { ...step.inputs, [inputName]: source }
            : Object.fromEntries(
                Object.entries(step.inputs).filter(
                  ([name]) => name !== inputName,
                ),
              ),
        }),
      );
    },

    /** Does nothing if `to` already runs after `from`, on any of its paths: a step follows another at most once. */
    addConnection: ({ from, to, outputName }: FlowConnection) => {
      getStep(from);
      const step = getStep(to);
      const runAfter = step.runAfter ?? [];

      if (runAfter.some(({ stepId }) => stepId === from)) {
        return;
      }

      setSteps(
        replaceStep(
          state.flowDefinition.steps,
          setRunAfter(step, [...runAfter, runAfterEntry(from, outputName)]),
        ),
      );
    },

    /** Removes a connection, which may come from a step that doesn't exist. */
    removeConnection: ({ from, to, outputName }: FlowConnection) => {
      const step = getStep(to);
      const runAfter = step.runAfter ?? [];
      const isConnection = isEntryFor(from, outputName);

      if (!runAfter.some(isConnection)) {
        return;
      }

      setSteps(
        replaceStep(
          state.flowDefinition.steps,
          setRunAfter(
            step,
            runAfter.filter((entry) => !isConnection(entry)),
          ),
        ),
      );
    },

    /**
     * Makes `to` the only step on `stepId`'s `outputName` path, or ends the path if `to` is `null`. A `to` on another
     * of the step's paths moves to this one.
     */
    setPathTarget: (stepId: string, outputName: string, to: string | null) => {
      getStep(stepId);

      if (to !== null) {
        getStep(to);
      }

      const isOnPath = isEntryFor(stepId, outputName);

      setSteps(
        mapSteps(state.flowDefinition.steps, (step) => {
          if (step.stepId === to) {
            return setRunAfter(step, [
              ...(step.runAfter ?? []).filter(
                (entry) => entry.stepId !== stepId,
              ),
              runAfterEntry(stepId, outputName),
            ]);
          }

          const kept = step.runAfter?.filter((entry) => !isOnPath(entry));

          return kept && kept.length !== step.runAfter?.length
            ? setRunAfter(step, kept)
            : step;
        }),
      );
    },

    setPathName: (stepId: string, outputName: string, name: string) => {
      const step = getStep(stepId);

      if (step.kind !== "action") {
        throw new Error(`Step "${stepId}" is a for-each step, with no paths`);
      }

      setSteps(
        replaceStep(state.flowDefinition.steps, {
          ...step,
          pathNames: { ...step.pathNames, [outputName]: name },
        }),
      );
    },

    /** Removes every connection to and from a step. */
    disconnectStep: (stepId: string) => {
      setSteps(
        removeConnectionsFrom(
          replaceStep(
            state.flowDefinition.steps,
            setRunAfter(getStep(stepId), []),
          ),
          new Set([stepId]),
        ),
      );
    },
  };
};

export type FlowEditor = ReturnType<typeof createFlowEditor>;
