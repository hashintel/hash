/**
 * This file was automatically generated – do not edit it.
 */

import type { ObjectMetadata } from "@blockprotocol/type-system";

import type {
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  ObjectDataType,
  ObjectDataTypeWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  TitlePropertyValue,
  TitlePropertyValueWithMetadata,
} from "./shared.js";

export type {
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  ObjectDataType,
  ObjectDataTypeWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  TitlePropertyValue,
  TitlePropertyValueWithMetadata,
};

/**
 * A definition of something, represented as an opaque JSON object.
 */
export type DefinitionObjectPropertyValue = ObjectDataType;

export type DefinitionObjectPropertyValueWithMetadata =
  ObjectDataTypeWithMetadata;

/**
 * A Petri net is a mathematical model of a system that can be used to represent and analyze complex systems.
 */
export type PetriNet = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/petri-net/v/1"];
  properties: PetriNetProperties;
  propertiesWithMetadata: PetriNetPropertiesWithMetadata;
};

export type PetriNetOutgoingLinkAndTarget = PetriNetSubProcessOfLink;

export type PetriNetOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@h/types/entity-type/sub-process-of/v/1": PetriNetSubProcessOfLink;
};

/**
 * A Petri net is a mathematical model of a system that can be used to represent and analyze complex systems.
 */
export type PetriNetProperties = {
  "https://hash.ai/@h/types/property-type/definition-object/": DefinitionObjectPropertyValue;
  "https://hash.ai/@h/types/property-type/title/": TitlePropertyValue;
};

export type PetriNetPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/definition-object/": DefinitionObjectPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/title/": TitlePropertyValueWithMetadata;
  };
};

export type PetriNetSubProcessOfLink = {
  linkEntity: SubProcessOf;
  rightEntity: PetriNet;
};

/**
 * A process which contains this process.
 */
export type SubProcessOf = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/sub-process-of/v/1"];
  properties: SubProcessOfProperties;
  propertiesWithMetadata: SubProcessOfPropertiesWithMetadata;
};

export type SubProcessOfOutgoingLinkAndTarget = never;

export type SubProcessOfOutgoingLinksByLinkEntityTypeId = {};

/**
 * A process which contains this process.
 */
export type SubProcessOfProperties = LinkProperties & {
  "https://hash.ai/@h/types/property-type/transition-id/": TransitionIDPropertyValue;
};

export type SubProcessOfPropertiesWithMetadata = LinkPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/transition-id/": TransitionIDPropertyValueWithMetadata;
  };
};

/**
 * An identifier for a transition.
 */
export type TransitionIDPropertyValue = TextDataType;

export type TransitionIDPropertyValueWithMetadata = TextDataTypeWithMetadata;
