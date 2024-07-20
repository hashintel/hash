/**
 * This file was automatically generated – do not edit it.
 */

import { Brand } from "@local/advanced-types/brand";
import type {
  ArrayMetadata,
  ObjectMetadata,
  PropertyProvenance,
} from "@local/hash-graph-client";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { Confidence, PropertyObject } from "@local/hash-graph-types/entity";
import { BaseUrl } from "@local/hash-graph-types/ontology";

/**
 * Someone or something that can perform actions in the system.
 */
export interface Actor {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/actor/v/2";
  properties: ActorProperties;
  propertiesWithMetadata: ActorPropertiesWithMetadata;
}

export type ActorOutgoingLinkAndTarget = never;

export interface ActorOutgoingLinksByLinkEntityTypeId { }

/**
 * Someone or something that can perform actions in the system.
 */
interface ActorProperties {
  "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/"?: DisplayNamePropertyValue;
}

export interface ActorPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/"?: DisplayNamePropertyValueWithMetadata;
  };
}

/**
 * The point in time at which something begins to apply.
 */
export type AppliesFromPropertyValue = DateTimeDataType;

export type AppliesFromPropertyValueWithMetadata = DateTimeDataTypeWithMetadata;

/**
 * The point at which something ceases to apply.
 */
export type AppliesUntilPropertyValue = DateTimeDataType;

export type AppliesUntilPropertyValueWithMetadata =
  DateTimeDataTypeWithMetadata;

/**
 * Whether or not something has been archived.
 */
export type ArchivedPropertyValue = BooleanDataType;

export type ArchivedPropertyValueWithMetadata = BooleanDataTypeWithMetadata;

/**
 * What or whom something was authored by.
 */
export interface AuthoredBy {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/authored-by/v/1";
  properties: AuthoredByProperties;
  propertiesWithMetadata: AuthoredByPropertiesWithMetadata;
}

export type AuthoredByOutgoingLinkAndTarget = never;

export interface AuthoredByOutgoingLinksByLinkEntityTypeId { }

/**
 * What or whom something was authored by.
 */
export type AuthoredByProperties = AuthoredByProperties1 &
  AuthoredByProperties2;
export type AuthoredByProperties1 = LinkProperties;

export interface AuthoredByProperties2 { }

export type AuthoredByPropertiesWithMetadata =
  AuthoredByPropertiesWithMetadata1 & AuthoredByPropertiesWithMetadata2;
export type AuthoredByPropertiesWithMetadata1 = LinkPropertiesWithMetadata;

export interface AuthoredByPropertiesWithMetadata2 {
  metadata?: ObjectMetadata;
  value: {};
}

/**
 * Configuration for an automatic or passive entity inference feature.
 */
export type AutomaticInferenceConfigurationPropertyValue = ObjectDataType;

export type AutomaticInferenceConfigurationPropertyValueWithMetadata =
  ObjectDataTypeWithMetadata;

/**
 * A block that displays or otherwise uses data, part of a wider page or collection.
 */
export interface Block {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/block/v/1";
  properties: BlockProperties;
  propertiesWithMetadata: BlockPropertiesWithMetadata;
}

/**
 * A collection of blocks.
 */
export interface BlockCollection {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/block-collection/v/1";
  properties: BlockCollectionProperties;
  propertiesWithMetadata: BlockCollectionPropertiesWithMetadata;
}

export type BlockCollectionOutgoingLinkAndTarget = never;

export interface BlockCollectionOutgoingLinksByLinkEntityTypeId { }

/**
 * A collection of blocks.
 */
export interface BlockCollectionProperties { }

export interface BlockCollectionPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: {};
}

export interface BlockHasDataLink {
  linkEntity: HasData;
  rightEntity: Entity;
}

export type BlockOutgoingLinkAndTarget = BlockHasDataLink;

export interface BlockOutgoingLinksByLinkEntityTypeId {
  "https://hash.ai/@hash/types/entity-type/has-data/v/1": BlockHasDataLink;
}

/**
 * A block that displays or otherwise uses data, part of a wider page or collection.
 */
export interface BlockProperties {
  "https://hash.ai/@hash/types/property-type/component-id/": ComponentIdPropertyValue;
}

export interface BlockPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@hash/types/property-type/component-id/": ComponentIdPropertyValueWithMetadata;
  };
}

/**
 * A True or False value.
 */
export type BooleanDataType = boolean;

export interface BooleanDataTypeWithMetadata {
  value: BooleanDataType;
  metadata: BooleanDataTypeMetadata;
}
export interface BooleanDataTypeMetadata {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1";
}

/**
 * Settings for the HASH browser plugin.
 */
export interface BrowserPluginSettings {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/browser-plugin-settings/v/1";
  properties: BrowserPluginSettingsProperties;
  propertiesWithMetadata: BrowserPluginSettingsPropertiesWithMetadata;
}

export type BrowserPluginSettingsOutgoingLinkAndTarget = never;

export interface BrowserPluginSettingsOutgoingLinksByLinkEntityTypeId { }

/**
 * Settings for the HASH browser plugin.
 */
export interface BrowserPluginSettingsProperties {
  "https://hash.ai/@hash/types/property-type/automatic-inference-configuration/": AutomaticInferenceConfigurationPropertyValue;
  "https://hash.ai/@hash/types/property-type/browser-plugin-tab/": BrowserPluginTabPropertyValue;
  "https://hash.ai/@hash/types/property-type/draft-note/"?: DraftNotePropertyValue;
  "https://hash.ai/@hash/types/property-type/manual-inference-configuration/": ManualInferenceConfigurationPropertyValue;
}

export interface BrowserPluginSettingsPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@hash/types/property-type/automatic-inference-configuration/": AutomaticInferenceConfigurationPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/browser-plugin-tab/": BrowserPluginTabPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/draft-note/"?: DraftNotePropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/manual-inference-configuration/": ManualInferenceConfigurationPropertyValueWithMetadata;
  };
}

/**
 * A tab in the HASH browser plugin.
 */
export type BrowserPluginTabPropertyValue = TextDataType;

export type BrowserPluginTabPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * Comment associated with the issue.
 */
export interface Comment {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/comment/v/5";
  properties: CommentProperties;
  propertiesWithMetadata: CommentPropertiesWithMetadata;
}

export interface CommentAuthoredByLink {
  linkEntity: AuthoredBy;
  rightEntity: User;
}

export interface CommentHasParentLink {
  linkEntity: HasParent;
  rightEntity: Comment | Block;
}

export interface CommentHasTextLink {
  linkEntity: HasText;
  rightEntity: Text;
}

export type CommentOutgoingLinkAndTarget =
  | CommentAuthoredByLink
  | CommentHasParentLink
  | CommentHasTextLink;

export interface CommentOutgoingLinksByLinkEntityTypeId {
  "https://hash.ai/@hash/types/entity-type/authored-by/v/1": CommentAuthoredByLink;
  "https://hash.ai/@hash/types/entity-type/has-parent/v/1": CommentHasParentLink;
  "https://hash.ai/@hash/types/entity-type/has-text/v/1": CommentHasTextLink;
}

/**
 * Comment associated with the issue.
 */
export interface CommentProperties {
  "https://hash.ai/@hash/types/property-type/deleted-at/"?: DeletedAtPropertyValue;
  "https://hash.ai/@hash/types/property-type/resolved-at/"?: ResolvedAtPropertyValue;
}

export interface CommentPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@hash/types/property-type/deleted-at/"?: DeletedAtPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/resolved-at/"?: ResolvedAtPropertyValueWithMetadata;
  };
}

/**
 * An identifier for a component.
 */
export type ComponentIdPropertyValue = TextDataType;

export type ComponentIdPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The name of the connection source.
 */
export type ConnectionSourceNamePropertyValue = TextDataType;

export type ConnectionSourceNamePropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * A reference to a particular date and time, formatted according to RFC 3339.
 */
export type DateTimeDataType = string;

export interface DateTimeDataTypeWithMetadata {
  value: DateTimeDataType;
  metadata: DateTimeDataTypeMetadata;
}
export interface DateTimeDataTypeMetadata {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@hash/types/data-type/datetime/v/1";
}

/**
 * Stringified timestamp of when something was deleted.
 */
export type DeletedAtPropertyValue = TextDataType;

export type DeletedAtPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.
 */
export type DescriptionPropertyValue = TextDataType;

export type DescriptionPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A human-friendly display name for something.
 */
export type DisplayNamePropertyValue = TextDataType;

export type DisplayNamePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A document file.
 */
export interface DocumentFile {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/document-file/v/1";
  properties: DocumentFileProperties;
  propertiesWithMetadata: DocumentFilePropertiesWithMetadata;
}

export type DocumentFileOutgoingLinkAndTarget = never;

export interface DocumentFileOutgoingLinksByLinkEntityTypeId { }

/**
 * A document file.
 */
export type DocumentFileProperties = DocumentFileProperties1 &
  DocumentFileProperties2;
export type DocumentFileProperties1 = FileProperties;

export interface DocumentFileProperties2 {
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/"?: TextualContentPropertyValue;
}

export type DocumentFilePropertiesWithMetadata =
  DocumentFilePropertiesWithMetadata1 & DocumentFilePropertiesWithMetadata2;
export type DocumentFilePropertiesWithMetadata1 = FilePropertiesWithMetadata;

export interface DocumentFilePropertiesWithMetadata2 {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/"?: TextualContentPropertyValueWithMetadata;
  };
}

/**
 * A working draft of a text note.
 */
export type DraftNotePropertyValue = TextDataType;

export type DraftNotePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * An email address.
 */
export type EmailPropertyValue = TextDataType;

export type EmailPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A list of identifiers for a feature flags that are enabled.
 */
export type EnabledFeatureFlagsPropertyValue = TextDataType[];

export interface EnabledFeatureFlagsPropertyValueWithMetadata {
  value: TextDataTypeWithMetadata[];
  metadata?: ArrayMetadata;
}

/**
 * An identifier for an edition of an entity.
 */
export type EntityEditionIdPropertyValue = TextDataType;

export type EntityEditionIdPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Stringified timestamp of when something expired.
 */
export type ExpiredAtPropertyValue = TextDataType;

export type ExpiredAtPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The name of a feature.
 */
export type FeatureNamePropertyValue = TextDataType;

export type FeatureNamePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A file hosted at a URL.
 */
export interface File {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/file/v/2";
  properties: FileProperties;
  propertiesWithMetadata: FilePropertiesWithMetadata;
}

/**
 * A unique signature derived from a file's contents.
 */
export type FileHashPropertyValue = TextDataType;

export type FileHashPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The name of a file.
 */
export type FileNamePropertyValue = TextDataType;

export type FileNamePropertyValueWithMetadata = TextDataTypeWithMetadata;

export type FileOutgoingLinkAndTarget = never;

export interface FileOutgoingLinksByLinkEntityTypeId { }

/**
 * A file hosted at a URL.
 */
export interface FileProperties {
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/"?: DisplayNamePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-hash/"?: FileHashPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/"?: FileNamePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-size/"?: FileSizePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/": FileURLPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/"?: MIMETypePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/original-file-name/"?: OriginalFileNamePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/original-source/"?: OriginalSourcePropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/original-url/"?: OriginalURLPropertyValue;
  "https://hash.ai/@hash/types/property-type/file-storage-bucket/"?: FileStorageBucketPropertyValue;
  "https://hash.ai/@hash/types/property-type/file-storage-endpoint/"?: FileStorageEndpointPropertyValue;
  "https://hash.ai/@hash/types/property-type/file-storage-force-path-style/"?: FileStorageForcePathStylePropertyValue;
  "https://hash.ai/@hash/types/property-type/file-storage-key/"?: FileStorageKeyPropertyValue;
  "https://hash.ai/@hash/types/property-type/file-storage-provider/"?: FileStorageProviderPropertyValue;
  "https://hash.ai/@hash/types/property-type/file-storage-region/"?: FileStorageRegionPropertyValue;
  "https://hash.ai/@hash/types/property-type/upload-completed-at/"?: UploadCompletedAtPropertyValue;
}

export interface FilePropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValueWithMetadata;
    "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/"?: DisplayNamePropertyValueWithMetadata;
    "https://blockprotocol.org/@blockprotocol/types/property-type/file-hash/"?: FileHashPropertyValueWithMetadata;
    "https://blockprotocol.org/@blockprotocol/types/property-type/file-name/"?: FileNamePropertyValueWithMetadata;
    "https://blockprotocol.org/@blockprotocol/types/property-type/file-size/"?: FileSizePropertyValueWithMetadata;
    "https://blockprotocol.org/@blockprotocol/types/property-type/file-url/": FileURLPropertyValueWithMetadata;
    "https://blockprotocol.org/@blockprotocol/types/property-type/mime-type/"?: MIMETypePropertyValueWithMetadata;
    "https://blockprotocol.org/@blockprotocol/types/property-type/original-file-name/"?: OriginalFileNamePropertyValueWithMetadata;
    "https://blockprotocol.org/@blockprotocol/types/property-type/original-source/"?: OriginalSourcePropertyValueWithMetadata;
    "https://blockprotocol.org/@blockprotocol/types/property-type/original-url/"?: OriginalURLPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/file-storage-bucket/"?: FileStorageBucketPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/file-storage-endpoint/"?: FileStorageEndpointPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/file-storage-force-path-style/"?: FileStorageForcePathStylePropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/file-storage-key/"?: FileStorageKeyPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/file-storage-provider/"?: FileStorageProviderPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/file-storage-region/"?: FileStorageRegionPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/upload-completed-at/"?: UploadCompletedAtPropertyValueWithMetadata;
  };
}

/**
 * The size of a file.
 */
export type FileSizePropertyValue = NumberDataType;

export type FileSizePropertyValueWithMetadata = NumberDataTypeWithMetadata;

/**
 * The bucket in which a file is stored.
 */
export type FileStorageBucketPropertyValue = TextDataType;

export type FileStorageBucketPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * The endpoint for making requests to a file storage provider.
 */
export type FileStorageEndpointPropertyValue = TextDataType;

export type FileStorageEndpointPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * Whether to force path style for requests to a file storage provider (vs virtual host style).
 */
export type FileStorageForcePathStylePropertyValue = BooleanDataType;

export type FileStorageForcePathStylePropertyValueWithMetadata =
  BooleanDataTypeWithMetadata;

/**
 * The key identifying a file in storage.
 */
export type FileStorageKeyPropertyValue = TextDataType;

export type FileStorageKeyPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The provider of a file storage service.
 */
export type FileStorageProviderPropertyValue = TextDataType;

export type FileStorageProviderPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * The region in which a file is stored.
 */
export type FileStorageRegionPropertyValue = TextDataType;

export type FileStorageRegionPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * A URL that serves a file.
 */
export type FileURLPropertyValue = TextDataType;

export type FileURLPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The ID of the flow definition (the `entityId` of the flow definition entity).
 */
export type FlowDefinitionIDPropertyValue = TextDataType;

export type FlowDefinitionIDPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * An execution run of a flow.
 */
export interface FlowRun {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/flow-run/v/1";
  properties: FlowRunProperties;
  propertiesWithMetadata: FlowRunPropertiesWithMetadata;
}

export type FlowRunOutgoingLinkAndTarget = never;

export interface FlowRunOutgoingLinksByLinkEntityTypeId { }

/**
 * An execution run of a flow.
 */
export interface FlowRunProperties {
  "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValue;
  "https://hash.ai/@hash/types/property-type/flow-definition-id/": FlowDefinitionIDPropertyValue;
  "https://hash.ai/@hash/types/property-type/outputs/"?: OutputsPropertyValue;
  "https://hash.ai/@hash/types/property-type/step/": StepPropertyValue;
  "https://hash.ai/@hash/types/property-type/trigger/": TriggerPropertyValue;
}

export interface FlowRunPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/flow-definition-id/": FlowDefinitionIDPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/outputs/"?: OutputsPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/step/": StepPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/trigger/": TriggerPropertyValueWithMetadata;
  };
}

/**
 * The fractional index indicating the current position of something.
 */
export type FractionalIndexPropertyValue = TextDataType;

export type FractionalIndexPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Something that something has.
 */
export interface Has {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/has/v/1";
  properties: HasProperties;
  propertiesWithMetadata: HasPropertiesWithMetadata;
}

/**
 * The avatar something has.
 */
export interface HasAvatar {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/has-avatar/v/1";
  properties: HasAvatarProperties;
  propertiesWithMetadata: HasAvatarPropertiesWithMetadata;
}

export type HasAvatarOutgoingLinkAndTarget = never;

export interface HasAvatarOutgoingLinksByLinkEntityTypeId { }

/**
 * The avatar something has.
 */
export type HasAvatarProperties = HasAvatarProperties1 & HasAvatarProperties2;
export type HasAvatarProperties1 = LinkProperties;

export interface HasAvatarProperties2 { }

export type HasAvatarPropertiesWithMetadata = HasAvatarPropertiesWithMetadata1 &
  HasAvatarPropertiesWithMetadata2;
export type HasAvatarPropertiesWithMetadata1 = LinkPropertiesWithMetadata;

export interface HasAvatarPropertiesWithMetadata2 {
  metadata?: ObjectMetadata;
  value: {};
}

/**
 * The biography something has.
 */
export interface HasBio {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/has-bio/v/1";
  properties: HasBioProperties;
  propertiesWithMetadata: HasBioPropertiesWithMetadata;
}

export type HasBioOutgoingLinkAndTarget = never;

export interface HasBioOutgoingLinksByLinkEntityTypeId { }

/**
 * The biography something has.
 */
export type HasBioProperties = HasBioProperties1 & HasBioProperties2;
export type HasBioProperties1 = LinkProperties;

export interface HasBioProperties2 { }

export type HasBioPropertiesWithMetadata = HasBioPropertiesWithMetadata1 &
  HasBioPropertiesWithMetadata2;
export type HasBioPropertiesWithMetadata1 = LinkPropertiesWithMetadata;

export interface HasBioPropertiesWithMetadata2 {
  metadata?: ObjectMetadata;
  value: {};
}

/**
 * The cover image something has.
 */
export interface HasCoverImage {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/has-cover-image/v/1";
  properties: HasCoverImageProperties;
  propertiesWithMetadata: HasCoverImagePropertiesWithMetadata;
}

export type HasCoverImageOutgoingLinkAndTarget = never;

export interface HasCoverImageOutgoingLinksByLinkEntityTypeId { }

/**
 * The cover image something has.
 */
export type HasCoverImageProperties = HasCoverImageProperties1 &
  HasCoverImageProperties2;
export type HasCoverImageProperties1 = LinkProperties;

export interface HasCoverImageProperties2 { }

export type HasCoverImagePropertiesWithMetadata =
  HasCoverImagePropertiesWithMetadata1 & HasCoverImagePropertiesWithMetadata2;
export type HasCoverImagePropertiesWithMetadata1 = LinkPropertiesWithMetadata;

export interface HasCoverImagePropertiesWithMetadata2 {
  metadata?: ObjectMetadata;
  value: {};
}

/**
 * The data that something has.
 */
export interface HasData {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/has-data/v/1";
  properties: HasDataProperties;
  propertiesWithMetadata: HasDataPropertiesWithMetadata;
}

export type HasDataOutgoingLinkAndTarget = never;

export interface HasDataOutgoingLinksByLinkEntityTypeId { }

/**
 * The data that something has.
 */
export type HasDataProperties = HasDataProperties1 & HasDataProperties2;
export type HasDataProperties1 = LinkProperties;

export interface HasDataProperties2 { }

export type HasDataPropertiesWithMetadata = HasDataPropertiesWithMetadata1 &
  HasDataPropertiesWithMetadata2;
export type HasDataPropertiesWithMetadata1 = LinkPropertiesWithMetadata;

export interface HasDataPropertiesWithMetadata2 {
  metadata?: ObjectMetadata;
  value: {};
}

/**
 * Something contained at an index by something.
 */
export interface HasIndexedContent {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/has-indexed-content/v/1";
  properties: HasIndexedContentProperties;
  propertiesWithMetadata: HasIndexedContentPropertiesWithMetadata;
}

export type HasIndexedContentOutgoingLinkAndTarget = never;

export interface HasIndexedContentOutgoingLinksByLinkEntityTypeId { }

/**
 * Something contained at an index by something.
 */
export type HasIndexedContentProperties = HasIndexedContentProperties1 &
  HasIndexedContentProperties2;
export type HasIndexedContentProperties1 = LinkProperties;

export interface HasIndexedContentProperties2 {
  "https://hash.ai/@hash/types/property-type/fractional-index/": FractionalIndexPropertyValue;
}

export type HasIndexedContentPropertiesWithMetadata =
  HasIndexedContentPropertiesWithMetadata1 &
  HasIndexedContentPropertiesWithMetadata2;
export type HasIndexedContentPropertiesWithMetadata1 =
  LinkPropertiesWithMetadata;

export interface HasIndexedContentPropertiesWithMetadata2 {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@hash/types/property-type/fractional-index/": FractionalIndexPropertyValueWithMetadata;
  };
}

export type HasOutgoingLinkAndTarget = never;

export interface HasOutgoingLinksByLinkEntityTypeId { }

/**
 * The parent something has.
 */
export interface HasParent {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/has-parent/v/1";
  properties: HasParentProperties;
  propertiesWithMetadata: HasParentPropertiesWithMetadata;
}

export type HasParentOutgoingLinkAndTarget = never;

export interface HasParentOutgoingLinksByLinkEntityTypeId { }

/**
 * The parent something has.
 */
export type HasParentProperties = HasParentProperties1 & HasParentProperties2;
export type HasParentProperties1 = LinkProperties;

export interface HasParentProperties2 { }

export type HasParentPropertiesWithMetadata = HasParentPropertiesWithMetadata1 &
  HasParentPropertiesWithMetadata2;
export type HasParentPropertiesWithMetadata1 = LinkPropertiesWithMetadata;

export interface HasParentPropertiesWithMetadata2 {
  metadata?: ObjectMetadata;
  value: {};
}

/**
 * Something that something has.
 */
export type HasProperties = HasProperties1 & HasProperties2;
export type HasProperties1 = LinkProperties;

export interface HasProperties2 { }

export type HasPropertiesWithMetadata = HasPropertiesWithMetadata1 &
  HasPropertiesWithMetadata2;
export type HasPropertiesWithMetadata1 = LinkPropertiesWithMetadata;

export interface HasPropertiesWithMetadata2 {
  metadata?: ObjectMetadata;
  value: {};
}

/**
 * The service account something has.
 */
export interface HasServiceAccount {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/has-service-account/v/1";
  properties: HasServiceAccountProperties;
  propertiesWithMetadata: HasServiceAccountPropertiesWithMetadata;
}

export type HasServiceAccountOutgoingLinkAndTarget = never;

export interface HasServiceAccountOutgoingLinksByLinkEntityTypeId { }

/**
 * The service account something has.
 */
export type HasServiceAccountProperties = HasServiceAccountProperties1 &
  HasServiceAccountProperties2;
export type HasServiceAccountProperties1 = LinkProperties;

export interface HasServiceAccountProperties2 { }

export type HasServiceAccountPropertiesWithMetadata =
  HasServiceAccountPropertiesWithMetadata1 &
  HasServiceAccountPropertiesWithMetadata2;
export type HasServiceAccountPropertiesWithMetadata1 =
  LinkPropertiesWithMetadata;

export interface HasServiceAccountPropertiesWithMetadata2 {
  metadata?: ObjectMetadata;
  value: {};
}

/**
 * The text something has.
 */
export interface HasText {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/has-text/v/1";
  properties: HasTextProperties;
  propertiesWithMetadata: HasTextPropertiesWithMetadata;
}

export type HasTextOutgoingLinkAndTarget = never;

export interface HasTextOutgoingLinksByLinkEntityTypeId { }

/**
 * The text something has.
 */
export type HasTextProperties = HasTextProperties1 & HasTextProperties2;
export type HasTextProperties1 = LinkProperties;

export interface HasTextProperties2 { }

export type HasTextPropertiesWithMetadata = HasTextPropertiesWithMetadata1 &
  HasTextPropertiesWithMetadata2;
export type HasTextPropertiesWithMetadata1 = LinkPropertiesWithMetadata;

export interface HasTextPropertiesWithMetadata2 {
  metadata?: ObjectMetadata;
  value: {};
}

/**
 * An emoji icon.
 */
export type IconPropertyValue = TextDataType;

export type IconPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * An image file hosted at a URL.
 */
export interface Image {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/image/v/2";
  properties: ImageProperties;
  propertiesWithMetadata: ImagePropertiesWithMetadata;
}

export type ImageOutgoingLinkAndTarget = never;

export interface ImageOutgoingLinksByLinkEntityTypeId { }

/**
 * An image file hosted at a URL.
 */
export type ImageProperties = ImageProperties1 & ImageProperties2;
export type ImageProperties1 = FileProperties;

export interface ImageProperties2 { }

export type ImagePropertiesWithMetadata = ImagePropertiesWithMetadata1 &
  ImagePropertiesWithMetadata2;
export type ImagePropertiesWithMetadata1 = FilePropertiesWithMetadata;

export interface ImagePropertiesWithMetadata2 {
  metadata?: ObjectMetadata;
  value: {};
}

/**
 * The cost of an input unit.
 */
export type InputUnitCostPropertyValue = NumberDataType;

export type InputUnitCostPropertyValueWithMetadata = NumberDataTypeWithMetadata;

/**
 * Something that someone or something is a member of.
 */
export interface IsMemberOf {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/is-member-of/v/1";
  properties: IsMemberOfProperties;
  propertiesWithMetadata: IsMemberOfPropertiesWithMetadata;
}

export type IsMemberOfOutgoingLinkAndTarget = never;

export interface IsMemberOfOutgoingLinksByLinkEntityTypeId { }

/**
 * Something that someone or something is a member of.
 */
export type IsMemberOfProperties = IsMemberOfProperties1 &
  IsMemberOfProperties2;
export type IsMemberOfProperties1 = LinkProperties;

export interface IsMemberOfProperties2 { }

export type IsMemberOfPropertiesWithMetadata =
  IsMemberOfPropertiesWithMetadata1 & IsMemberOfPropertiesWithMetadata2;
export type IsMemberOfPropertiesWithMetadata1 = LinkPropertiesWithMetadata;

export interface IsMemberOfPropertiesWithMetadata2 {
  metadata?: ObjectMetadata;
  value: {};
}

/**
 * An identifier for a record in Ory Kratos.
 */
export type KratosIdentityIdPropertyValue = TextDataType;

export type KratosIdentityIdPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * Undefined.
 */
export interface Link {
  entityTypeId: "https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1";
  properties: LinkProperties;
  propertiesWithMetadata: LinkPropertiesWithMetadata;
}

export type LinkOutgoingLinkAndTarget = never;

export interface LinkOutgoingLinksByLinkEntityTypeId { }

export interface LinkProperties { }

export interface LinkPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: {};
}

/**
 * A location for something, expressed as a single string.
 */
export type LocationPropertyValue = TextDataType;

export type LocationPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A MIME (Multipurpose Internet Mail Extensions) type.
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types.
 */
export type MIMETypePropertyValue = TextDataType;

export type MIMETypePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Configuration for a manual entity inference feature.
 */
export type ManualInferenceConfigurationPropertyValue = ObjectDataType;

export type ManualInferenceConfigurationPropertyValueWithMetadata =
  ObjectDataTypeWithMetadata;

/**
 * A word or set of words by which something is known, addressed, or referred to.
 */
export type NamePropertyValue = TextDataType;

export type NamePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A notification to a user.
 */
export interface Notification {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/notification/v/1";
  properties: NotificationProperties;
  propertiesWithMetadata: NotificationPropertiesWithMetadata;
}

export type NotificationOutgoingLinkAndTarget = never;

export interface NotificationOutgoingLinksByLinkEntityTypeId { }

/**
 * A notification to a user.
 */
export interface NotificationProperties {
  "https://hash.ai/@hash/types/property-type/archived/"?: ArchivedPropertyValue;
  "https://hash.ai/@hash/types/property-type/read-at/"?: ReadAtPropertyValue;
}

export interface NotificationPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@hash/types/property-type/archived/"?: ArchivedPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/read-at/"?: ReadAtPropertyValueWithMetadata;
  };
}

/**
 * An arithmetical value (in the Real number system).
 */
export type NumberDataType = number;

export interface NumberDataTypeWithMetadata {
  value: NumberDataType;
  metadata: NumberDataTypeMetadata;
}
export interface NumberDataTypeMetadata {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1";
}

/**
 * An opaque, untyped JSON object.
 */
export interface ObjectDataType { }

export interface ObjectDataTypeWithMetadata {
  value: ObjectDataType;
  metadata: ObjectDataTypeMetadata;
}
export interface ObjectDataTypeMetadata {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1";
}

/**
 * A block that something occurred in.
 */
export interface OccurredInBlock {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/occurred-in-block/v/1";
  properties: OccurredInBlockProperties;
  propertiesWithMetadata: OccurredInBlockPropertiesWithMetadata;
}

export type OccurredInBlockOutgoingLinkAndTarget = never;

export interface OccurredInBlockOutgoingLinksByLinkEntityTypeId { }

/**
 * A block that something occurred in.
 */
export type OccurredInBlockProperties = OccurredInBlockProperties1 &
  OccurredInBlockProperties2;
export type OccurredInBlockProperties1 = LinkProperties;

export interface OccurredInBlockProperties2 { }

export type OccurredInBlockPropertiesWithMetadata =
  OccurredInBlockPropertiesWithMetadata1 &
  OccurredInBlockPropertiesWithMetadata2;
export type OccurredInBlockPropertiesWithMetadata1 = LinkPropertiesWithMetadata;

export interface OccurredInBlockPropertiesWithMetadata2 {
  metadata?: ObjectMetadata;
  value: {};
}

/**
 * An entity that something occurred in.
 */
export interface OccurredInEntity {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/occurred-in-entity/v/2";
  properties: OccurredInEntityProperties;
  propertiesWithMetadata: OccurredInEntityPropertiesWithMetadata;
}

export type OccurredInEntityOutgoingLinkAndTarget = never;

export interface OccurredInEntityOutgoingLinksByLinkEntityTypeId { }

/**
 * An entity that something occurred in.
 */
export type OccurredInEntityProperties = OccurredInEntityProperties1 &
  OccurredInEntityProperties2;
export type OccurredInEntityProperties1 = LinkProperties;

export interface OccurredInEntityProperties2 {
  "https://hash.ai/@hash/types/property-type/entity-edition-id/"?: EntityEditionIdPropertyValue;
}

export type OccurredInEntityPropertiesWithMetadata =
  OccurredInEntityPropertiesWithMetadata1 &
  OccurredInEntityPropertiesWithMetadata2;
export type OccurredInEntityPropertiesWithMetadata1 =
  LinkPropertiesWithMetadata;

export interface OccurredInEntityPropertiesWithMetadata2 {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@hash/types/property-type/entity-edition-id/"?: EntityEditionIdPropertyValueWithMetadata;
  };
}

/**
 * An organization. Organizations are root-level objects that contain user accounts and teams.
 */
export interface Organization {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/organization/v/2";
  properties: OrganizationProperties;
  propertiesWithMetadata: OrganizationPropertiesWithMetadata;
}

export interface OrganizationHasAvatarLink {
  linkEntity: HasAvatar;
  rightEntity: Image;
}

export interface OrganizationHasBioLink {
  linkEntity: HasBio;
  rightEntity: ProfileBio;
}

export interface OrganizationHasCoverImageLink {
  linkEntity: HasCoverImage;
  rightEntity: Image;
}

/**
 * The name of an organization.
 */
export type OrganizationNamePropertyValue = TextDataType;

export type OrganizationNamePropertyValueWithMetadata =
  TextDataTypeWithMetadata;

export type OrganizationOutgoingLinkAndTarget =
  | OrganizationHasAvatarLink
  | OrganizationHasBioLink
  | OrganizationHasCoverImageLink;

export interface OrganizationOutgoingLinksByLinkEntityTypeId {
  "https://hash.ai/@hash/types/entity-type/has-avatar/v/1": OrganizationHasAvatarLink;
  "https://hash.ai/@hash/types/entity-type/has-bio/v/1": OrganizationHasBioLink;
  "https://hash.ai/@hash/types/entity-type/has-cover-image/v/1": OrganizationHasCoverImageLink;
}

/**
 * An organization. Organizations are root-level objects that contain user accounts and teams.
 */
export interface OrganizationProperties {
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
  "https://hash.ai/@hash/types/property-type/location/"?: LocationPropertyValue;
  "https://hash.ai/@hash/types/property-type/organization-name/": OrganizationNamePropertyValue;
  /**
   * @maxItems 5
   */
  "https://hash.ai/@hash/types/property-type/pinned-entity-type-base-url/"?:
  | []
  | [PinnedEntityTypeBaseURLPropertyValue]
  | [
    PinnedEntityTypeBaseURLPropertyValue,
    PinnedEntityTypeBaseURLPropertyValue,
  ]
  | [
    PinnedEntityTypeBaseURLPropertyValue,
    PinnedEntityTypeBaseURLPropertyValue,
    PinnedEntityTypeBaseURLPropertyValue,
  ]
  | [
    PinnedEntityTypeBaseURLPropertyValue,
    PinnedEntityTypeBaseURLPropertyValue,
    PinnedEntityTypeBaseURLPropertyValue,
    PinnedEntityTypeBaseURLPropertyValue,
  ]
  | [
    PinnedEntityTypeBaseURLPropertyValue,
    PinnedEntityTypeBaseURLPropertyValue,
    PinnedEntityTypeBaseURLPropertyValue,
    PinnedEntityTypeBaseURLPropertyValue,
    PinnedEntityTypeBaseURLPropertyValue,
  ];
  "https://hash.ai/@hash/types/property-type/shortname/": ShortnamePropertyValue;
  "https://hash.ai/@hash/types/property-type/website-url/"?: WebsiteURLPropertyValue;
}

export interface OrganizationPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/location/"?: LocationPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/organization-name/": OrganizationNamePropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/pinned-entity-type-base-url/"?: {
      value: PinnedEntityTypeBaseURLPropertyValueWithMetadata[];
      metadata?: ArrayMetadata;
    };
    "https://hash.ai/@hash/types/property-type/shortname/": ShortnamePropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/website-url/"?: WebsiteURLPropertyValueWithMetadata;
  };
}

/**
 * The original name of a file.
 */
export type OriginalFileNamePropertyValue = TextDataType;

export type OriginalFileNamePropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * The original source of something.
 */
export type OriginalSourcePropertyValue = TextDataType;

export type OriginalSourcePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The original URL something was hosted at.
 */
export type OriginalURLPropertyValue = TextDataType;

export type OriginalURLPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The cost of an output unit.
 */
export type OutputUnitCostPropertyValue = NumberDataType;

export type OutputUnitCostPropertyValueWithMetadata =
  NumberDataTypeWithMetadata;

/**
 * The outputs of something.
 */
export type OutputsPropertyValue = ObjectDataType[];

export interface OutputsPropertyValueWithMetadata {
  value: ObjectDataTypeWithMetadata[];
  metadata?: ArrayMetadata;
}

/**
 * A page for displaying and potentially interacting with data.
 */
export interface Page {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/page/v/1";
  properties: PageProperties;
  propertiesWithMetadata: PagePropertiesWithMetadata;
}

export interface PageHasParentLink {
  linkEntity: HasParent;
  rightEntity: Page;
}

export type PageOutgoingLinkAndTarget = PageHasParentLink;

export interface PageOutgoingLinksByLinkEntityTypeId {
  "https://hash.ai/@hash/types/entity-type/has-parent/v/1": PageHasParentLink;
}

/**
 * A page for displaying and potentially interacting with data.
 */
export type PageProperties = PageProperties1 & PageProperties2;
export type PageProperties1 = BlockCollectionProperties;

export interface PageProperties2 {
  "https://hash.ai/@hash/types/property-type/archived/"?: ArchivedPropertyValue;
  "https://hash.ai/@hash/types/property-type/fractional-index/": FractionalIndexPropertyValue;
  "https://hash.ai/@hash/types/property-type/icon/"?: IconPropertyValue;
  "https://hash.ai/@hash/types/property-type/summary/"?: SummaryPropertyValue;
  "https://hash.ai/@hash/types/property-type/title/": TitlePropertyValue;
}

export type PagePropertiesWithMetadata = PagePropertiesWithMetadata1 &
  PagePropertiesWithMetadata2;
export type PagePropertiesWithMetadata1 = BlockCollectionPropertiesWithMetadata;

export interface PagePropertiesWithMetadata2 {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@hash/types/property-type/archived/"?: ArchivedPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/fractional-index/": FractionalIndexPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/icon/"?: IconPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/summary/"?: SummaryPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/title/": TitlePropertyValueWithMetadata;
  };
}

/**
 * The base URL of a pinned entity type.
 */
export type PinnedEntityTypeBaseURLPropertyValue = TextDataType;

export type PinnedEntityTypeBaseURLPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * Someone's preferred pronouns.
 */
export type PreferredPronounsPropertyValue = TextDataType;

export type PreferredPronounsPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * A presentation file.
 */
export interface PresentationFile {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/presentation-file/v/1";
  properties: PresentationFileProperties;
  propertiesWithMetadata: PresentationFilePropertiesWithMetadata;
}

export type PresentationFileOutgoingLinkAndTarget = never;

export interface PresentationFileOutgoingLinksByLinkEntityTypeId { }

/**
 * A presentation file.
 */
export type PresentationFileProperties = PresentationFileProperties1 &
  PresentationFileProperties2;
export type PresentationFileProperties1 = FileProperties;

export interface PresentationFileProperties2 {
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/"?: TextualContentPropertyValue;
}

export type PresentationFilePropertiesWithMetadata =
  PresentationFilePropertiesWithMetadata1 &
  PresentationFilePropertiesWithMetadata2;
export type PresentationFilePropertiesWithMetadata1 =
  FilePropertiesWithMetadata;

export interface PresentationFilePropertiesWithMetadata2 {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/"?: TextualContentPropertyValueWithMetadata;
  };
}

/**
 * A biography for display on someone or something's profile.
 */
export interface ProfileBio {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/profile-bio/v/1";
  properties: ProfileBioProperties;
  propertiesWithMetadata: ProfileBioPropertiesWithMetadata;
}

export interface ProfileBioHasIndexedContentLink {
  linkEntity: HasIndexedContent;
  rightEntity: Block;
}

export type ProfileBioOutgoingLinkAndTarget = ProfileBioHasIndexedContentLink;

export interface ProfileBioOutgoingLinksByLinkEntityTypeId {
  "https://hash.ai/@hash/types/entity-type/has-indexed-content/v/1": ProfileBioHasIndexedContentLink;
}

/**
 * A biography for display on someone or something's profile.
 */
export type ProfileBioProperties = ProfileBioProperties1 &
  ProfileBioProperties2;
export type ProfileBioProperties1 = BlockCollectionProperties;

export interface ProfileBioProperties2 { }

export type ProfileBioPropertiesWithMetadata =
  ProfileBioPropertiesWithMetadata1 & ProfileBioPropertiesWithMetadata2;
export type ProfileBioPropertiesWithMetadata1 =
  BlockCollectionPropertiesWithMetadata;

export interface ProfileBioPropertiesWithMetadata2 {
  metadata?: ObjectMetadata;
  value: {};
}

/**
 * A URL to a profile.
 */
export type ProfileURLPropertyValue = TextDataType;

export type ProfileURLPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The timestamp of when something was read.
 */
export type ReadAtPropertyValue = TextDataType;

export type ReadAtPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Stringified timestamp of when something was resolved.
 */
export type ResolvedAtPropertyValue = TextDataType;

export type ResolvedAtPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A service account.
 */
export interface ServiceAccount {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/service-account/v/1";
  properties: ServiceAccountProperties;
  propertiesWithMetadata: ServiceAccountPropertiesWithMetadata;
}

export type ServiceAccountOutgoingLinkAndTarget = never;

export interface ServiceAccountOutgoingLinksByLinkEntityTypeId { }

/**
 * A service account.
 */
export interface ServiceAccountProperties {
  "https://hash.ai/@hash/types/property-type/profile-url/": ProfileURLPropertyValue;
}

export interface ServiceAccountPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@hash/types/property-type/profile-url/": ProfileURLPropertyValueWithMetadata;
  };
}

/**
 * A feature of a service.
 */
export interface ServiceFeature {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/service-feature/v/1";
  properties: ServiceFeatureProperties;
  propertiesWithMetadata: ServiceFeaturePropertiesWithMetadata;
}

export type ServiceFeatureOutgoingLinkAndTarget = never;

export interface ServiceFeatureOutgoingLinksByLinkEntityTypeId { }

/**
 * A feature of a service.
 */
export interface ServiceFeatureProperties {
  "https://hash.ai/@hash/types/property-type/feature-name/": FeatureNamePropertyValue;
  "https://hash.ai/@hash/types/property-type/service-name/": ServiceNamePropertyValue;
  "https://hash.ai/@hash/types/property-type/service-unit-cost/"?: ServiceUnitCostPropertyValue[];
}

export interface ServiceFeaturePropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@hash/types/property-type/feature-name/": FeatureNamePropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/service-name/": ServiceNamePropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/service-unit-cost/"?: {
      value: ServiceUnitCostPropertyValueWithMetadata[];
      metadata?: ArrayMetadata;
    };
  };
}

/**
 * The name of a service.
 */
export type ServiceNamePropertyValue = TextDataType;

export type ServiceNamePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The unit cost of a service.
 */
export interface ServiceUnitCostPropertyValue {
  "https://hash.ai/@hash/types/property-type/applies-from/": AppliesFromPropertyValue;
  "https://hash.ai/@hash/types/property-type/applies-until/"?: AppliesUntilPropertyValue;
  "https://hash.ai/@hash/types/property-type/input-unit-cost/"?: InputUnitCostPropertyValue;
  "https://hash.ai/@hash/types/property-type/output-unit-cost/"?: OutputUnitCostPropertyValue;
}

export interface ServiceUnitCostPropertyValueWithMetadata {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@hash/types/property-type/applies-from/": AppliesFromPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/applies-until/"?: AppliesUntilPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/input-unit-cost/"?: InputUnitCostPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/output-unit-cost/"?: OutputUnitCostPropertyValueWithMetadata;
  };
}

/**
 * A unique identifier for something, in the form of a slug.
 */
export type ShortnamePropertyValue = TextDataType;

export type ShortnamePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A step in a flow run.
 */
export type StepPropertyValue = ObjectDataType[];

export interface StepPropertyValueWithMetadata {
  value: ObjectDataTypeWithMetadata[];
  metadata?: ArrayMetadata;
}

/**
 * The summary of the something.
 */
export type SummaryPropertyValue = TextDataType;

export type SummaryPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * An ordered sequence of characters.
 */
export interface Text {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/text/v/1";
  properties: TextProperties;
  propertiesWithMetadata: TextPropertiesWithMetadata;
}

/**
 * An ordered sequence of characters.
 */
export type TextDataType = string;

export interface TextDataTypeWithMetadata {
  value: TextDataType;
  metadata: TextDataTypeMetadata;
}
export interface TextDataTypeMetadata {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1";
}

export type TextOutgoingLinkAndTarget = never;

export interface TextOutgoingLinksByLinkEntityTypeId { }

/**
 * An ordered sequence of characters.
 */
export interface TextProperties {
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/": TextualContentPropertyValue;
}

export interface TextPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/": TextualContentPropertyValueWithMetadata;
  };
}

/**
 * The text material, information, or body, that makes up the content of this thing.
 */
export type TextualContentPropertyValue = TextDataType | ObjectDataType[];

export type TextualContentPropertyValueWithMetadata =
  | TextDataTypeWithMetadata
  | {
    value: ObjectDataTypeWithMetadata[];
    metadata?: ArrayMetadata;
  };

/**
 * The title of something.
 */
export type TitlePropertyValue = TextDataType;

export type TitlePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The ID of the trigger definition.
 */
export type TriggerDefinitionIDPropertyValue = TextDataType;

export type TriggerDefinitionIDPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * The trigger of a flow.
 */
export interface TriggerPropertyValue {
  "https://hash.ai/@hash/types/property-type/outputs/"?: OutputsPropertyValue;
  "https://hash.ai/@hash/types/property-type/trigger-definition-id/": TriggerDefinitionIDPropertyValue;
}

export interface TriggerPropertyValueWithMetadata {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@hash/types/property-type/outputs/"?: OutputsPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/trigger-definition-id/": TriggerDefinitionIDPropertyValueWithMetadata;
  };
}

/**
 * A user that triggered something.
 */
export interface TriggeredByUser {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/triggered-by-user/v/1";
  properties: TriggeredByUserProperties;
  propertiesWithMetadata: TriggeredByUserPropertiesWithMetadata;
}

export type TriggeredByUserOutgoingLinkAndTarget = never;

export interface TriggeredByUserOutgoingLinksByLinkEntityTypeId { }

/**
 * A user that triggered something.
 */
export type TriggeredByUserProperties = TriggeredByUserProperties1 &
  TriggeredByUserProperties2;
export type TriggeredByUserProperties1 = LinkProperties;

export interface TriggeredByUserProperties2 { }

export type TriggeredByUserPropertiesWithMetadata =
  TriggeredByUserPropertiesWithMetadata1 &
  TriggeredByUserPropertiesWithMetadata2;
export type TriggeredByUserPropertiesWithMetadata1 = LinkPropertiesWithMetadata;

export interface TriggeredByUserPropertiesWithMetadata2 {
  metadata?: ObjectMetadata;
  value: {};
}

/**
 * The timestamp when the upload of something has completed.
 */
export type UploadCompletedAtPropertyValue = DateTimeDataType;

export type UploadCompletedAtPropertyValueWithMetadata =
  DateTimeDataTypeWithMetadata;

/**
 * A user of the HASH application.
 */
export interface User {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/user/v/5";
  properties: UserProperties;
  propertiesWithMetadata: UserPropertiesWithMetadata;
}

export interface UserHasAvatarLink {
  linkEntity: HasAvatar;
  rightEntity: Image;
}

export interface UserHasBioLink {
  linkEntity: HasBio;
  rightEntity: ProfileBio;
}

export interface UserHasLink {
  linkEntity: Has;
  rightEntity: BrowserPluginSettings;
}

export interface UserHasServiceAccountLink {
  linkEntity: HasServiceAccount;
  rightEntity: ServiceAccount;
}

export interface UserIsMemberOfLink {
  linkEntity: IsMemberOf;
  rightEntity: Organization;
}

export type UserOutgoingLinkAndTarget =
  | UserHasAvatarLink
  | UserHasBioLink
  | UserHasServiceAccountLink
  | UserHasLink
  | UserIsMemberOfLink;

export interface UserOutgoingLinksByLinkEntityTypeId {
  "https://hash.ai/@hash/types/entity-type/has-avatar/v/1": UserHasAvatarLink;
  "https://hash.ai/@hash/types/entity-type/has-bio/v/1": UserHasBioLink;
  "https://hash.ai/@hash/types/entity-type/has-service-account/v/1": UserHasServiceAccountLink;
  "https://hash.ai/@hash/types/entity-type/has/v/1": UserHasLink;
  "https://hash.ai/@hash/types/entity-type/is-member-of/v/1": UserIsMemberOfLink;
}

/**
 * A user of the HASH application.
 */
export type UserProperties = UserProperties1 & UserProperties2;
export type UserProperties1 = ActorProperties;

export interface UserProperties2 {
  /**
   * @minItems 1
   */
  "https://hash.ai/@hash/types/property-type/email/": [
    EmailPropertyValue,
    ...EmailPropertyValue[],
  ];
  "https://hash.ai/@hash/types/property-type/enabled-feature-flags/"?: EnabledFeatureFlagsPropertyValue;
  "https://hash.ai/@hash/types/property-type/kratos-identity-id/": KratosIdentityIdPropertyValue;
  "https://hash.ai/@hash/types/property-type/location/"?: LocationPropertyValue;
  /**
   * @maxItems 5
   */
  "https://hash.ai/@hash/types/property-type/pinned-entity-type-base-url/"?:
  | []
  | [PinnedEntityTypeBaseURLPropertyValue]
  | [
    PinnedEntityTypeBaseURLPropertyValue,
    PinnedEntityTypeBaseURLPropertyValue,
  ]
  | [
    PinnedEntityTypeBaseURLPropertyValue,
    PinnedEntityTypeBaseURLPropertyValue,
    PinnedEntityTypeBaseURLPropertyValue,
  ]
  | [
    PinnedEntityTypeBaseURLPropertyValue,
    PinnedEntityTypeBaseURLPropertyValue,
    PinnedEntityTypeBaseURLPropertyValue,
    PinnedEntityTypeBaseURLPropertyValue,
  ]
  | [
    PinnedEntityTypeBaseURLPropertyValue,
    PinnedEntityTypeBaseURLPropertyValue,
    PinnedEntityTypeBaseURLPropertyValue,
    PinnedEntityTypeBaseURLPropertyValue,
    PinnedEntityTypeBaseURLPropertyValue,
  ];
  "https://hash.ai/@hash/types/property-type/preferred-pronouns/"?: PreferredPronounsPropertyValue;
  "https://hash.ai/@hash/types/property-type/shortname/"?: ShortnamePropertyValue;
  "https://hash.ai/@hash/types/property-type/website-url/"?: WebsiteURLPropertyValue;
}

export type UserPropertiesWithMetadata = UserPropertiesWithMetadata1 &
  UserPropertiesWithMetadata2;
export type UserPropertiesWithMetadata1 = ActorPropertiesWithMetadata;

export interface UserPropertiesWithMetadata2 {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@hash/types/property-type/email/": {
      value: EmailPropertyValueWithMetadata[];
      metadata?: ArrayMetadata;
    };
    "https://hash.ai/@hash/types/property-type/enabled-feature-flags/"?: EnabledFeatureFlagsPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/kratos-identity-id/": KratosIdentityIdPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/location/"?: LocationPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/pinned-entity-type-base-url/"?: {
      value: PinnedEntityTypeBaseURLPropertyValueWithMetadata[];
      metadata?: ArrayMetadata;
    };
    "https://hash.ai/@hash/types/property-type/preferred-pronouns/"?: PreferredPronounsPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/shortname/"?: ShortnamePropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/website-url/"?: WebsiteURLPropertyValueWithMetadata;
  };
}

/**
 * A secret or credential belonging to a user.
 */
export interface UserSecret {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/user-secret/v/1";
  properties: UserSecretProperties;
  propertiesWithMetadata: UserSecretPropertiesWithMetadata;
}

export type UserSecretOutgoingLinkAndTarget = never;

export interface UserSecretOutgoingLinksByLinkEntityTypeId { }

/**
 * A secret or credential belonging to a user.
 */
export interface UserSecretProperties {
  "https://hash.ai/@hash/types/property-type/connection-source-name/": ConnectionSourceNamePropertyValue;
  "https://hash.ai/@hash/types/property-type/expired-at/": ExpiredAtPropertyValue;
  "https://hash.ai/@hash/types/property-type/vault-path/": VaultPathPropertyValue;
}

export interface UserSecretPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@hash/types/property-type/connection-source-name/": ConnectionSourceNamePropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/expired-at/": ExpiredAtPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/vault-path/": VaultPathPropertyValueWithMetadata;
  };
}

/**
 * The path to a secret in Hashicorp Vault.
 */
export type VaultPathPropertyValue = TextDataType;

export type VaultPathPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A URL for a website.
 */
export type WebsiteURLPropertyValue = TextDataType;

export type WebsiteURLPropertyValueWithMetadata = TextDataTypeWithMetadata;
