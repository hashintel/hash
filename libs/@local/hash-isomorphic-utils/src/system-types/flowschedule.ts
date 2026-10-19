/**
 * This file was automatically generated – do not edit it.
 */

import type {
  BooleanDataType,
  BooleanDataTypeWithMetadata,
  DateTimeDataType,
  DateTimeDataTypeWithMetadata,
  DescriptionPropertyValue,
  DescriptionPropertyValueWithMetadata,
  DurationDataType,
  DurationDataTypeWithMetadata,
  FlowDefinition,
  FlowDefinitionOutgoingLinkAndTarget,
  FlowDefinitionOutgoingLinksByLinkEntityTypeId,
  FlowDefinitionProperties,
  FlowDefinitionPropertiesWithMetadata,
  FlowTrigger,
  FlowTriggerOutgoingLinkAndTarget,
  FlowTriggerOutgoingLinksByLinkEntityTypeId,
  FlowTriggerProperties,
  FlowTriggerPropertiesWithMetadata,
  FlowTriggerUsesLink,
  InputDefinitionPropertyValue,
  InputDefinitionPropertyValueWithMetadata,
  InputsPropertyValue,
  InputsPropertyValueWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  NamePropertyValue,
  NamePropertyValueWithMetadata,
  NumberDataType,
  NumberDataTypeWithMetadata,
  ObjectDataType,
  ObjectDataTypeWithMetadata,
  OutputDefinitionPropertyValue,
  OutputDefinitionPropertyValueWithMetadata,
  StepDefinitionPropertyValue,
  StepDefinitionPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  Uses,
  UsesOutgoingLinkAndTarget,
  UsesOutgoingLinksByLinkEntityTypeId,
  UsesProperties,
  UsesPropertiesWithMetadata,
  ValueDataType,
  ValueDataTypeWithMetadata,
} from "./shared.js";
import type {
  Confidence,
  ObjectMetadata,
  PropertyProvenance,
} from "@blockprotocol/type-system";

export type {
  BooleanDataType,
  BooleanDataTypeWithMetadata,
  DateTimeDataType,
  DateTimeDataTypeWithMetadata,
  DescriptionPropertyValue,
  DescriptionPropertyValueWithMetadata,
  DurationDataType,
  DurationDataTypeWithMetadata,
  FlowDefinition,
  FlowDefinitionOutgoingLinkAndTarget,
  FlowDefinitionOutgoingLinksByLinkEntityTypeId,
  FlowDefinitionProperties,
  FlowDefinitionPropertiesWithMetadata,
  FlowTrigger,
  FlowTriggerOutgoingLinkAndTarget,
  FlowTriggerOutgoingLinksByLinkEntityTypeId,
  FlowTriggerProperties,
  FlowTriggerPropertiesWithMetadata,
  FlowTriggerUsesLink,
  InputDefinitionPropertyValue,
  InputDefinitionPropertyValueWithMetadata,
  InputsPropertyValue,
  InputsPropertyValueWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  NamePropertyValue,
  NamePropertyValueWithMetadata,
  NumberDataType,
  NumberDataTypeWithMetadata,
  ObjectDataType,
  ObjectDataTypeWithMetadata,
  OutputDefinitionPropertyValue,
  OutputDefinitionPropertyValueWithMetadata,
  StepDefinitionPropertyValue,
  StepDefinitionPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  Uses,
  UsesOutgoingLinkAndTarget,
  UsesOutgoingLinksByLinkEntityTypeId,
  UsesProperties,
  UsesPropertiesWithMetadata,
  ValueDataType,
  ValueDataTypeWithMetadata,
};

/**
 * The data sources configuration for an AI flow.
 */
export type DataSourcesPropertyValue = ObjectDataType;

export type DataSourcesPropertyValueWithMetadata = ObjectDataTypeWithMetadata;

/**
 * An explanation or justification for something.
 */
export type ExplanationPropertyValue = TextDataType;

export type ExplanationPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A flow trigger that starts runs of a flow on a schedule.
 */
export type FlowSchedule = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/flow-schedule/v/2"];
  properties: FlowScheduleProperties;
  propertiesWithMetadata: FlowSchedulePropertiesWithMetadata;
};

export type FlowScheduleOutgoingLinkAndTarget = never;

export type FlowScheduleOutgoingLinksByLinkEntityTypeId = {};

/**
 * A flow trigger that starts runs of a flow on a schedule.
 */
export type FlowScheduleProperties = FlowTriggerProperties & {
  "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValue;
  "https://hash.ai/@h/types/property-type/data-sources/"?: DataSourcesPropertyValue;
  "https://hash.ai/@h/types/property-type/pause-on-failure/"?: PauseOnFailurePropertyValue;
  "https://hash.ai/@h/types/property-type/schedule-catchup-window/"?: ScheduleCatchupWindowPropertyValue;
  "https://hash.ai/@h/types/property-type/schedule-overlap-policy/": ScheduleOverlapPolicyPropertyValue;
  "https://hash.ai/@h/types/property-type/schedule-pause-state/"?: SchedulePauseStatePropertyValue;
  "https://hash.ai/@h/types/property-type/schedule-spec/": ScheduleSpecPropertyValue;
  "https://hash.ai/@h/types/property-type/schedule-status/": ScheduleStatusPropertyValue;
};

export type FlowSchedulePropertiesWithMetadata =
  FlowTriggerPropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {
      "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValueWithMetadata;
      "https://hash.ai/@h/types/property-type/data-sources/"?: DataSourcesPropertyValueWithMetadata;
      "https://hash.ai/@h/types/property-type/pause-on-failure/"?: PauseOnFailurePropertyValueWithMetadata;
      "https://hash.ai/@h/types/property-type/schedule-catchup-window/"?: ScheduleCatchupWindowPropertyValueWithMetadata;
      "https://hash.ai/@h/types/property-type/schedule-overlap-policy/": ScheduleOverlapPolicyPropertyValueWithMetadata;
      "https://hash.ai/@h/types/property-type/schedule-pause-state/"?: SchedulePauseStatePropertyValueWithMetadata;
      "https://hash.ai/@h/types/property-type/schedule-spec/": ScheduleSpecPropertyValueWithMetadata;
      "https://hash.ai/@h/types/property-type/schedule-status/": ScheduleStatusPropertyValueWithMetadata;
    };
  };

/**
 * A measure of the length of time in the International System of Units (SI), defined as exactly 1/1000 of a second.
 */
export type MillisecondDataType = DurationDataType;

export type MillisecondDataTypeWithMetadata = {
  value: MillisecondDataType;
  metadata: MillisecondDataTypeMetadata;
};
export type MillisecondDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/millisecond/v/1";
};

/**
 * Whether to automatically pause something when it fails.
 */
export type PauseOnFailurePropertyValue = BooleanDataType;

export type PauseOnFailurePropertyValueWithMetadata =
  BooleanDataTypeWithMetadata;

/**
 * The timestamp at which something was paused.
 */
export type PausedAtPropertyValue = DateTimeDataType;

export type PausedAtPropertyValueWithMetadata = DateTimeDataTypeWithMetadata;

/**
 * How far back to catch up missed runs after downtime.
 */
export type ScheduleCatchupWindowPropertyValue = MillisecondDataType;

export type ScheduleCatchupWindowPropertyValueWithMetadata =
  MillisecondDataTypeWithMetadata;

/**
 * The policy for handling overlapping runs in a schedule when a new execution is due but the previous one is still running.
 */
export type ScheduleOverlapPolicyDataType =
  | "SKIP"
  | "BUFFER_ONE"
  | "ALLOW_ALL"
  | "CANCEL_OTHER";

export type ScheduleOverlapPolicyDataTypeWithMetadata = {
  value: ScheduleOverlapPolicyDataType;
  metadata: ScheduleOverlapPolicyDataTypeMetadata;
};
export type ScheduleOverlapPolicyDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/schedule-overlap-policy/v/1";
};

/**
 * The policy for handling overlapping runs when a new scheduled execution is due but the previous one is still running.
 */
export type ScheduleOverlapPolicyPropertyValue = ScheduleOverlapPolicyDataType;

export type ScheduleOverlapPolicyPropertyValueWithMetadata =
  ScheduleOverlapPolicyDataTypeWithMetadata;

/**
 * The state of a paused schedule, including when it was paused and an optional note.
 */
export type SchedulePauseStatePropertyValue = {
  "https://hash.ai/@h/types/property-type/explanation/"?: ExplanationPropertyValue;
  "https://hash.ai/@h/types/property-type/paused-at/": PausedAtPropertyValue;
};

export type SchedulePauseStatePropertyValueWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/explanation/"?: ExplanationPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/paused-at/": PausedAtPropertyValueWithMetadata;
  };
};

/**
 * The scheduling specification for a recurring flow.
 */
export type ScheduleSpecPropertyValue = ObjectDataType;

export type ScheduleSpecPropertyValueWithMetadata = ObjectDataTypeWithMetadata;

/**
 * The status of a schedule, indicating whether it is currently running or has been temporarily stopped.
 */
export type ScheduleStatusDataType = "active" | "paused";

export type ScheduleStatusDataTypeWithMetadata = {
  value: ScheduleStatusDataType;
  metadata: ScheduleStatusDataTypeMetadata;
};
export type ScheduleStatusDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/schedule-status/v/1";
};

/**
 * The current status of a schedule - either active or paused.
 */
export type ScheduleStatusPropertyValue = ScheduleStatusDataType;

export type ScheduleStatusPropertyValueWithMetadata =
  ScheduleStatusDataTypeWithMetadata;
