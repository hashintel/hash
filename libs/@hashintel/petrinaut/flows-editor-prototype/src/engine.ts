/**
 * The one place the prototype imports the flow engine from. Everything the editor shows about steps, inputs and
 * connections comes from these real types and functions; what the engine lacks is in the `mock-*` files.
 */
import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { canConnect } from "@local/hash-isomorphic-utils/flows/can-connect";
import { createStepShapeResolver } from "@local/hash-isomorphic-utils/flows/step-shapes";
import {
  allPayloadKinds,
  payloadKindTraits,
} from "@local/hash-isomorphic-utils/flows/types";
import { validateFlowDefinition } from "@local/hash-isomorphic-utils/flows/validate-flow-definition";

import type { ConnectionSource } from "@local/hash-isomorphic-utils/flows/can-connect";
import type {
  FilterCondition,
  FilterLeaf,
} from "@local/hash-isomorphic-utils/flows/filter-condition";
import type {
  CronScheduleSpec,
  ScheduleSpec,
} from "@local/hash-isomorphic-utils/flows/schedule-types";
import type {
  ActionDefinition,
  ActionStepDefinition,
  EntityQuery,
  FlowActionDefinitionId,
  FlowDefinition,
  FlowInputDefinition,
  ForEachStepDefinition,
  PayloadKind,
  StepDefinition,
  StepInputSource,
} from "@local/hash-isomorphic-utils/flows/types";
import type { FlowDefinitionDiagnostic } from "@local/hash-isomorphic-utils/flows/validate-flow-definition";

export {
  actionDefinitions,
  allPayloadKinds,
  canConnect,
  createStepShapeResolver,
  payloadKindTraits,
  validateFlowDefinition,
};

export type {
  ActionDefinition,
  ActionStepDefinition,
  ConnectionSource,
  CronScheduleSpec,
  EntityQuery,
  FilterCondition,
  FilterLeaf,
  FlowActionDefinitionId,
  FlowDefinition,
  FlowDefinitionDiagnostic,
  FlowInputDefinition,
  ForEachStepDefinition,
  PayloadKind,
  ScheduleSpec,
  StepDefinition,
  StepInputSource,
};

/** The engine's ids are a closed union; the editor also places actions that exist only in open PRs or mocks. */
export type EditorFlowDefinition = FlowDefinition<string>;
export type EditorStep = StepDefinition<string>;
export type EditorActionStep = ActionStepDefinition<string>;
export type EditorForEachStep = ForEachStepDefinition<string>;
