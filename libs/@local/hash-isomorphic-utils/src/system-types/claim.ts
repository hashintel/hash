/**
 * This file was automatically generated – do not edit it.
 */

import type { ObjectMetadata } from "@local/hash-graph-client";
import type { Entity } from "@local/hash-graph-sdk/entity";

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
  TextualContentPropertyValue,
  TextualContentPropertyValueWithMetadata,
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
  TextualContentPropertyValue,
  TextualContentPropertyValueWithMetadata,
};

/**
 * A claim made about something.
 */
export type Claim = {
  entityTypeIds: ["https://hash.ai/@hash/types/entity-type/claim/v/1"];
  properties: ClaimProperties;
  propertiesWithMetadata: ClaimPropertiesWithMetadata;
};

export type ClaimHasObjectLink = { linkEntity: HasObject; rightEntity: Entity };

export type ClaimHasSubjectLink = {
  linkEntity: HasSubject;
  rightEntity: Entity;
};

export type ClaimOutgoingLinkAndTarget =
  | ClaimHasObjectLink
  | ClaimHasSubjectLink;

export type ClaimOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@hash/types/entity-type/has-object/v/1": ClaimHasObjectLink;
  "https://hash.ai/@hash/types/entity-type/has-subject/v/1": ClaimHasSubjectLink;
};

/**
 * A claim made about something.
 */
export type ClaimProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/": TextualContentPropertyValue;
  "https://hash.ai/@hash/types/property-type/object/"?: ObjectPropertyValue;
  "https://hash.ai/@hash/types/property-type/subject/": SubjectPropertyValue;
};

export type ClaimPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/": TextualContentPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/object/"?: ObjectPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/subject/": SubjectPropertyValueWithMetadata;
  };
};

/**
 * The object something has
 */
export type HasObject = {
  entityTypeIds: ["https://hash.ai/@hash/types/entity-type/has-object/v/1"];
  properties: HasObjectProperties;
  propertiesWithMetadata: HasObjectPropertiesWithMetadata;
};

export type HasObjectOutgoingLinkAndTarget = never;

export type HasObjectOutgoingLinksByLinkEntityTypeId = {};

/**
 * The object something has
 */
export type HasObjectProperties = HasObjectProperties1 & HasObjectProperties2;
export type HasObjectProperties1 = LinkProperties;

export type HasObjectProperties2 = {};

export type HasObjectPropertiesWithMetadata = HasObjectPropertiesWithMetadata1 &
  HasObjectPropertiesWithMetadata2;
export type HasObjectPropertiesWithMetadata1 = LinkPropertiesWithMetadata;

export type HasObjectPropertiesWithMetadata2 = {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * The subject something has
 */
export type HasSubject = {
  entityTypeIds: ["https://hash.ai/@hash/types/entity-type/has-subject/v/1"];
  properties: HasSubjectProperties;
  propertiesWithMetadata: HasSubjectPropertiesWithMetadata;
};

export type HasSubjectOutgoingLinkAndTarget = never;

export type HasSubjectOutgoingLinksByLinkEntityTypeId = {};

/**
 * The subject something has
 */
export type HasSubjectProperties = HasSubjectProperties1 &
  HasSubjectProperties2;
export type HasSubjectProperties1 = LinkProperties;

export type HasSubjectProperties2 = {};

export type HasSubjectPropertiesWithMetadata =
  HasSubjectPropertiesWithMetadata1 & HasSubjectPropertiesWithMetadata2;
export type HasSubjectPropertiesWithMetadata1 = LinkPropertiesWithMetadata;

export type HasSubjectPropertiesWithMetadata2 = {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * What something is directed towards.
 */
export type ObjectPropertyValue = TextDataType;

export type ObjectPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A thing or theme that something is about.
 */
export type SubjectPropertyValue = TextDataType;

export type SubjectPropertyValueWithMetadata = TextDataTypeWithMetadata;
