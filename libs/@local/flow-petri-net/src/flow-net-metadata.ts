import type { ArcEndpoint, JsonValue } from "@hashintel/petrinaut-core";
import type {
  ForEachStepDefinition,
  ValueAccess,
} from "@local/hash-isomorphic-utils/flows/types";

/*
 * What a compiled flow net records in its elements' metadata, for an executor that runs it and anything that
 * reads it, such as a run's view. Endpoints are given by Petrinaut id, as the net's arcs are.
 */

/**
 * What a transition does in a flow net, for the executor that runs it and for anyone reading the net.
 *
 * - `startStep`: starts an action step once its inputs are available, feeding every input port of its instance.
 * - `startForEach`: starts a `forEach` step once its array is available, turning it into an iterator.
 * - `copyOutput`: takes an output from a step's output port, and puts it where each of its readers and consumers takes it from. Only added when more than one place needs the value.
 * - `recordStepFailure`: moves a step's token from its instance's "gave up" port into `FailedStepRuns`, failing the run.
 * - `startItem` / `startCollecting`: start each item of a `forEach` step, then hand over to counting them as they finish.
 * - `collectItem` / `finishCollecting`: collect each item's output, and complete the `forEach` step once all are in.
 * - `startAttempt` / `succeedAttempt` / `failAttempt` / `retryAttempt` / `giveUp`: an action's lifecycle, inside its
 *   subnet. `succeedAttempt` and `failAttempt` fire when the action's activity completes; every other transition fires
 *   as soon as it's enabled.
 */
export type TransitionRole = TransitionMetadata["role"];

/** The roles of the transitions inside an action's subnet. */
export type ActionLifecycleRole =
  | "startAttempt"
  | "succeedAttempt"
  | "failAttempt"
  | "retryAttempt"
  | "giveUp";

/** Where one of an action's inputs gets its value, as the arcs of its step's `startStep` alone don't say. */
export type InputSource =
  | {
      kind: "value";
      /** The place or port the value is taken or read from. */
      from: ArcEndpoint;
      access: ValueAccess;
      wrap?: true;
      whenMissing?: "skip";
    }
  /** A constant, which the step's instance records in its `constants`. */
  | { kind: "constant" }
  /** Nothing is connected, and the input takes its default. */
  | { kind: "default" }
  /** Nothing is connected and there's no default: the input's port gets a token marked absent. */
  | { kind: "absent" };

/** A transition's metadata, by its role. Every transition of the root net names the step it's for. */
export type TransitionMetadata =
  | {
      role: "startStep";
      stepId: string;
      /** Action input name → where it gets its value. */
      inputSources: Record<string, InputSource>;
    }
  | {
      role: "startForEach";
      stepId: string;
      /** The array, when it's a constant rather than a connected value. */
      constant?: JsonValue;
    }
  | { role: "copyOutput"; stepId: string; outputName: string }
  | {
      role: "collectItem";
      stepId: string;
      collect: ForEachStepDefinition["collect"];
    }
  | {
      role:
        | "recordStepFailure"
        | "startItem"
        | "startCollecting"
        | "finishCollecting";
      stepId: string;
    }
  | { role: ActionLifecycleRole };

/** A step's instance of its action's subnet. */
export type InstanceMetadata = {
  actionDefinitionId: string;
  /** Action input name → the constant it's given. */
  constants?: Record<string, JsonValue>;
};

/** An action's subnet. */
export type SubnetMetadata = { actionDefinitionId: string };

/** The root net. */
export type FlowNetMetadata = {
  /** Flow input name → the places a run puts its value in when it starts. */
  flowInputs: Record<string, ArcEndpoint[]>;
  /** The places a run puts a `Pending` token in when it starts: one per top-level step. */
  pendingAtStart: ArcEndpoint[];
  /** Flow output name → where its value is found. */
  flowOutputs: Record<string, ArcEndpoint>;
};
