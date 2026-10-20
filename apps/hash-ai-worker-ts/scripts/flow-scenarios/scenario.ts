import type { PropertyObject, VersionedUrl } from "@blockprotocol/type-system";
import type {
  FlowDefinitionWithId,
  FlowInputValues,
} from "@local/hash-isomorphic-utils/flows/types";
import type {
  FlowRunStatus,
  FlowStepStatus,
} from "@local/hash-isomorphic-utils/graphql/api-types.gen";

export type StepExpectation = {
  /** The step's status. Defaults to `COMPLETED`. */
  status?: `${FlowStepStatus}`;
  /** Expected payload values (the `value`, not the `{ kind, value }` wrapper) by output name, compared exactly. */
  outputs?: Record<string, unknown>;
  /** Outputs the step must not produce, such as the branch an If didn't take. */
  absentOutputs?: string[];
};

export type ScenarioRun = {
  flow: FlowDefinitionWithId;
  /**
   * A `{ kind, value }` payload for each flow input, or a function returning them from the scenario's `runTag`: a
   * value unique to each time the scenario runs, e.g. to mark the entities a run creates so that a later run only
   * finds those.
   */
  inputs: FlowInputValues | ((context: { runTag: string }) => FlowInputValues);
  expect: {
    /** The run's status. Defaults to `COMPLETED`. */
    status?: `${FlowRunStatus}`;
    /** Expected payload values of the flow's outputs by output name, compared exactly. */
    outputs?: Record<string, unknown>;
    /** By step id. A step inside a `forEach` runs once per item, as `<stepId>~<index>`. */
    steps?: Record<string, StepExpectation>;
  };
};

/** An entity to create before the first run, with values for some of its properties keyed by property type base URL. */
export type SeedEntity = {
  entityTypeId: VersionedUrl;
  properties: PropertyObject;
};

export type FlowScenario = {
  name: string;
  /** What the scenario proves, shown at the top of the report. */
  purpose?: string;
  /** The shortname of the user to run as, in their own web. Defaults to `alice`. */
  user?: string;
  /**
   * Entities to create in the user's web, as the user, before the first run, for flows that need entities to exist.
   * Give them the `runTag`, e.g. as a property value, so that a run's query only finds this time's entities.
   */
  seed?: (context: { runTag: string }) => SeedEntity[];
  /**
   * The flow runs, started one after another, each once the one before has finished. A flow's steps only wait for
   * the steps whose outputs they take, so a step that has to see what another flow's run did goes in a later run.
   */
  runs: [ScenarioRun, ...ScenarioRun[]];
};

export const defineScenario = (scenario: FlowScenario) => scenario;
