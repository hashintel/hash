/**
 * This file was automatically generated – do not edit it.
 */

import type {
  ArrayMetadata,
  ObjectMetadata,
  PropertyProvenance,
} from "@local/hash-graph-client";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type {
  Confidence,
  PropertyObject,
} from "@local/hash-graph-types/entity";

/**
 * Someone or something that can perform actions in the system
 */
export interface Actor {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/actor/v/2";
  properties: ActorProperties;
  propertiesWithMetadata: ActorPropertiesWithMetadata;
}

export type ActorOutgoingLinkAndTarget = never;

export interface ActorOutgoingLinksByLinkEntityTypeId {}

/**
 * Someone or something that can perform actions in the system
 */
export interface ActorProperties extends PropertyObject {
  "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/"?: DisplayNamePropertyValue;
}

export interface ActorPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: ActorPropertiesWithMetadataValue;
}

export interface ActorPropertiesWithMetadataValue {
  "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/"?: DisplayNamePropertyValueWithMetadata;
}

/**
 * The point in time at which something begins to apply
 */
export type AppliesFromPropertyValue = DateTimeDataType;

export interface AppliesFromPropertyValueWithMetadata
  extends DateTimeDataTypeWithMetadata {}

/**
 * The point at which something ceases to apply
 */
export type AppliesUntilPropertyValue = DateTimeDataType;

export interface AppliesUntilPropertyValueWithMetadata
  extends DateTimeDataTypeWithMetadata {}

/**
 * Whether or not something has been archived.
 */
export type ArchivedPropertyValue = BooleanDataType;

export interface ArchivedPropertyValueWithMetadata
  extends BooleanDataTypeWithMetadata {}

/**
 * What or whom something was authored by.
 */
export interface AuthoredBy {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/authored-by/v/1";
  properties: AuthoredByProperties;
  propertiesWithMetadata: AuthoredByPropertiesWithMetadata;
}

export type AuthoredByOutgoingLinkAndTarget = never;

export interface AuthoredByOutgoingLinksByLinkEntityTypeId {}

/**
 * What or whom something was authored by.
 */
export interface AuthoredByProperties
  extends AuthoredByProperties1,
    AuthoredByProperties2 {}
export interface AuthoredByProperties1 extends LinkProperties {}

export interface AuthoredByProperties2 {}

export interface AuthoredByPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: AuthoredByPropertiesWithMetadataValue;
}

export interface AuthoredByPropertiesWithMetadataValue
  extends AuthoredByPropertiesWithMetadataValue1,
    AuthoredByPropertiesWithMetadataValue2 {}
export interface AuthoredByPropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface AuthoredByPropertiesWithMetadataValue2 {}

/**
 * Configuration for an automatic or passive entity inference feature
 */
export type AutomaticInferenceConfigurationPropertyValue = ObjectDataType;

export interface AutomaticInferenceConfigurationPropertyValueWithMetadata
  extends ObjectDataTypeWithMetadata {}

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

export interface BlockCollectionOutgoingLinksByLinkEntityTypeId {}

/**
 * A collection of blocks.
 */
export interface BlockCollectionProperties {}

export interface BlockCollectionPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: BlockCollectionPropertiesWithMetadataValue;
}

export interface BlockCollectionPropertiesWithMetadataValue {}

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
  value: BlockPropertiesWithMetadataValue;
}

export interface BlockPropertiesWithMetadataValue {
  "https://hash.ai/@hash/types/property-type/component-id/": ComponentIdPropertyValueWithMetadata;
}

/**
 * A True or False value
 */
export interface BooleanDataType extends boolean {}

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
 * Settings for the HASH browser plugin
 */
export interface BrowserPluginSettings {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/browser-plugin-settings/v/1";
  properties: BrowserPluginSettingsProperties;
  propertiesWithMetadata: BrowserPluginSettingsPropertiesWithMetadata;
}

export type BrowserPluginSettingsOutgoingLinkAndTarget = never;

export interface BrowserPluginSettingsOutgoingLinksByLinkEntityTypeId {}

/**
 * Settings for the HASH browser plugin
 */
export interface BrowserPluginSettingsProperties {
  "https://hash.ai/@hash/types/property-type/automatic-inference-configuration/": AutomaticInferenceConfigurationPropertyValue;
  "https://hash.ai/@hash/types/property-type/browser-plugin-tab/": BrowserPluginTabPropertyValue;
  "https://hash.ai/@hash/types/property-type/draft-note/"?: DraftNotePropertyValue;
  "https://hash.ai/@hash/types/property-type/manual-inference-configuration/": ManualInferenceConfigurationPropertyValue;
}

export interface BrowserPluginSettingsPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: BrowserPluginSettingsPropertiesWithMetadataValue;
}

export interface BrowserPluginSettingsPropertiesWithMetadataValue {
  "https://hash.ai/@hash/types/property-type/automatic-inference-configuration/": AutomaticInferenceConfigurationPropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/browser-plugin-tab/": BrowserPluginTabPropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/draft-note/"?: DraftNotePropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/manual-inference-configuration/": ManualInferenceConfigurationPropertyValueWithMetadata;
}

/**
 * A tab in the HASH browser plugin
 */
export type BrowserPluginTabPropertyValue = TextDataType;

export interface BrowserPluginTabPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

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
  value: CommentPropertiesWithMetadataValue;
}

export interface CommentPropertiesWithMetadataValue {
  "https://hash.ai/@hash/types/property-type/deleted-at/"?: DeletedAtPropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/resolved-at/"?: ResolvedAtPropertyValueWithMetadata;
}

/**
 * An identifier for a component.
 */
export type ComponentIdPropertyValue = TextDataType;

export interface ComponentIdPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The name of the connection source.
 */
export type ConnectionSourceNamePropertyValue = TextDataType;

export interface ConnectionSourceNamePropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * A reference to a particular date and time, formatted according to RFC 3339.
 */
export interface DateTimeDataType extends string {}

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

export interface DeletedAtPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.
 */
export type DescriptionPropertyValue = TextDataType;

export interface DescriptionPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * A human-friendly display name for something
 */
export type DisplayNamePropertyValue = TextDataType;

export interface DisplayNamePropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * A document file.
 */
export interface DocumentFile {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/document-file/v/1";
  properties: DocumentFileProperties;
  propertiesWithMetadata: DocumentFilePropertiesWithMetadata;
}

export type DocumentFileOutgoingLinkAndTarget = never;

export interface DocumentFileOutgoingLinksByLinkEntityTypeId {}

/**
 * A document file.
 */
export interface DocumentFileProperties
  extends DocumentFileProperties1,
    DocumentFileProperties2 {}
export interface DocumentFileProperties1 extends FileProperties {}

export interface DocumentFileProperties2 {
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/"?: TextualContentPropertyValue;
}

export interface DocumentFilePropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: DocumentFilePropertiesWithMetadataValue;
}

export interface DocumentFilePropertiesWithMetadataValue
  extends DocumentFilePropertiesWithMetadataValue1,
    DocumentFilePropertiesWithMetadataValue2 {}
export interface DocumentFilePropertiesWithMetadataValue1
  extends FilePropertiesWithMetadataValue {}

export interface DocumentFilePropertiesWithMetadataValue2 {
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/"?: TextualContentPropertyValueWithMetadata;
}

/**
 * A working draft of a text note
 */
export type DraftNotePropertyValue = TextDataType;

export interface DraftNotePropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * An email address
 */
export type EmailPropertyValue = TextDataType;

export interface EmailPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * A list of identifiers for a feature flags that are enabled.
 */
export type EnabledFeatureFlagsPropertyValue = TextDataType[];

export type EnabledFeatureFlagsPropertyValueWithMetadata = {
  value: TextDataTypeWithMetadata[];
  metadata?: ArrayMetadata;
};

/**
 * An identifier for an edition of an entity
 */
export type EntityEditionIdPropertyValue = TextDataType;

export interface EntityEditionIdPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * Stringified timestamp of when something expired.
 */
export type ExpiredAtPropertyValue = TextDataType;

export interface ExpiredAtPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The name of a feature
 */
export type FeatureNamePropertyValue = TextDataType;

export interface FeatureNamePropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * A file hosted at a URL
 */
export interface File extends PropertyObject {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/file/v/2";
  properties: FileProperties;
  propertiesWithMetadata: FilePropertiesWithMetadata;
}

/**
 * A unique signature derived from a file's contents
 */
export type FileHashPropertyValue = TextDataType;

export interface FileHashPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The name of a file.
 */
export type FileNamePropertyValue = TextDataType;

export interface FileNamePropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

export type FileOutgoingLinkAndTarget = never;

export interface FileOutgoingLinksByLinkEntityTypeId {}

/**
 * A file hosted at a URL
 */
export interface FileProperties extends PropertyObject {
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
  value: FilePropertiesWithMetadataValue;
}

export interface FilePropertiesWithMetadataValue {
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
}

/**
 * The size of a file
 */
export type FileSizePropertyValue = NumberDataType;

export interface FileSizePropertyValueWithMetadata
  extends NumberDataTypeWithMetadata {}

/**
 * The bucket in which a file is stored.
 */
export type FileStorageBucketPropertyValue = TextDataType;

export interface FileStorageBucketPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The endpoint for making requests to a file storage provider.
 */
export type FileStorageEndpointPropertyValue = TextDataType;

export interface FileStorageEndpointPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * Whether to force path style for requests to a file storage provider (vs virtual host style).
 */
export type FileStorageForcePathStylePropertyValue = BooleanDataType;

export interface FileStorageForcePathStylePropertyValueWithMetadata
  extends BooleanDataTypeWithMetadata {}

/**
 * The key identifying a file in storage.
 */
export type FileStorageKeyPropertyValue = TextDataType;

export interface FileStorageKeyPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The provider of a file storage service.
 */
export type FileStorageProviderPropertyValue = TextDataType;

export interface FileStorageProviderPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The region in which a file is stored.
 */
export type FileStorageRegionPropertyValue = TextDataType;

export interface FileStorageRegionPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * A URL that serves a file.
 */
export type FileURLPropertyValue = TextDataType;

export interface FileURLPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The ID of the flow definition (the `entityId` of the flow definition entity).
 */
export type FlowDefinitionIDPropertyValue = TextDataType;

export interface FlowDefinitionIDPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * An execution run of a flow.
 */
export interface FlowRun {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/flow-run/v/1";
  properties: FlowRunProperties;
  propertiesWithMetadata: FlowRunPropertiesWithMetadata;
}

export type FlowRunOutgoingLinkAndTarget = never;

export interface FlowRunOutgoingLinksByLinkEntityTypeId {}

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
  value: FlowRunPropertiesWithMetadataValue;
}

export interface FlowRunPropertiesWithMetadataValue {
  "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/flow-definition-id/": FlowDefinitionIDPropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/outputs/"?: OutputsPropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/step/": StepPropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/trigger/": TriggerPropertyValueWithMetadata;
}

/**
 * The fractional index indicating the current position of something.
 */
export type FractionalIndexPropertyValue = TextDataType;

export interface FractionalIndexPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * Something that something has
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

export interface HasAvatarOutgoingLinksByLinkEntityTypeId {}

/**
 * The avatar something has.
 */
export interface HasAvatarProperties
  extends HasAvatarProperties1,
    HasAvatarProperties2 {}
export interface HasAvatarProperties1 extends LinkProperties {}

export interface HasAvatarProperties2 {}

export interface HasAvatarPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: HasAvatarPropertiesWithMetadataValue;
}

export interface HasAvatarPropertiesWithMetadataValue
  extends HasAvatarPropertiesWithMetadataValue1,
    HasAvatarPropertiesWithMetadataValue2 {}
export interface HasAvatarPropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface HasAvatarPropertiesWithMetadataValue2 {}

/**
 * The biography something has.
 */
export interface HasBio {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/has-bio/v/1";
  properties: HasBioProperties;
  propertiesWithMetadata: HasBioPropertiesWithMetadata;
}

export type HasBioOutgoingLinkAndTarget = never;

export interface HasBioOutgoingLinksByLinkEntityTypeId {}

/**
 * The biography something has.
 */
export interface HasBioProperties
  extends HasBioProperties1,
    HasBioProperties2 {}
export interface HasBioProperties1 extends LinkProperties {}

export interface HasBioProperties2 {}

export interface HasBioPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: HasBioPropertiesWithMetadataValue;
}

export interface HasBioPropertiesWithMetadataValue
  extends HasBioPropertiesWithMetadataValue1,
    HasBioPropertiesWithMetadataValue2 {}
export interface HasBioPropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface HasBioPropertiesWithMetadataValue2 {}

/**
 * The cover image something has.
 */
export interface HasCoverImage {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/has-cover-image/v/1";
  properties: HasCoverImageProperties;
  propertiesWithMetadata: HasCoverImagePropertiesWithMetadata;
}

export type HasCoverImageOutgoingLinkAndTarget = never;

export interface HasCoverImageOutgoingLinksByLinkEntityTypeId {}

/**
 * The cover image something has.
 */
export interface HasCoverImageProperties
  extends HasCoverImageProperties1,
    HasCoverImageProperties2 {}
export interface HasCoverImageProperties1 extends LinkProperties {}

export interface HasCoverImageProperties2 {}

export interface HasCoverImagePropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: HasCoverImagePropertiesWithMetadataValue;
}

export interface HasCoverImagePropertiesWithMetadataValue
  extends HasCoverImagePropertiesWithMetadataValue1,
    HasCoverImagePropertiesWithMetadataValue2 {}
export interface HasCoverImagePropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface HasCoverImagePropertiesWithMetadataValue2 {}

/**
 * The data that something has.
 */
export interface HasData {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/has-data/v/1";
  properties: HasDataProperties;
  propertiesWithMetadata: HasDataPropertiesWithMetadata;
}

export type HasDataOutgoingLinkAndTarget = never;

export interface HasDataOutgoingLinksByLinkEntityTypeId {}

/**
 * The data that something has.
 */
export interface HasDataProperties
  extends HasDataProperties1,
    HasDataProperties2 {}
export interface HasDataProperties1 extends LinkProperties {}

export interface HasDataProperties2 {}

export interface HasDataPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: HasDataPropertiesWithMetadataValue;
}

export interface HasDataPropertiesWithMetadataValue
  extends HasDataPropertiesWithMetadataValue1,
    HasDataPropertiesWithMetadataValue2 {}
export interface HasDataPropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface HasDataPropertiesWithMetadataValue2 {}

/**
 * Something contained at an index by something
 */
export interface HasIndexedContent extends PropertyObject {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/has-indexed-content/v/1";
  properties: HasIndexedContentProperties;
  propertiesWithMetadata: HasIndexedContentPropertiesWithMetadata;
}

export type HasIndexedContentOutgoingLinkAndTarget = never;

export interface HasIndexedContentOutgoingLinksByLinkEntityTypeId {}

/**
 * Something contained at an index by something
 */
export interface HasIndexedContentProperties
  extends HasIndexedContentProperties1,
    HasIndexedContentProperties2 {}
export interface HasIndexedContentProperties1 extends LinkProperties {}

export interface HasIndexedContentProperties2 {
  "https://hash.ai/@hash/types/property-type/fractional-index/": FractionalIndexPropertyValue;
}

export interface HasIndexedContentPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: HasIndexedContentPropertiesWithMetadataValue;
}

export interface HasIndexedContentPropertiesWithMetadataValue
  extends HasIndexedContentPropertiesWithMetadataValue1,
    HasIndexedContentPropertiesWithMetadataValue2 {}
export interface HasIndexedContentPropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface HasIndexedContentPropertiesWithMetadataValue2 {
  "https://hash.ai/@hash/types/property-type/fractional-index/": FractionalIndexPropertyValueWithMetadata;
}

export type HasOutgoingLinkAndTarget = never;

export interface HasOutgoingLinksByLinkEntityTypeId {}

/**
 * The parent something has.
 */
export interface HasParent {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/has-parent/v/1";
  properties: HasParentProperties;
  propertiesWithMetadata: HasParentPropertiesWithMetadata;
}

export type HasParentOutgoingLinkAndTarget = never;

export interface HasParentOutgoingLinksByLinkEntityTypeId {}

/**
 * The parent something has.
 */
export interface HasParentProperties
  extends HasParentProperties1,
    HasParentProperties2 {}
export interface HasParentProperties1 extends LinkProperties {}

export interface HasParentProperties2 {}

export interface HasParentPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: HasParentPropertiesWithMetadataValue;
}

export interface HasParentPropertiesWithMetadataValue
  extends HasParentPropertiesWithMetadataValue1,
    HasParentPropertiesWithMetadataValue2 {}
export interface HasParentPropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface HasParentPropertiesWithMetadataValue2 {}

/**
 * Something that something has
 */
export interface HasProperties extends HasProperties1, HasProperties2 {}
export interface HasProperties1 extends LinkProperties {}

export interface HasProperties2 {}

export interface HasPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: HasPropertiesWithMetadataValue;
}

export interface HasPropertiesWithMetadataValue
  extends HasPropertiesWithMetadataValue1,
    HasPropertiesWithMetadataValue2 {}
export interface HasPropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface HasPropertiesWithMetadataValue2 {}

/**
 * The service account something has.
 */
export interface HasServiceAccount {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/has-service-account/v/1";
  properties: HasServiceAccountProperties;
  propertiesWithMetadata: HasServiceAccountPropertiesWithMetadata;
}

export type HasServiceAccountOutgoingLinkAndTarget = never;

export interface HasServiceAccountOutgoingLinksByLinkEntityTypeId {}

/**
 * The service account something has.
 */
export interface HasServiceAccountProperties
  extends HasServiceAccountProperties1,
    HasServiceAccountProperties2 {}
export interface HasServiceAccountProperties1 extends LinkProperties {}

export interface HasServiceAccountProperties2 {}

export interface HasServiceAccountPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: HasServiceAccountPropertiesWithMetadataValue;
}

export interface HasServiceAccountPropertiesWithMetadataValue
  extends HasServiceAccountPropertiesWithMetadataValue1,
    HasServiceAccountPropertiesWithMetadataValue2 {}
export interface HasServiceAccountPropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface HasServiceAccountPropertiesWithMetadataValue2 {}

/**
 * The text something has.
 */
export interface HasText {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/has-text/v/1";
  properties: HasTextProperties;
  propertiesWithMetadata: HasTextPropertiesWithMetadata;
}

export type HasTextOutgoingLinkAndTarget = never;

export interface HasTextOutgoingLinksByLinkEntityTypeId {}

/**
 * The text something has.
 */
export interface HasTextProperties
  extends HasTextProperties1,
    HasTextProperties2 {}
export interface HasTextProperties1 extends LinkProperties {}

export interface HasTextProperties2 {}

export interface HasTextPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: HasTextPropertiesWithMetadataValue;
}

export interface HasTextPropertiesWithMetadataValue
  extends HasTextPropertiesWithMetadataValue1,
    HasTextPropertiesWithMetadataValue2 {}
export interface HasTextPropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface HasTextPropertiesWithMetadataValue2 {}

/**
 * An emoji icon.
 */
export type IconPropertyValue = TextDataType;

export interface IconPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * An image file hosted at a URL
 */
export interface Image {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/image/v/2";
  properties: ImageProperties;
  propertiesWithMetadata: ImagePropertiesWithMetadata;
}

export type ImageOutgoingLinkAndTarget = never;

export interface ImageOutgoingLinksByLinkEntityTypeId {}

/**
 * An image file hosted at a URL
 */
export interface ImageProperties extends ImageProperties1, ImageProperties2 {}
export interface ImageProperties1 extends FileProperties {}

export interface ImageProperties2 {}

export interface ImagePropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: ImagePropertiesWithMetadataValue;
}

export interface ImagePropertiesWithMetadataValue
  extends ImagePropertiesWithMetadataValue1,
    ImagePropertiesWithMetadataValue2 {}
export interface ImagePropertiesWithMetadataValue1
  extends FilePropertiesWithMetadataValue {}

export interface ImagePropertiesWithMetadataValue2 {}

/**
 * The cost of an input unit
 */
export type InputUnitCostPropertyValue = NumberDataType;

export interface InputUnitCostPropertyValueWithMetadata
  extends NumberDataTypeWithMetadata {}

/**
 * Something that someone or something is a member of.
 */
export interface IsMemberOf {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/is-member-of/v/1";
  properties: IsMemberOfProperties;
  propertiesWithMetadata: IsMemberOfPropertiesWithMetadata;
}

export type IsMemberOfOutgoingLinkAndTarget = never;

export interface IsMemberOfOutgoingLinksByLinkEntityTypeId {}

/**
 * Something that someone or something is a member of.
 */
export interface IsMemberOfProperties
  extends IsMemberOfProperties1,
    IsMemberOfProperties2 {}
export interface IsMemberOfProperties1 extends LinkProperties {}

export interface IsMemberOfProperties2 {}

export interface IsMemberOfPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: IsMemberOfPropertiesWithMetadataValue;
}

export interface IsMemberOfPropertiesWithMetadataValue
  extends IsMemberOfPropertiesWithMetadataValue1,
    IsMemberOfPropertiesWithMetadataValue2 {}
export interface IsMemberOfPropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface IsMemberOfPropertiesWithMetadataValue2 {}

/**
 * An identifier for a record in Ory Kratos.
 */
export type KratosIdentityIdPropertyValue = TextDataType;

export interface KratosIdentityIdPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * undefined
 */
export interface Link {
  entityTypeId: "https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1";
  properties: LinkProperties;
  propertiesWithMetadata: LinkPropertiesWithMetadata;
}

export type LinkOutgoingLinkAndTarget = never;

export interface LinkOutgoingLinksByLinkEntityTypeId {}

export interface LinkProperties {}

export interface LinkPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: LinkPropertiesWithMetadataValue;
}

export interface LinkPropertiesWithMetadataValue {}

/**
 * A location for something, expressed as a single string
 */
export type LocationPropertyValue = TextDataType;

export interface LocationPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * A MIME (Multipurpose Internet Mail Extensions) type.
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types
 */
export type MIMETypePropertyValue = TextDataType;

export interface MIMETypePropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * Configuration for a manual entity inference feature
 */
export type ManualInferenceConfigurationPropertyValue = ObjectDataType;

export interface ManualInferenceConfigurationPropertyValueWithMetadata
  extends ObjectDataTypeWithMetadata {}

/**
 * A word or set of words by which something is known, addressed, or referred to.
 */
export type NamePropertyValue = TextDataType;

export interface NamePropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * A notification to a user.
 */
export interface Notification {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/notification/v/1";
  properties: NotificationProperties;
  propertiesWithMetadata: NotificationPropertiesWithMetadata;
}

export type NotificationOutgoingLinkAndTarget = never;

export interface NotificationOutgoingLinksByLinkEntityTypeId {}

/**
 * A notification to a user.
 */
export interface NotificationProperties {
  "https://hash.ai/@hash/types/property-type/archived/"?: ArchivedPropertyValue;
  "https://hash.ai/@hash/types/property-type/read-at/"?: ReadAtPropertyValue;
}

export interface NotificationPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: NotificationPropertiesWithMetadataValue;
}

export interface NotificationPropertiesWithMetadataValue {
  "https://hash.ai/@hash/types/property-type/archived/"?: ArchivedPropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/read-at/"?: ReadAtPropertyValueWithMetadata;
}

/**
 * An arithmetical value (in the Real number system)
 */
export interface NumberDataType extends number {}

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
 * An opaque, untyped JSON object
 */
export interface ObjectDataType {}

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

export interface OccurredInBlockOutgoingLinksByLinkEntityTypeId {}

/**
 * A block that something occurred in.
 */
export interface OccurredInBlockProperties
  extends OccurredInBlockProperties1,
    OccurredInBlockProperties2 {}
export interface OccurredInBlockProperties1 extends LinkProperties {}

export interface OccurredInBlockProperties2 {}

export interface OccurredInBlockPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: OccurredInBlockPropertiesWithMetadataValue;
}

export interface OccurredInBlockPropertiesWithMetadataValue
  extends OccurredInBlockPropertiesWithMetadataValue1,
    OccurredInBlockPropertiesWithMetadataValue2 {}
export interface OccurredInBlockPropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface OccurredInBlockPropertiesWithMetadataValue2 {}

/**
 * An entity that something occurred in.
 */
export interface OccurredInEntity {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/occurred-in-entity/v/2";
  properties: OccurredInEntityProperties;
  propertiesWithMetadata: OccurredInEntityPropertiesWithMetadata;
}

export type OccurredInEntityOutgoingLinkAndTarget = never;

export interface OccurredInEntityOutgoingLinksByLinkEntityTypeId {}

/**
 * An entity that something occurred in.
 */
export interface OccurredInEntityProperties
  extends OccurredInEntityProperties1,
    OccurredInEntityProperties2 {}
export interface OccurredInEntityProperties1 extends LinkProperties {}

export interface OccurredInEntityProperties2 {
  "https://hash.ai/@hash/types/property-type/entity-edition-id/"?: EntityEditionIdPropertyValue;
}

export interface OccurredInEntityPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: OccurredInEntityPropertiesWithMetadataValue;
}

export interface OccurredInEntityPropertiesWithMetadataValue
  extends OccurredInEntityPropertiesWithMetadataValue1,
    OccurredInEntityPropertiesWithMetadataValue2 {}
export interface OccurredInEntityPropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface OccurredInEntityPropertiesWithMetadataValue2 {
  "https://hash.ai/@hash/types/property-type/entity-edition-id/"?: EntityEditionIdPropertyValueWithMetadata;
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

export interface OrganizationNamePropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

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
  value: OrganizationPropertiesWithMetadataValue;
}

export interface OrganizationPropertiesWithMetadataValue {
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/location/"?: LocationPropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/organization-name/": OrganizationNamePropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/pinned-entity-type-base-url/"?: {
    value: PinnedEntityTypeBaseURLPropertyValueWithMetadata[];
    metadata?: ArrayMetadata;
  };
  "https://hash.ai/@hash/types/property-type/shortname/": ShortnamePropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/website-url/"?: WebsiteURLPropertyValueWithMetadata;
}

/**
 * The original name of a file
 */
export type OriginalFileNamePropertyValue = TextDataType;

export interface OriginalFileNamePropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The original source of something
 */
export type OriginalSourcePropertyValue = TextDataType;

export interface OriginalSourcePropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The original URL something was hosted at
 */
export type OriginalURLPropertyValue = TextDataType;

export interface OriginalURLPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The cost of an output unit
 */
export type OutputUnitCostPropertyValue = NumberDataType;

export interface OutputUnitCostPropertyValueWithMetadata
  extends NumberDataTypeWithMetadata {}

/**
 * The outputs of something.
 */
export type OutputsPropertyValue = ObjectDataType[];

export type OutputsPropertyValueWithMetadata = {
  value: ObjectDataTypeWithMetadata[];
  metadata?: ArrayMetadata;
};

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
export interface PageProperties extends PageProperties1, PageProperties2 {}
export interface PageProperties1 extends BlockCollectionProperties {}

export interface PageProperties2 {
  "https://hash.ai/@hash/types/property-type/archived/"?: ArchivedPropertyValue;
  "https://hash.ai/@hash/types/property-type/fractional-index/": FractionalIndexPropertyValue;
  "https://hash.ai/@hash/types/property-type/icon/"?: IconPropertyValue;
  "https://hash.ai/@hash/types/property-type/summary/"?: SummaryPropertyValue;
  "https://hash.ai/@hash/types/property-type/title/": TitlePropertyValue;
}

export interface PagePropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: PagePropertiesWithMetadataValue;
}

export interface PagePropertiesWithMetadataValue
  extends PagePropertiesWithMetadataValue1,
    PagePropertiesWithMetadataValue2 {}
export interface PagePropertiesWithMetadataValue1
  extends BlockCollectionPropertiesWithMetadataValue {}

export interface PagePropertiesWithMetadataValue2 {
  "https://hash.ai/@hash/types/property-type/archived/"?: ArchivedPropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/fractional-index/": FractionalIndexPropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/icon/"?: IconPropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/summary/"?: SummaryPropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/title/": TitlePropertyValueWithMetadata;
}

/**
 * The base URL of a pinned entity type.
 */
export type PinnedEntityTypeBaseURLPropertyValue = TextDataType;

export interface PinnedEntityTypeBaseURLPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * Someone's preferred pronouns.
 */
export type PreferredPronounsPropertyValue = TextDataType;

export interface PreferredPronounsPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * A presentation file.
 */
export interface PresentationFile {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/presentation-file/v/1";
  properties: PresentationFileProperties;
  propertiesWithMetadata: PresentationFilePropertiesWithMetadata;
}

export type PresentationFileOutgoingLinkAndTarget = never;

export interface PresentationFileOutgoingLinksByLinkEntityTypeId {}

/**
 * A presentation file.
 */
export interface PresentationFileProperties
  extends PresentationFileProperties1,
    PresentationFileProperties2 {}
export interface PresentationFileProperties1 extends FileProperties {}

export interface PresentationFileProperties2 {
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/"?: TextualContentPropertyValue;
}

export interface PresentationFilePropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: PresentationFilePropertiesWithMetadataValue;
}

export interface PresentationFilePropertiesWithMetadataValue
  extends PresentationFilePropertiesWithMetadataValue1,
    PresentationFilePropertiesWithMetadataValue2 {}
export interface PresentationFilePropertiesWithMetadataValue1
  extends FilePropertiesWithMetadataValue {}

export interface PresentationFilePropertiesWithMetadataValue2 {
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/"?: TextualContentPropertyValueWithMetadata;
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
export interface ProfileBioProperties
  extends ProfileBioProperties1,
    ProfileBioProperties2 {}
export interface ProfileBioProperties1 extends BlockCollectionProperties {}

export interface ProfileBioProperties2 {}

export interface ProfileBioPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: ProfileBioPropertiesWithMetadataValue;
}

export interface ProfileBioPropertiesWithMetadataValue
  extends ProfileBioPropertiesWithMetadataValue1,
    ProfileBioPropertiesWithMetadataValue2 {}
export interface ProfileBioPropertiesWithMetadataValue1
  extends BlockCollectionPropertiesWithMetadataValue {}

export interface ProfileBioPropertiesWithMetadataValue2 {}

/**
 * A URL to a profile
 */
export type ProfileURLPropertyValue = TextDataType;

export interface ProfileURLPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The timestamp of when something was read.
 */
export type ReadAtPropertyValue = TextDataType;

export interface ReadAtPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * Stringified timestamp of when something was resolved.
 */
export type ResolvedAtPropertyValue = TextDataType;

export interface ResolvedAtPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * A service account.
 */
export interface ServiceAccount {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/service-account/v/1";
  properties: ServiceAccountProperties;
  propertiesWithMetadata: ServiceAccountPropertiesWithMetadata;
}

export type ServiceAccountOutgoingLinkAndTarget = never;

export interface ServiceAccountOutgoingLinksByLinkEntityTypeId {}

/**
 * A service account.
 */
export interface ServiceAccountProperties {
  "https://hash.ai/@hash/types/property-type/profile-url/": ProfileURLPropertyValue;
}

export interface ServiceAccountPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: ServiceAccountPropertiesWithMetadataValue;
}

export interface ServiceAccountPropertiesWithMetadataValue {
  "https://hash.ai/@hash/types/property-type/profile-url/": ProfileURLPropertyValueWithMetadata;
}

/**
 * A feature of a service
 */
export interface ServiceFeature {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/service-feature/v/1";
  properties: ServiceFeatureProperties;
  propertiesWithMetadata: ServiceFeaturePropertiesWithMetadata;
}

export type ServiceFeatureOutgoingLinkAndTarget = never;

export interface ServiceFeatureOutgoingLinksByLinkEntityTypeId {}

/**
 * A feature of a service
 */
export interface ServiceFeatureProperties {
  "https://hash.ai/@hash/types/property-type/feature-name/": FeatureNamePropertyValue;
  "https://hash.ai/@hash/types/property-type/service-name/": ServiceNamePropertyValue;
  "https://hash.ai/@hash/types/property-type/service-unit-cost/"?: ServiceUnitCostPropertyValue[];
}

export interface ServiceFeaturePropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: ServiceFeaturePropertiesWithMetadataValue;
}

export interface ServiceFeaturePropertiesWithMetadataValue {
  "https://hash.ai/@hash/types/property-type/feature-name/": FeatureNamePropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/service-name/": ServiceNamePropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/service-unit-cost/"?: {
    value: ServiceUnitCostPropertyValueWithMetadata[];
    metadata?: ArrayMetadata;
  };
}

/**
 * The name of a service
 */
export type ServiceNamePropertyValue = TextDataType;

export interface ServiceNamePropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The unit cost of a service
 */
export type ServiceUnitCostPropertyValue = {
  "https://hash.ai/@hash/types/property-type/applies-from/": AppliesFromPropertyValue;
  "https://hash.ai/@hash/types/property-type/applies-until/"?: AppliesUntilPropertyValue;
  "https://hash.ai/@hash/types/property-type/input-unit-cost/"?: InputUnitCostPropertyValue;
  "https://hash.ai/@hash/types/property-type/output-unit-cost/"?: OutputUnitCostPropertyValue;
};

export type ServiceUnitCostPropertyValueWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@hash/types/property-type/applies-from/": AppliesFromPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/applies-until/"?: AppliesUntilPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/input-unit-cost/"?: InputUnitCostPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/output-unit-cost/"?: OutputUnitCostPropertyValueWithMetadata;
  };
};

/**
 * A unique identifier for something, in the form of a slug
 */
export type ShortnamePropertyValue = TextDataType;

export interface ShortnamePropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * A step in a flow run.
 */
export type StepPropertyValue = ObjectDataType[];

export type StepPropertyValueWithMetadata = {
  value: ObjectDataTypeWithMetadata[];
  metadata?: ArrayMetadata;
};

/**
 * The summary of the something.
 */
export type SummaryPropertyValue = TextDataType;

export interface SummaryPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * An ordered sequence of characters.
 */
export interface Text {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/text/v/1";
  properties: TextProperties;
  propertiesWithMetadata: TextPropertiesWithMetadata;
}

/**
 * An ordered sequence of characters
 */
export interface TextDataType extends string {}

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

export interface TextOutgoingLinksByLinkEntityTypeId {}

/**
 * An ordered sequence of characters.
 */
export interface TextProperties {
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/": TextualContentPropertyValue;
}

export interface TextPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: TextPropertiesWithMetadataValue;
}

export interface TextPropertiesWithMetadataValue {
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/": TextualContentPropertyValueWithMetadata;
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

export interface TitlePropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The ID of the trigger definition.
 */
export type TriggerDefinitionIDPropertyValue = TextDataType;

export interface TriggerDefinitionIDPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * The trigger of a flow.
 */
export type TriggerPropertyValue = {
  "https://hash.ai/@hash/types/property-type/outputs/"?: OutputsPropertyValue;
  "https://hash.ai/@hash/types/property-type/trigger-definition-id/": TriggerDefinitionIDPropertyValue;
};

export type TriggerPropertyValueWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@hash/types/property-type/outputs/"?: OutputsPropertyValueWithMetadata;
    "https://hash.ai/@hash/types/property-type/trigger-definition-id/": TriggerDefinitionIDPropertyValueWithMetadata;
  };
};

/**
 * A user that triggered something.
 */
export interface TriggeredByUser {
  entityTypeId: "https://hash.ai/@hash/types/entity-type/triggered-by-user/v/1";
  properties: TriggeredByUserProperties;
  propertiesWithMetadata: TriggeredByUserPropertiesWithMetadata;
}

export type TriggeredByUserOutgoingLinkAndTarget = never;

export interface TriggeredByUserOutgoingLinksByLinkEntityTypeId {}

/**
 * A user that triggered something.
 */
export interface TriggeredByUserProperties
  extends TriggeredByUserProperties1,
    TriggeredByUserProperties2 {}
export interface TriggeredByUserProperties1 extends LinkProperties {}

export interface TriggeredByUserProperties2 {}

export interface TriggeredByUserPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: TriggeredByUserPropertiesWithMetadataValue;
}

export interface TriggeredByUserPropertiesWithMetadataValue
  extends TriggeredByUserPropertiesWithMetadataValue1,
    TriggeredByUserPropertiesWithMetadataValue2 {}
export interface TriggeredByUserPropertiesWithMetadataValue1
  extends LinkPropertiesWithMetadataValue {}

export interface TriggeredByUserPropertiesWithMetadataValue2 {}

/**
 * The timestamp when the upload of something has completed
 */
export type UploadCompletedAtPropertyValue = DateTimeDataType;

export interface UploadCompletedAtPropertyValueWithMetadata
  extends DateTimeDataTypeWithMetadata {}

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
export interface UserProperties extends UserProperties1, UserProperties2 {}
export interface UserProperties1 extends ActorProperties {}

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

export interface UserPropertiesWithMetadata {
  metadata?: ObjectMetadata;
  value: UserPropertiesWithMetadataValue;
}

export interface UserPropertiesWithMetadataValue
  extends UserPropertiesWithMetadataValue1,
    UserPropertiesWithMetadataValue2 {}
export interface UserPropertiesWithMetadataValue1
  extends ActorPropertiesWithMetadataValue {}

export interface UserPropertiesWithMetadataValue2 {
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

export interface UserSecretOutgoingLinksByLinkEntityTypeId {}

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
  value: UserSecretPropertiesWithMetadataValue;
}

export interface UserSecretPropertiesWithMetadataValue {
  "https://hash.ai/@hash/types/property-type/connection-source-name/": ConnectionSourceNamePropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/expired-at/": ExpiredAtPropertyValueWithMetadata;
  "https://hash.ai/@hash/types/property-type/vault-path/": VaultPathPropertyValueWithMetadata;
}

/**
 * The path to a secret in Hashicorp Vault.
 */
export type VaultPathPropertyValue = TextDataType;

export interface VaultPathPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}

/**
 * A URL for a website
 */
export type WebsiteURLPropertyValue = TextDataType;

export interface WebsiteURLPropertyValueWithMetadata
  extends TextDataTypeWithMetadata {}
