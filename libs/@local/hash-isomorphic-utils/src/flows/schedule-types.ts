import type { EntityUuid, WebId } from "@blockprotocol/type-system";

import type {
  FlowTypeDataType,
  ScheduleOverlapPolicyDataType,
} from "../system-types/shared.js";
import type { FlowDataSources, FlowTrigger } from "./types.js";

/**
 * Interval-based schedule specification.
 * Executes at regular intervals (e.g., every 10 minutes).
 */
export type IntervalScheduleSpec = {
  type: "interval";
  /** Interval in milliseconds between executions */
  intervalMs: number;
};

/**
 * Cron-based schedule specification.
 * Uses cron expression syntax for more complex scheduling patterns.
 */
export type CronScheduleSpec = {
  type: "cron";
  /** Cron expression (e.g., "0 0/10 * * * *" for every 10 minutes) */
  cronExpression: string;
  /** Optional timezone for the cron schedule (e.g., "America/New_York") */
  timezone?: string;
};

/**
 * Union type representing different scheduling strategies.
 * This is stored as an object in the database (scheduleSpec property type).
 */
export type ScheduleSpec = IntervalScheduleSpec | CronScheduleSpec;

/** Default catchup window: 1 hour in milliseconds */
export const defaultScheduleCatchupWindowMs = 60 * 60 * 1000;

/**
 * Input for creating a new flow schedule.
 */
export type CreateFlowScheduleInput = {
  /** Human-readable name for this schedule */
  name: string;
  /** The flow definition to execute */
  flowDefinitionId: EntityUuid;
  /** The type of flow (ai or integration) */
  flowType: FlowTypeDataType;
  /** The web this schedule belongs to */
  webId: WebId;
  /** The scheduling specification */
  scheduleSpec: ScheduleSpec;
  /** Policy for handling overlapping runs (defaults to CANCEL_OTHER) */
  overlapPolicy?: ScheduleOverlapPolicyDataType;
  /** How far back to catch up missed runs after downtime, in milliseconds (defaults to 1 hour) */
  catchupWindowMs?: number;
  /** Whether to pause the schedule if a run fails (defaults to false) */
  pauseOnFailure?: boolean;
  /** Data sources for AI flows */
  dataSources?: FlowDataSources;
  /** The trigger configuration for the flow */
  flowTrigger: FlowTrigger;
};

/**
 * Input for updating an existing flow schedule.
 */
export type UpdateFlowScheduleInput = {
  /** Updated name */
  name?: string;
  /** Updated scheduling specification */
  scheduleSpec?: ScheduleSpec;
  /** Updated overlap policy */
  overlapPolicy?: ScheduleOverlapPolicyDataType;
  /** Updated catchup window in milliseconds */
  catchupWindowMs?: number;
  /** Updated pause on failure setting */
  pauseOnFailure?: boolean;
  /** Updated data sources */
  dataSources?: FlowDataSources;
};

/**
 * The default schedule overlap policy.
 */
export const defaultScheduleOverlapPolicy: ScheduleOverlapPolicyDataType =
  "CANCEL_OTHER";

/**
 * The default pause on failure setting.
 */
export const defaultSchedulePauseOnFailure = false;

/**
 * Converts our ScheduleSpec to Temporal's IntervalSpec or ScheduleSpec format.
 */
export const scheduleSpecToTemporalSpec = (spec: ScheduleSpec) => {
  if (spec.type === "interval") {
    return {
      intervals: [{ every: spec.intervalMs }],
    };
  }

  return {
    cronExpressions: [spec.cronExpression],
    ...(spec.timezone ? { timezone: spec.timezone } : {}),
  };
};

/**
 * Converts our ScheduleOverlapPolicy to Temporal's ScheduleOverlapPolicy enum value.
 */
export const overlapPolicyToTemporal = (
  policy: ScheduleOverlapPolicyDataType,
): number => {
  const policyMap: Record<ScheduleOverlapPolicyDataType, number> = {
    SKIP: 1,
    BUFFER_ONE: 2,
    ALLOW_ALL: 3,
    CANCEL_OTHER: 4,
  };
  return policyMap[policy];
};
