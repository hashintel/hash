/**
 * This file was automatically generated – do not edit it.
 */

import type {
  ArrayMetadata,
  Confidence,
  Entity,
  ObjectMetadata,
  PropertyProvenance,
} from "@blockprotocol/type-system";

/**
 * Someone or something that can perform actions in the system
 */
export type Actor = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/actor/v/2"];
  properties: ActorProperties;
  propertiesWithMetadata: ActorPropertiesWithMetadata;
};

export type ActorOutgoingLinkAndTarget = never;

export type ActorOutgoingLinksByLinkEntityTypeId = {};

/**
 * Someone or something that can perform actions in the system
 */
export type ActorProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/"?: DisplayNamePropertyValue;
};

export type ActorPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/"?: DisplayNamePropertyValueWithMetadata;
  };
};

/**
 * Something that something is affiliated with.
 */
export type AffiliatedWith = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/affiliated-with/v/1"];
  properties: AffiliatedWithProperties;
  propertiesWithMetadata: AffiliatedWithPropertiesWithMetadata;
};

export type AffiliatedWithOutgoingLinkAndTarget = never;

export type AffiliatedWithOutgoingLinksByLinkEntityTypeId = {};

/**
 * Something that something is affiliated with.
 */
export type AffiliatedWithProperties = LinkProperties & {};

export type AffiliatedWithPropertiesWithMetadata =
  LinkPropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {};
  };

/**
 * A vehicle designed for air travel, such as an airplane or helicopter.
 */
export type Aircraft = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/aircraft/v/1"];
  properties: AircraftProperties;
  propertiesWithMetadata: AircraftPropertiesWithMetadata;
};

export type AircraftOutgoingLinkAndTarget = never;

export type AircraftOutgoingLinksByLinkEntityTypeId = {};

/**
 * A vehicle designed for air travel, such as an airplane or helicopter.
 */
export type AircraftProperties = {
  "https://hash.ai/@h/types/property-type/icao-code/"?: ICAOCodePropertyValue;
  "https://hash.ai/@h/types/property-type/registration-number/": RegistrationNumberPropertyValue;
};

export type AircraftPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/icao-code/"?: ICAOCodePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/registration-number/": RegistrationNumberPropertyValueWithMetadata;
  };
};

/**
 * A company that provides air transport services for passengers and/or cargo.
 */
export type Airline = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/airline/v/1"];
  properties: AirlineProperties;
  propertiesWithMetadata: AirlinePropertiesWithMetadata;
};

export type AirlineOutgoingLinkAndTarget = never;

export type AirlineOutgoingLinksByLinkEntityTypeId = {};

/**
 * A company that provides air transport services for passengers and/or cargo.
 */
export type AirlineProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValue;
  "https://hash.ai/@h/types/property-type/iata-code/"?: IATACodePropertyValue;
  "https://hash.ai/@h/types/property-type/icao-code/"?: ICAOCodePropertyValue;
};

export type AirlinePropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/iata-code/"?: IATACodePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/icao-code/"?: ICAOCodePropertyValueWithMetadata;
  };
};

/**
 * A facility where aircraft take off and land, with infrastructure for passenger and cargo services.
 */
export type Airport = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/airport/v/1"];
  properties: AirportProperties;
  propertiesWithMetadata: AirportPropertiesWithMetadata;
};

export type AirportOutgoingLinkAndTarget = never;

export type AirportOutgoingLinksByLinkEntityTypeId = {};

/**
 * A facility where aircraft take off and land, with infrastructure for passenger and cargo services.
 */
export type AirportProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValue;
  "https://hash.ai/@h/types/property-type/city/"?: CityPropertyValue;
  "https://hash.ai/@h/types/property-type/iata-code/"?: IATACodePropertyValue;
  "https://hash.ai/@h/types/property-type/icao-code/"?: ICAOCodePropertyValue;
  "https://hash.ai/@h/types/property-type/timezone/"?: TimezonePropertyValue;
};

export type AirportPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/city/"?: CityPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/iata-code/"?: IATACodePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/icao-code/"?: ICAOCodePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/timezone/"?: TimezonePropertyValueWithMetadata;
  };
};

/**
 * A user or other entity's preferences for how an application should behave or appear
 */
export type ApplicationPreferencesPropertyValue = ObjectDataType;

export type ApplicationPreferencesPropertyValueWithMetadata =
  ObjectDataTypeWithMetadata;

/**
 * The point in time at which something begins to apply
 */
export type AppliesFromPropertyValue = DateTimeDataType;

export type AppliesFromPropertyValueWithMetadata = DateTimeDataTypeWithMetadata;

/**
 * The point at which something ceases to apply
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
export type AuthoredBy = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/authored-by/v/1"];
  properties: AuthoredByProperties;
  propertiesWithMetadata: AuthoredByPropertiesWithMetadata;
};

export type AuthoredByOutgoingLinkAndTarget = never;

export type AuthoredByOutgoingLinksByLinkEntityTypeId = {};

/**
 * What or whom something was authored by.
 */
export type AuthoredByProperties = LinkProperties & {};

export type AuthoredByPropertiesWithMetadata = LinkPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * Configuration for an automatic or passive entity inference feature
 */
export type AutomaticInferenceConfigurationPropertyValue = ObjectDataType;

export type AutomaticInferenceConfigurationPropertyValueWithMetadata =
  ObjectDataTypeWithMetadata;

/**
 * A block that displays or otherwise uses data, part of a wider page or collection.
 */
export type Block = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/block/v/1"];
  properties: BlockProperties;
  propertiesWithMetadata: BlockPropertiesWithMetadata;
};

/**
 * A collection of blocks.
 */
export type BlockCollection = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/block-collection/v/1"];
  properties: BlockCollectionProperties;
  propertiesWithMetadata: BlockCollectionPropertiesWithMetadata;
};

export type BlockCollectionOutgoingLinkAndTarget = never;

export type BlockCollectionOutgoingLinksByLinkEntityTypeId = {};

/**
 * A collection of blocks.
 */
export type BlockCollectionProperties = {};

export type BlockCollectionPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {};
};

export type BlockHasDataLink = { linkEntity: HasData; rightEntity: Entity };

export type BlockOutgoingLinkAndTarget = BlockHasDataLink;

export type BlockOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@h/types/entity-type/has-data/v/1": BlockHasDataLink;
};

/**
 * A block that displays or otherwise uses data, part of a wider page or collection.
 */
export type BlockProperties = {
  "https://hash.ai/@h/types/property-type/component-id/": ComponentIdPropertyValue;
};

export type BlockPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/component-id/": ComponentIdPropertyValueWithMetadata;
  };
};

/**
 * A True or False value
 */
export type BooleanDataType = boolean;

export type BooleanDataTypeWithMetadata = {
  value: BooleanDataType;
  metadata: BooleanDataTypeMetadata;
};
export type BooleanDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1";
};

/**
 * Settings for the HASH browser plugin
 */
export type BrowserPluginSettings = {
  entityTypeIds: [
    "https://hash.ai/@h/types/entity-type/browser-plugin-settings/v/1",
  ];
  properties: BrowserPluginSettingsProperties;
  propertiesWithMetadata: BrowserPluginSettingsPropertiesWithMetadata;
};

export type BrowserPluginSettingsOutgoingLinkAndTarget = never;

export type BrowserPluginSettingsOutgoingLinksByLinkEntityTypeId = {};

/**
 * Settings for the HASH browser plugin
 */
export type BrowserPluginSettingsProperties = {
  "https://hash.ai/@h/types/property-type/automatic-inference-configuration/": AutomaticInferenceConfigurationPropertyValue;
  "https://hash.ai/@h/types/property-type/browser-plugin-tab/": BrowserPluginTabPropertyValue;
  "https://hash.ai/@h/types/property-type/draft-note/"?: DraftNotePropertyValue;
  "https://hash.ai/@h/types/property-type/manual-inference-configuration/": ManualInferenceConfigurationPropertyValue;
};

export type BrowserPluginSettingsPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/automatic-inference-configuration/": AutomaticInferenceConfigurationPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/browser-plugin-tab/": BrowserPluginTabPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/draft-note/"?: DraftNotePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/manual-inference-configuration/": ManualInferenceConfigurationPropertyValueWithMetadata;
  };
};

/**
 * A tab in the HASH browser plugin
 */
export type BrowserPluginTabPropertyValue = TextDataType;

export type BrowserPluginTabPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * A unit of information equal to eight bits.
 */
export type BytesDataType = InformationDataType;

export type BytesDataTypeWithMetadata = {
  value: BytesDataType;
  metadata: BytesDataTypeMetadata;
};
export type BytesDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/bytes/v/1";
};

/**
 * Configuration options for rendering a chart.
 */
export type ChartConfigurationPropertyValue = ObjectDataType;

export type ChartConfigurationPropertyValueWithMetadata =
  ObjectDataTypeWithMetadata;

/**
 * A type of data visualization chart.
 */
export type ChartTypePropertyValue = TextDataType;

export type ChartTypePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The city where something is located, occurred, etc.
 */
export type CityPropertyValue = TextDataType;

export type CityPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Comment associated with the issue.
 */
export type Comment = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/comment/v/7"];
  properties: CommentProperties;
  propertiesWithMetadata: CommentPropertiesWithMetadata;
};

export type CommentAuthoredByLink = {
  linkEntity: AuthoredBy;
  rightEntity: User;
};

export type CommentHasParentLink = {
  linkEntity: HasParent;
  rightEntity: Comment | Block;
};

export type CommentHasTextLink = { linkEntity: HasText; rightEntity: Text };

export type CommentOutgoingLinkAndTarget =
  | CommentAuthoredByLink
  | CommentHasParentLink
  | CommentHasTextLink;

export type CommentOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@h/types/entity-type/authored-by/v/1": CommentAuthoredByLink;
  "https://hash.ai/@h/types/entity-type/has-parent/v/1": CommentHasParentLink;
  "https://hash.ai/@h/types/entity-type/has-text/v/1": CommentHasTextLink;
};

/**
 * Comment associated with the issue.
 */
export type CommentProperties = {
  "https://hash.ai/@h/types/property-type/deleted-at/"?: DeletedAtPropertyValue;
  "https://hash.ai/@h/types/property-type/resolved-at/"?: ResolvedAtPropertyValue;
};

export type CommentPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/deleted-at/"?: DeletedAtPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/resolved-at/"?: ResolvedAtPropertyValueWithMetadata;
  };
};

/**
 * An identifier for a component.
 */
export type ComponentIdPropertyValue = TextDataType;

export type ComponentIdPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The status of a configuration process.
 */
export type ConfigurationStatusPropertyValue = TextDataType;

export type ConfigurationStatusPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * The name of the connection source.
 */
export type ConnectionSourceNamePropertyValue = TextDataType;

export type ConnectionSourceNamePropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * A DOI (Digital Object Identifier), used to identify digital objects such as journal articles or datasets.
 */
export type DOIDataType = TextDataType;

export type DOIDataTypeWithMetadata = {
  value: DOIDataType;
  metadata: DOIDataTypeMetadata;
};
export type DOIDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/doi/v/1";
};

/**
 * A permanent link for a digital object, using its Digital Object Identifier (DOI), which resolves to a webpage describing it
 */
export type DOILinkPropertyValue = URIDataType;

export type DOILinkPropertyValueWithMetadata = URIDataTypeWithMetadata;

/**
 * The Digital Object Identifier (DOI) of an object
 */
export type DOIPropertyValue = DOIDataType;

export type DOIPropertyValueWithMetadata = DOIDataTypeWithMetadata;

/**
 * A visualization item within a dashboard.
 */
export type DashboardItem = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/dashboard-item/v/1"];
  properties: DashboardItemProperties;
  propertiesWithMetadata: DashboardItemPropertiesWithMetadata;
};

export type DashboardItemOutgoingLinkAndTarget = never;

export type DashboardItemOutgoingLinksByLinkEntityTypeId = {};

/**
 * A visualization item within a dashboard.
 */
export type DashboardItemProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValue;
  "https://hash.ai/@h/types/property-type/chart-configuration/"?: ChartConfigurationPropertyValue;
  "https://hash.ai/@h/types/property-type/chart-type/"?: ChartTypePropertyValue;
  "https://hash.ai/@h/types/property-type/configuration-status/": ConfigurationStatusPropertyValue;
  "https://hash.ai/@h/types/property-type/goal/": GoalPropertyValue;
  "https://hash.ai/@h/types/property-type/grid-position/": GridPositionPropertyValue;
  "https://hash.ai/@h/types/property-type/python-script/"?: PythonScriptPropertyValue;
  "https://hash.ai/@h/types/property-type/structural-query/"?: StructuralQueryPropertyValue;
};

export type DashboardItemPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValueWithMetadata;
    "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/chart-configuration/"?: ChartConfigurationPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/chart-type/"?: ChartTypePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/configuration-status/": ConfigurationStatusPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/goal/": GoalPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/grid-position/": GridPositionPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/python-script/"?: PythonScriptPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/structural-query/"?: StructuralQueryPropertyValueWithMetadata;
  };
};

/**
 * The data sources configuration for an AI flow.
 */
export type DataSourcesPropertyValue = ObjectDataType;

export type DataSourcesPropertyValueWithMetadata = ObjectDataTypeWithMetadata;

/**
 * A reference to a particular day represented within a calendar system, formatted according to RFC 3339.
 */
export type DateDataType = TextDataType;

export type DateDataTypeWithMetadata = {
  value: DateDataType;
  metadata: DateDataTypeMetadata;
};
export type DateDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/date/v/1";
};

/**
 * A reference to a particular date and time, formatted according to RFC 3339.
 */
export type DateTimeDataType = TextDataType;

export type DateTimeDataTypeWithMetadata = {
  value: DateTimeDataType;
  metadata: DateTimeDataTypeMetadata;
};
export type DateTimeDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1";
};

/**
 * Stringified timestamp of when something was deleted.
 */
export type DeletedAtPropertyValue = DateTimeDataType;

export type DeletedAtPropertyValueWithMetadata = DateTimeDataTypeWithMetadata;

/**
 * A piece of text that tells you about something or someone. This can include explaining what they look like, what its purpose is for, what they’re like, etc.
 */
export type DescriptionPropertyValue = TextDataType;

export type DescriptionPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A human-friendly display name for something
 */
export type DisplayNamePropertyValue = TextDataType;

export type DisplayNamePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A written work, such as a book or article.
 */
export type Doc = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/doc/v/1"];
  properties: DocProperties;
  propertiesWithMetadata: DocPropertiesWithMetadata;
};

export type DocAuthoredByLink = { linkEntity: AuthoredBy; rightEntity: Person };

export type DocOutgoingLinkAndTarget = DocAuthoredByLink;

export type DocOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@h/types/entity-type/authored-by/v/1": DocAuthoredByLink;
};

/**
 * A written work, such as a book or article.
 */
export type DocProperties = {
  "https://hash.ai/@h/types/property-type/number-of-pages/"?: NumberOfPagesPropertyValue;
  "https://hash.ai/@h/types/property-type/publication-year/"?: PublicationYearPropertyValue;
  "https://hash.ai/@h/types/property-type/summary/"?: SummaryPropertyValue;
  "https://hash.ai/@h/types/property-type/title/": TitlePropertyValue;
};

export type DocPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/number-of-pages/"?: NumberOfPagesPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/publication-year/"?: PublicationYearPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/summary/"?: SummaryPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/title/": TitlePropertyValueWithMetadata;
  };
};

/**
 * A document file.
 */
export type DocumentFile = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/document-file/v/1"];
  properties: DocumentFileProperties;
  propertiesWithMetadata: DocumentFilePropertiesWithMetadata;
};

export type DocumentFileOutgoingLinkAndTarget = never;

export type DocumentFileOutgoingLinksByLinkEntityTypeId = {};

/**
 * A document file.
 */
export type DocumentFileProperties = FileProperties & {
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/"?: TextualContentPropertyValue;
};

export type DocumentFilePropertiesWithMetadata = FilePropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/"?: TextualContentPropertyValueWithMetadata;
  };
};

/**
 * A working draft of a text note
 */
export type DraftNotePropertyValue = TextDataType;

export type DraftNotePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A measure of the length of time.
 */
export type DurationDataType = NumberDataType;

export type DurationDataTypeWithMetadata = {
  value: DurationDataType;
  metadata: DurationDataTypeMetadata;
};
export type DurationDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/duration/v/1";
};

/**
 * An identifier for an email box to which messages are delivered.
 */
export type EmailDataType = TextDataType;

export type EmailDataTypeWithMetadata = {
  value: EmailDataType;
  metadata: EmailDataTypeMetadata;
};
export type EmailDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/email/v/1";
};

/**
 * An email address
 */
export type EmailPropertyValue = EmailDataType;

export type EmailPropertyValueWithMetadata = EmailDataTypeWithMetadata;

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

export type EntityEditionIdPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Stringified timestamp of when something expired.
 */
export type ExpiredAtPropertyValue = DateTimeDataType;

export type ExpiredAtPropertyValueWithMetadata = DateTimeDataTypeWithMetadata;

/**
 * An explanation or justification for something.
 */
export type ExplanationPropertyValue = TextDataType;

export type ExplanationPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The name of a feature
 */
export type FeatureNamePropertyValue = TextDataType;

export type FeatureNamePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A file hosted at a URL
 */
export type File = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/file/v/2"];
  properties: FileProperties;
  propertiesWithMetadata: FilePropertiesWithMetadata;
};

/**
 * A unique signature derived from a file's contents
 */
export type FileHashPropertyValue = TextDataType;

export type FileHashPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The name of a file.
 */
export type FileNamePropertyValue = TextDataType;

export type FileNamePropertyValueWithMetadata = TextDataTypeWithMetadata;

export type FileOutgoingLinkAndTarget = never;

export type FileOutgoingLinksByLinkEntityTypeId = {};

/**
 * A file hosted at a URL
 */
export type FileProperties = {
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
  "https://hash.ai/@h/types/property-type/file-storage-bucket/"?: FileStorageBucketPropertyValue;
  "https://hash.ai/@h/types/property-type/file-storage-endpoint/"?: FileStorageEndpointPropertyValue;
  "https://hash.ai/@h/types/property-type/file-storage-force-path-style/"?: FileStorageForcePathStylePropertyValue;
  "https://hash.ai/@h/types/property-type/file-storage-key/"?: FileStorageKeyPropertyValue;
  "https://hash.ai/@h/types/property-type/file-storage-provider/"?: FileStorageProviderPropertyValue;
  "https://hash.ai/@h/types/property-type/file-storage-region/"?: FileStorageRegionPropertyValue;
  "https://hash.ai/@h/types/property-type/upload-completed-at/"?: UploadCompletedAtPropertyValue;
};

export type FilePropertiesWithMetadata = {
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
    "https://hash.ai/@h/types/property-type/file-storage-bucket/"?: FileStorageBucketPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/file-storage-endpoint/"?: FileStorageEndpointPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/file-storage-force-path-style/"?: FileStorageForcePathStylePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/file-storage-key/"?: FileStorageKeyPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/file-storage-provider/"?: FileStorageProviderPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/file-storage-region/"?: FileStorageRegionPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/upload-completed-at/"?: UploadCompletedAtPropertyValueWithMetadata;
  };
};

/**
 * The size of a file
 */
export type FileSizePropertyValue = BytesDataType;

export type FileSizePropertyValueWithMetadata = BytesDataTypeWithMetadata;

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
export type FileURLPropertyValue = URIDataType;

export type FileURLPropertyValueWithMetadata = URIDataTypeWithMetadata;

/**
 * The definition of a HASH flow.
 */
export type FlowDefinition = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/flow-definition/v/1"];
  properties: FlowDefinitionProperties;
  propertiesWithMetadata: FlowDefinitionPropertiesWithMetadata;
};

/**
 * The ID of a flow definition.
 */
export type FlowDefinitionIDPropertyValue = TextDataType;

export type FlowDefinitionIDPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

export type FlowDefinitionOutgoingLinkAndTarget = never;

export type FlowDefinitionOutgoingLinksByLinkEntityTypeId = {};

/**
 * The definition of a HASH flow.
 */
export type FlowDefinitionProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/": DescriptionPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValue;
  "https://hash.ai/@h/types/property-type/output-definitions/": OutputDefinitionsPropertyValue;
  "https://hash.ai/@h/types/property-type/step-definitions/": StepDefinitionsPropertyValue;
  "https://hash.ai/@h/types/property-type/trigger-definition/": TriggerDefinitionPropertyValue;
};

export type FlowDefinitionPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/description/": DescriptionPropertyValueWithMetadata;
    "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/output-definitions/": OutputDefinitionsPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/step-definitions/": StepDefinitionsPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/trigger-definition/": TriggerDefinitionPropertyValueWithMetadata;
  };
};

/**
 * An execution run of a flow.
 */
export type FlowRun = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/flow-run/v/1"];
  properties: FlowRunProperties;
  propertiesWithMetadata: FlowRunPropertiesWithMetadata;
};

export type FlowRunOutgoingLinkAndTarget =
  | FlowRunScheduledByLink
  | FlowRunUsesLink;

export type FlowRunOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@h/types/entity-type/scheduled-by/v/1": FlowRunScheduledByLink;
  "https://hash.ai/@h/types/entity-type/uses/v/1": FlowRunUsesLink;
};

/**
 * An execution run of a flow.
 */
export type FlowRunProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValue;
  "https://hash.ai/@h/types/property-type/flow-definition-id/": FlowDefinitionIDPropertyValue;
  "https://hash.ai/@h/types/property-type/outputs/"?: OutputsPropertyValue;
  "https://hash.ai/@h/types/property-type/step/": StepPropertyValue;
  "https://hash.ai/@h/types/property-type/trigger/": TriggerPropertyValue;
  "https://hash.ai/@h/types/property-type/workflow-id/": WorkflowIDPropertyValue;
};

export type FlowRunPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/flow-definition-id/": FlowDefinitionIDPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/outputs/"?: OutputsPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/step/": StepPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/trigger/": TriggerPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/workflow-id/": WorkflowIDPropertyValueWithMetadata;
  };
};

export type FlowRunScheduledByLink = {
  linkEntity: ScheduledBy;
  rightEntity: FlowSchedule;
};

export type FlowRunUsesLink = { linkEntity: Uses; rightEntity: FlowDefinition };

/**
 * A schedule that triggers recurring executions of a flow definition.
 */
export type FlowSchedule = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/flow-schedule/v/1"];
  properties: FlowScheduleProperties;
  propertiesWithMetadata: FlowSchedulePropertiesWithMetadata;
};

export type FlowScheduleOutgoingLinkAndTarget = FlowScheduleUsesLink;

export type FlowScheduleOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@h/types/entity-type/uses/v/1": FlowScheduleUsesLink;
};

/**
 * A schedule that triggers recurring executions of a flow definition.
 */
export type FlowScheduleProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValue;
  "https://hash.ai/@h/types/property-type/data-sources/"?: DataSourcesPropertyValue;
  "https://hash.ai/@h/types/property-type/flow-definition-id/": FlowDefinitionIDPropertyValue;
  "https://hash.ai/@h/types/property-type/flow-type/": FlowTypePropertyValue;
  "https://hash.ai/@h/types/property-type/pause-on-failure/"?: PauseOnFailurePropertyValue;
  "https://hash.ai/@h/types/property-type/schedule-catchup-window/"?: ScheduleCatchupWindowPropertyValue;
  "https://hash.ai/@h/types/property-type/schedule-overlap-policy/": ScheduleOverlapPolicyPropertyValue;
  "https://hash.ai/@h/types/property-type/schedule-pause-state/"?: SchedulePauseStatePropertyValue;
  "https://hash.ai/@h/types/property-type/schedule-spec/": ScheduleSpecPropertyValue;
  "https://hash.ai/@h/types/property-type/schedule-status/": ScheduleStatusPropertyValue;
  "https://hash.ai/@h/types/property-type/trigger/": TriggerPropertyValue;
};

export type FlowSchedulePropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/data-sources/"?: DataSourcesPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/flow-definition-id/": FlowDefinitionIDPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/flow-type/": FlowTypePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/pause-on-failure/"?: PauseOnFailurePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/schedule-catchup-window/"?: ScheduleCatchupWindowPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/schedule-overlap-policy/": ScheduleOverlapPolicyPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/schedule-pause-state/"?: SchedulePauseStatePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/schedule-spec/": ScheduleSpecPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/schedule-status/": ScheduleStatusPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/trigger/": TriggerPropertyValueWithMetadata;
  };
};

export type FlowScheduleUsesLink = {
  linkEntity: Uses;
  rightEntity: FlowDefinition;
};

/**
 * The type of a flow, determining which task queue it runs on.
 */
export type FlowTypeDataType = "ai" | "integration";

export type FlowTypeDataTypeWithMetadata = {
  value: FlowTypeDataType;
  metadata: FlowTypeDataTypeMetadata;
};
export type FlowTypeDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/flow-type/v/1";
};

/**
 * The type of a flow, determining which task queue it runs on.
 */
export type FlowTypePropertyValue = FlowTypeDataType;

export type FlowTypePropertyValueWithMetadata = FlowTypeDataTypeWithMetadata;

/**
 * The fractional index indicating the current position of something.
 */
export type FractionalIndexPropertyValue = TextDataType;

export type FractionalIndexPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A natural language description of the objective of something.
 */
export type GoalPropertyValue = TextDataType;

export type GoalPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The position and dimensions of an item within a grid layout.
 */
export type GridPositionPropertyValue = ObjectDataType;

export type GridPositionPropertyValueWithMetadata = ObjectDataTypeWithMetadata;

/**
 * Something that something has
 */
export type Has = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/has/v/1"];
  properties: HasProperties;
  propertiesWithMetadata: HasPropertiesWithMetadata;
};

/**
 * The avatar something has.
 */
export type HasAvatar = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/has-avatar/v/1"];
  properties: HasAvatarProperties;
  propertiesWithMetadata: HasAvatarPropertiesWithMetadata;
};

export type HasAvatarOutgoingLinkAndTarget = never;

export type HasAvatarOutgoingLinksByLinkEntityTypeId = {};

/**
 * The avatar something has.
 */
export type HasAvatarProperties = LinkProperties & {};

export type HasAvatarPropertiesWithMetadata = LinkPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * The biography something has.
 */
export type HasBio = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/has-bio/v/1"];
  properties: HasBioProperties;
  propertiesWithMetadata: HasBioPropertiesWithMetadata;
};

export type HasBioOutgoingLinkAndTarget = never;

export type HasBioOutgoingLinksByLinkEntityTypeId = {};

/**
 * The biography something has.
 */
export type HasBioProperties = LinkProperties & {};

export type HasBioPropertiesWithMetadata = LinkPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * The cover image something has.
 */
export type HasCoverImage = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/has-cover-image/v/1"];
  properties: HasCoverImageProperties;
  propertiesWithMetadata: HasCoverImagePropertiesWithMetadata;
};

export type HasCoverImageOutgoingLinkAndTarget = never;

export type HasCoverImageOutgoingLinksByLinkEntityTypeId = {};

/**
 * The cover image something has.
 */
export type HasCoverImageProperties = LinkProperties & {};

export type HasCoverImagePropertiesWithMetadata = LinkPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * The data that something has.
 */
export type HasData = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/has-data/v/1"];
  properties: HasDataProperties;
  propertiesWithMetadata: HasDataPropertiesWithMetadata;
};

export type HasDataOutgoingLinkAndTarget = never;

export type HasDataOutgoingLinksByLinkEntityTypeId = {};

/**
 * The data that something has.
 */
export type HasDataProperties = LinkProperties & {};

export type HasDataPropertiesWithMetadata = LinkPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * Something contained at an index by something
 */
export type HasIndexedContent = {
  entityTypeIds: [
    "https://hash.ai/@h/types/entity-type/has-indexed-content/v/1",
  ];
  properties: HasIndexedContentProperties;
  propertiesWithMetadata: HasIndexedContentPropertiesWithMetadata;
};

export type HasIndexedContentOutgoingLinkAndTarget = never;

export type HasIndexedContentOutgoingLinksByLinkEntityTypeId = {};

/**
 * Something contained at an index by something
 */
export type HasIndexedContentProperties = LinkProperties & {
  "https://hash.ai/@h/types/property-type/fractional-index/": FractionalIndexPropertyValue;
};

export type HasIndexedContentPropertiesWithMetadata =
  LinkPropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {
      "https://hash.ai/@h/types/property-type/fractional-index/": FractionalIndexPropertyValueWithMetadata;
    };
  };

/**
 * An invitation that something has issued.
 */
export type HasIssuedInvitation = {
  entityTypeIds: [
    "https://hash.ai/@h/types/entity-type/has-issued-invitation/v/1",
  ];
  properties: HasIssuedInvitationProperties;
  propertiesWithMetadata: HasIssuedInvitationPropertiesWithMetadata;
};

export type HasIssuedInvitationOutgoingLinkAndTarget = never;

export type HasIssuedInvitationOutgoingLinksByLinkEntityTypeId = {};

/**
 * An invitation that something has issued.
 */
export type HasIssuedInvitationProperties = LinkProperties & {};

export type HasIssuedInvitationPropertiesWithMetadata =
  LinkPropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {};
  };

export type HasOutgoingLinkAndTarget = never;

export type HasOutgoingLinksByLinkEntityTypeId = {};

/**
 * The parent something has.
 */
export type HasParent = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/has-parent/v/1"];
  properties: HasParentProperties;
  propertiesWithMetadata: HasParentPropertiesWithMetadata;
};

export type HasParentOutgoingLinkAndTarget = never;

export type HasParentOutgoingLinksByLinkEntityTypeId = {};

/**
 * The parent something has.
 */
export type HasParentProperties = LinkProperties & {};

export type HasParentPropertiesWithMetadata = LinkPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * Something that something has
 */
export type HasProperties = LinkProperties & {};

export type HasPropertiesWithMetadata = LinkPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * The service account something has.
 */
export type HasServiceAccount = {
  entityTypeIds: [
    "https://hash.ai/@h/types/entity-type/has-service-account/v/1",
  ];
  properties: HasServiceAccountProperties;
  propertiesWithMetadata: HasServiceAccountPropertiesWithMetadata;
};

export type HasServiceAccountOutgoingLinkAndTarget = never;

export type HasServiceAccountOutgoingLinksByLinkEntityTypeId = {};

/**
 * The service account something has.
 */
export type HasServiceAccountProperties = LinkProperties & {};

export type HasServiceAccountPropertiesWithMetadata =
  LinkPropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {};
  };

/**
 * The text something has.
 */
export type HasText = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/has-text/v/1"];
  properties: HasTextProperties;
  propertiesWithMetadata: HasTextPropertiesWithMetadata;
};

export type HasTextOutgoingLinkAndTarget = never;

export type HasTextOutgoingLinksByLinkEntityTypeId = {};

/**
 * The text something has.
 */
export type HasTextProperties = LinkProperties & {};

export type HasTextPropertiesWithMetadata = LinkPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * A code assigned by the International Air Transport Association (IATA) to identify airports, airlines, or aircraft types.
 */
export type IATACodePropertyValue = TextDataType;

export type IATACodePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A code assigned by the International Civil Aviation Organization (ICAO) to identify airports, airlines, or aircraft types.
 */
export type ICAOCodePropertyValue = TextDataType;

export type ICAOCodePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * An emoji icon.
 */
export type IconPropertyValue = TextDataType;

export type IconPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * An image file hosted at a URL
 */
export type ImageFile = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/image-file/v/2"];
  properties: ImageFileProperties;
  propertiesWithMetadata: ImageFilePropertiesWithMetadata;
};

export type ImageFileOutgoingLinkAndTarget = never;

export type ImageFileOutgoingLinksByLinkEntityTypeId = {};

/**
 * An image file hosted at a URL
 */
export type ImageFileProperties = FileProperties & {};

export type ImageFilePropertiesWithMetadata = FilePropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * A measure of information content.
 */
export type InformationDataType = NumberDataType;

export type InformationDataTypeWithMetadata = {
  value: InformationDataType;
  metadata: InformationDataTypeMetadata;
};
export type InformationDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/information/v/1";
};

/**
 * The cost of an input unit
 */
export type InputUnitCostPropertyValue = NumberDataType;

export type InputUnitCostPropertyValueWithMetadata = NumberDataTypeWithMetadata;

/**
 * An organization dedicated to a specific purpose, such as education, research, or public service, and structured with formal systems of governance and operation.
 */
export type Institution = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/institution/v/1"];
  properties: InstitutionProperties;
  propertiesWithMetadata: InstitutionPropertiesWithMetadata;
};

export type InstitutionOutgoingLinkAndTarget = never;

export type InstitutionOutgoingLinksByLinkEntityTypeId = {};

/**
 * An organization dedicated to a specific purpose, such as education, research, or public service, and structured with formal systems of governance and operation.
 */
export type InstitutionProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValue;
};

export type InstitutionPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValueWithMetadata;
    "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValueWithMetadata;
  };
};

/**
 * The number zero (0), a positive natural number (e.g. 1, 2, 3), or the negation of a positive natural number (e.g. -1, -2, -3).
 */
export type IntegerDataType = NumberDataType;

export type IntegerDataTypeWithMetadata = {
  value: IntegerDataType;
  metadata: IntegerDataTypeMetadata;
};
export type IntegerDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/integer/v/1";
};

/**
 * An integration with a third-party service.
 */
export type Integration = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/integration/v/1"];
  properties: IntegrationProperties;
  propertiesWithMetadata: IntegrationPropertiesWithMetadata;
};

export type IntegrationOutgoingLinkAndTarget = never;

export type IntegrationOutgoingLinksByLinkEntityTypeId = {};

/**
 * An integration with a third-party service.
 */
export type IntegrationProperties = {};

export type IntegrationPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * A request or offer to join or attend something.
 */
export type Invitation = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/invitation/v/1"];
  properties: InvitationProperties;
  propertiesWithMetadata: InvitationPropertiesWithMetadata;
};

export type InvitationOutgoingLinkAndTarget = never;

export type InvitationOutgoingLinksByLinkEntityTypeId = {};

/**
 * A request or offer to join or attend something.
 */
export type InvitationProperties = {
  "https://hash.ai/@h/types/property-type/expired-at/": ExpiredAtPropertyValue;
};

export type InvitationPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/expired-at/": ExpiredAtPropertyValueWithMetadata;
  };
};

/**
 * An invitation issued to an email address.
 */
export type InvitationViaEmail = {
  entityTypeIds: [
    "https://hash.ai/@h/types/entity-type/invitation-via-email/v/1",
  ];
  properties: InvitationViaEmailProperties;
  propertiesWithMetadata: InvitationViaEmailPropertiesWithMetadata;
};

export type InvitationViaEmailOutgoingLinkAndTarget = never;

export type InvitationViaEmailOutgoingLinksByLinkEntityTypeId = {};

/**
 * An invitation issued to an email address.
 */
export type InvitationViaEmailProperties = InvitationProperties & {
  "https://hash.ai/@h/types/property-type/email/": EmailPropertyValue;
};

export type InvitationViaEmailPropertiesWithMetadata =
  InvitationPropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {
      "https://hash.ai/@h/types/property-type/email/": EmailPropertyValueWithMetadata;
    };
  };

/**
 * An invitation issued to a user via their shortname.
 */
export type InvitationViaShortname = {
  entityTypeIds: [
    "https://hash.ai/@h/types/entity-type/invitation-via-shortname/v/1",
  ];
  properties: InvitationViaShortnameProperties;
  propertiesWithMetadata: InvitationViaShortnamePropertiesWithMetadata;
};

export type InvitationViaShortnameOutgoingLinkAndTarget = never;

export type InvitationViaShortnameOutgoingLinksByLinkEntityTypeId = {};

/**
 * An invitation issued to a user via their shortname.
 */
export type InvitationViaShortnameProperties = InvitationProperties & {
  "https://hash.ai/@h/types/property-type/shortname/": ShortnamePropertyValue;
};

export type InvitationViaShortnamePropertiesWithMetadata =
  InvitationPropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {
      "https://hash.ai/@h/types/property-type/shortname/": ShortnamePropertyValueWithMetadata;
    };
  };

/**
 * Something that someone or something is a member of.
 */
export type IsMemberOf = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/is-member-of/v/1"];
  properties: IsMemberOfProperties;
  propertiesWithMetadata: IsMemberOfPropertiesWithMetadata;
};

export type IsMemberOfOutgoingLinkAndTarget = never;

export type IsMemberOfOutgoingLinksByLinkEntityTypeId = {};

/**
 * Something that someone or something is a member of.
 */
export type IsMemberOfProperties = LinkProperties & {};

export type IsMemberOfPropertiesWithMetadata = LinkPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * An identifier for a record in Ory Kratos.
 */
export type KratosIdentityIdPropertyValue = TextDataType;

export type KratosIdentityIdPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * undefined
 */
export type Link = {
  entityTypeIds: [
    "https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1",
  ];
  properties: LinkProperties;
  propertiesWithMetadata: LinkPropertiesWithMetadata;
};

export type LinkOutgoingLinkAndTarget = never;

export type LinkOutgoingLinksByLinkEntityTypeId = {};

export type LinkProperties = {};

export type LinkPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * A location for something, expressed as a single string
 */
export type LocationPropertyValue = TextDataType;

export type LocationPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A MIME (Multipurpose Internet Mail Extensions) type.
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types
 */
export type MIMETypePropertyValue = TextDataType;

export type MIMETypePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Configuration for a manual entity inference feature
 */
export type ManualInferenceConfigurationPropertyValue = ObjectDataType;

export type ManualInferenceConfigurationPropertyValueWithMetadata =
  ObjectDataTypeWithMetadata;

/**
 * The procedure via which something was produced, analyzed, or otherwise approached.
 */
export type MethodologyPropertyValue = TextDataType;

export type MethodologyPropertyValueWithMetadata = TextDataTypeWithMetadata;

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
 * A word or set of words by which something is known, addressed, or referred to.
 */
export type NamePropertyValue = TextDataType;

export type NamePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A notification to a user.
 */
export type Notification = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/notification/v/1"];
  properties: NotificationProperties;
  propertiesWithMetadata: NotificationPropertiesWithMetadata;
};

export type NotificationOutgoingLinkAndTarget = never;

export type NotificationOutgoingLinksByLinkEntityTypeId = {};

/**
 * A notification to a user.
 */
export type NotificationProperties = {
  "https://hash.ai/@h/types/property-type/archived/"?: ArchivedPropertyValue;
  "https://hash.ai/@h/types/property-type/read-at/"?: ReadAtPropertyValue;
};

export type NotificationPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/archived/"?: ArchivedPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/read-at/"?: ReadAtPropertyValueWithMetadata;
  };
};

/**
 * An arithmetical value (in the Real number system)
 */
export type NumberDataType = number;

export type NumberDataTypeWithMetadata = {
  value: NumberDataType;
  metadata: NumberDataTypeMetadata;
};
export type NumberDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1";
};

/**
 * The total number of pages something has.
 */
export type NumberOfPagesPropertyValue = NumberDataType;

export type NumberOfPagesPropertyValueWithMetadata = NumberDataTypeWithMetadata;

/**
 * An opaque, untyped JSON object
 */
export type ObjectDataType = {};

export type ObjectDataTypeWithMetadata = {
  value: ObjectDataType;
  metadata: ObjectDataTypeMetadata;
};
export type ObjectDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1";
};

/**
 * A block that something occurred in.
 */
export type OccurredInBlock = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/occurred-in-block/v/1"];
  properties: OccurredInBlockProperties;
  propertiesWithMetadata: OccurredInBlockPropertiesWithMetadata;
};

export type OccurredInBlockOutgoingLinkAndTarget = never;

export type OccurredInBlockOutgoingLinksByLinkEntityTypeId = {};

/**
 * A block that something occurred in.
 */
export type OccurredInBlockProperties = LinkProperties & {};

export type OccurredInBlockPropertiesWithMetadata =
  LinkPropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {};
  };

/**
 * An entity that something occurred in.
 */
export type OccurredInEntity = {
  entityTypeIds: [
    "https://hash.ai/@h/types/entity-type/occurred-in-entity/v/2",
  ];
  properties: OccurredInEntityProperties;
  propertiesWithMetadata: OccurredInEntityPropertiesWithMetadata;
};

export type OccurredInEntityOutgoingLinkAndTarget = never;

export type OccurredInEntityOutgoingLinksByLinkEntityTypeId = {};

/**
 * An entity that something occurred in.
 */
export type OccurredInEntityProperties = LinkProperties & {
  "https://hash.ai/@h/types/property-type/entity-edition-id/"?: EntityEditionIdPropertyValue;
};

export type OccurredInEntityPropertiesWithMetadata =
  LinkPropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {
      "https://hash.ai/@h/types/property-type/entity-edition-id/"?: EntityEditionIdPropertyValueWithMetadata;
    };
  };

/**
 * An organization. Organizations are root-level objects that contain user accounts and teams.
 */
export type Organization = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/organization/v/3"];
  properties: OrganizationProperties;
  propertiesWithMetadata: OrganizationPropertiesWithMetadata;
};

export type OrganizationHasAvatarLink = {
  linkEntity: HasAvatar;
  rightEntity: ImageFile;
};

export type OrganizationHasBioLink = {
  linkEntity: HasBio;
  rightEntity: ProfileBio;
};

export type OrganizationHasCoverImageLink = {
  linkEntity: HasCoverImage;
  rightEntity: ImageFile;
};

export type OrganizationHasIssuedInvitationLink = {
  linkEntity: HasIssuedInvitation;
  rightEntity: InvitationViaEmail | InvitationViaShortname;
};

/**
 * The name of an organization.
 */
export type OrganizationNamePropertyValue = TextDataType;

export type OrganizationNamePropertyValueWithMetadata =
  TextDataTypeWithMetadata;

export type OrganizationOutgoingLinkAndTarget =
  | OrganizationHasAvatarLink
  | OrganizationHasBioLink
  | OrganizationHasCoverImageLink
  | OrganizationHasIssuedInvitationLink;

export type OrganizationOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@h/types/entity-type/has-avatar/v/1": OrganizationHasAvatarLink;
  "https://hash.ai/@h/types/entity-type/has-bio/v/1": OrganizationHasBioLink;
  "https://hash.ai/@h/types/entity-type/has-cover-image/v/1": OrganizationHasCoverImageLink;
  "https://hash.ai/@h/types/entity-type/has-issued-invitation/v/1": OrganizationHasIssuedInvitationLink;
};

/**
 * An organization. Organizations are root-level objects that contain user accounts and teams.
 */
export type OrganizationProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
  "https://hash.ai/@h/types/property-type/location/"?: LocationPropertyValue;
  "https://hash.ai/@h/types/property-type/organization-name/": OrganizationNamePropertyValue;
  /**
   * @maxItems 5
   */
  "https://hash.ai/@h/types/property-type/pinned-entity-type-base-url/"?:
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
  "https://hash.ai/@h/types/property-type/shortname/": ShortnamePropertyValue;
  "https://hash.ai/@h/types/property-type/website-url/"?: WebsiteURLPropertyValue;
};

export type OrganizationPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/location/"?: LocationPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/organization-name/": OrganizationNamePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/pinned-entity-type-base-url/"?: {
      value: PinnedEntityTypeBaseURLPropertyValueWithMetadata[];
      metadata?: ArrayMetadata;
    };
    "https://hash.ai/@h/types/property-type/shortname/": ShortnamePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/website-url/"?: WebsiteURLPropertyValueWithMetadata;
  };
};

/**
 * The original name of a file
 */
export type OriginalFileNamePropertyValue = TextDataType;

export type OriginalFileNamePropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * The original source of something
 */
export type OriginalSourcePropertyValue = TextDataType;

export type OriginalSourcePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The original URL something was hosted at
 */
export type OriginalURLPropertyValue = URIDataType;

export type OriginalURLPropertyValueWithMetadata = URIDataTypeWithMetadata;

/**
 * The output definitions of something.
 */
export type OutputDefinitionsPropertyValue = ObjectDataType[];

export type OutputDefinitionsPropertyValueWithMetadata = {
  value: ObjectDataTypeWithMetadata[];
  metadata?: ArrayMetadata;
};

/**
 * The cost of an output unit
 */
export type OutputUnitCostPropertyValue = NumberDataType;

export type OutputUnitCostPropertyValueWithMetadata =
  NumberDataTypeWithMetadata;

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
export type Page = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/page/v/1"];
  properties: PageProperties;
  propertiesWithMetadata: PagePropertiesWithMetadata;
};

export type PageHasParentLink = { linkEntity: HasParent; rightEntity: Page };

export type PageOutgoingLinkAndTarget = PageHasParentLink;

export type PageOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@h/types/entity-type/has-parent/v/1": PageHasParentLink;
};

/**
 * A page for displaying and potentially interacting with data.
 */
export type PageProperties = BlockCollectionProperties & {
  "https://hash.ai/@h/types/property-type/archived/"?: ArchivedPropertyValue;
  "https://hash.ai/@h/types/property-type/fractional-index/": FractionalIndexPropertyValue;
  "https://hash.ai/@h/types/property-type/icon/"?: IconPropertyValue;
  "https://hash.ai/@h/types/property-type/summary/"?: SummaryPropertyValue;
  "https://hash.ai/@h/types/property-type/title/": TitlePropertyValue;
};

export type PagePropertiesWithMetadata =
  BlockCollectionPropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {
      "https://hash.ai/@h/types/property-type/archived/"?: ArchivedPropertyValueWithMetadata;
      "https://hash.ai/@h/types/property-type/fractional-index/": FractionalIndexPropertyValueWithMetadata;
      "https://hash.ai/@h/types/property-type/icon/"?: IconPropertyValueWithMetadata;
      "https://hash.ai/@h/types/property-type/summary/"?: SummaryPropertyValueWithMetadata;
      "https://hash.ai/@h/types/property-type/title/": TitlePropertyValueWithMetadata;
    };
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
 * A human being
 */
export type Person = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/person/v/1"];
  properties: PersonProperties;
  propertiesWithMetadata: PersonPropertiesWithMetadata;
};

export type PersonAffiliatedWithLink = {
  linkEntity: AffiliatedWith;
  rightEntity: Institution;
};

export type PersonOutgoingLinkAndTarget = PersonAffiliatedWithLink;

export type PersonOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@h/types/entity-type/affiliated-with/v/1": PersonAffiliatedWithLink;
};

/**
 * A human being
 */
export type PersonProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValue;
  "https://hash.ai/@h/types/property-type/email/"?: EmailPropertyValue[];
};

export type PersonPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValueWithMetadata;
    "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/email/"?: {
      value: EmailPropertyValueWithMetadata[];
      metadata?: ArrayMetadata;
    };
  };
};

/**
 * The base URL of a pinned entity type.
 */
export type PinnedEntityTypeBaseURLPropertyValue = URIDataType;

export type PinnedEntityTypeBaseURLPropertyValueWithMetadata =
  URIDataTypeWithMetadata;

/**
 * Someone's preferred pronouns.
 */
export type PreferredPronounsPropertyValue = TextDataType;

export type PreferredPronounsPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * A presentation file.
 */
export type PresentationFile = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/presentation-file/v/1"];
  properties: PresentationFileProperties;
  propertiesWithMetadata: PresentationFilePropertiesWithMetadata;
};

export type PresentationFileOutgoingLinkAndTarget = never;

export type PresentationFileOutgoingLinksByLinkEntityTypeId = {};

/**
 * A presentation file.
 */
export type PresentationFileProperties = FileProperties & {
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/"?: TextualContentPropertyValue;
};

export type PresentationFilePropertiesWithMetadata =
  FilePropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {
      "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/"?: TextualContentPropertyValueWithMetadata;
    };
  };

/**
 * A biography for display on someone or something's profile.
 */
export type ProfileBio = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/profile-bio/v/1"];
  properties: ProfileBioProperties;
  propertiesWithMetadata: ProfileBioPropertiesWithMetadata;
};

export type ProfileBioHasIndexedContentLink = {
  linkEntity: HasIndexedContent;
  rightEntity: Block;
};

export type ProfileBioOutgoingLinkAndTarget = ProfileBioHasIndexedContentLink;

export type ProfileBioOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@h/types/entity-type/has-indexed-content/v/1": ProfileBioHasIndexedContentLink;
};

/**
 * A biography for display on someone or something's profile.
 */
export type ProfileBioProperties = BlockCollectionProperties & {};

export type ProfileBioPropertiesWithMetadata =
  BlockCollectionPropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {};
  };

/**
 * A URL to a profile
 */
export type ProfileURLPropertyValue = URIDataType;

export type ProfileURLPropertyValueWithMetadata = URIDataTypeWithMetadata;

/**
 * The year in which something was first published.
 */
export type PublicationYearPropertyValue = YearDataType;

export type PublicationYearPropertyValueWithMetadata = YearDataTypeWithMetadata;

/**
 * A script written in the Python programming language.
 */
export type PythonScriptPropertyValue = TextDataType;

export type PythonScriptPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The timestamp of when something was read.
 */
export type ReadAtPropertyValue = DateTimeDataType;

export type ReadAtPropertyValueWithMetadata = DateTimeDataTypeWithMetadata;

/**
 * A unique alphanumeric code assigned to an aircraft, also known as a tail number (e.g. 'N123AB').
 */
export type RegistrationNumberPropertyValue = TextDataType;

export type RegistrationNumberPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * Stringified timestamp of when something was resolved.
 */
export type ResolvedAtPropertyValue = DateTimeDataType;

export type ResolvedAtPropertyValueWithMetadata = DateTimeDataTypeWithMetadata;

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

/**
 * Something that was scheduled by something.
 */
export type ScheduledBy = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/scheduled-by/v/1"];
  properties: ScheduledByProperties;
  propertiesWithMetadata: ScheduledByPropertiesWithMetadata;
};

export type ScheduledByOutgoingLinkAndTarget = never;

export type ScheduledByOutgoingLinksByLinkEntityTypeId = {};

/**
 * Something that was scheduled by something.
 */
export type ScheduledByProperties = LinkProperties & {};

export type ScheduledByPropertiesWithMetadata = LinkPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * A service account.
 */
export type ServiceAccount = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/service-account/v/1"];
  properties: ServiceAccountProperties;
  propertiesWithMetadata: ServiceAccountPropertiesWithMetadata;
};

export type ServiceAccountOutgoingLinkAndTarget = never;

export type ServiceAccountOutgoingLinksByLinkEntityTypeId = {};

/**
 * A service account.
 */
export type ServiceAccountProperties = {
  "https://hash.ai/@h/types/property-type/profile-url/": ProfileURLPropertyValue;
};

export type ServiceAccountPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/profile-url/": ProfileURLPropertyValueWithMetadata;
  };
};

/**
 * A feature of a service
 */
export type ServiceFeature = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/service-feature/v/1"];
  properties: ServiceFeatureProperties;
  propertiesWithMetadata: ServiceFeaturePropertiesWithMetadata;
};

export type ServiceFeatureOutgoingLinkAndTarget = never;

export type ServiceFeatureOutgoingLinksByLinkEntityTypeId = {};

/**
 * A feature of a service
 */
export type ServiceFeatureProperties = {
  "https://hash.ai/@h/types/property-type/feature-name/": FeatureNamePropertyValue;
  "https://hash.ai/@h/types/property-type/service-name/": ServiceNamePropertyValue;
  "https://hash.ai/@h/types/property-type/service-unit-cost/"?: ServiceUnitCostPropertyValue[];
};

export type ServiceFeaturePropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/feature-name/": FeatureNamePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/service-name/": ServiceNamePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/service-unit-cost/"?: {
      value: ServiceUnitCostPropertyValueWithMetadata[];
      metadata?: ArrayMetadata;
    };
  };
};

/**
 * The name of a service
 */
export type ServiceNamePropertyValue = TextDataType;

export type ServiceNamePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The unit cost of a service
 */
export type ServiceUnitCostPropertyValue = {
  "https://hash.ai/@h/types/property-type/applies-from/": AppliesFromPropertyValue;
  "https://hash.ai/@h/types/property-type/applies-until/"?: AppliesUntilPropertyValue;
  "https://hash.ai/@h/types/property-type/input-unit-cost/"?: InputUnitCostPropertyValue;
  "https://hash.ai/@h/types/property-type/output-unit-cost/"?: OutputUnitCostPropertyValue;
};

export type ServiceUnitCostPropertyValueWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/applies-from/": AppliesFromPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/applies-until/"?: AppliesUntilPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/input-unit-cost/"?: InputUnitCostPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/output-unit-cost/"?: OutputUnitCostPropertyValueWithMetadata;
  };
};

/**
 * A unique identifier for something, in the form of a slug
 */
export type ShortnamePropertyValue = TextDataType;

export type ShortnamePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The step definitions of a flow.
 */
export type StepDefinitionsPropertyValue = ObjectDataType[];

export type StepDefinitionsPropertyValueWithMetadata = {
  value: ObjectDataTypeWithMetadata[];
  metadata?: ArrayMetadata;
};

/**
 * A step in a flow run.
 */
export type StepPropertyValue = ObjectDataType[];

export type StepPropertyValueWithMetadata = {
  value: ObjectDataTypeWithMetadata[];
  metadata?: ArrayMetadata;
};

/**
 * A HASH Graph API structural query.
 */
export type StructuralQueryPropertyValue = ObjectDataType;

export type StructuralQueryPropertyValueWithMetadata =
  ObjectDataTypeWithMetadata;

/**
 * The summary of the something.
 */
export type SummaryPropertyValue = TextDataType;

export type SummaryPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * An ordered sequence of characters.
 */
export type Text = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/text/v/1"];
  properties: TextProperties;
  propertiesWithMetadata: TextPropertiesWithMetadata;
};

/**
 * An ordered sequence of characters
 */
export type TextDataType = string;

export type TextDataTypeWithMetadata = {
  value: TextDataType;
  metadata: TextDataTypeMetadata;
};
export type TextDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1";
};

export type TextOutgoingLinkAndTarget = never;

export type TextOutgoingLinksByLinkEntityTypeId = {};

/**
 * An ordered sequence of characters.
 */
export type TextProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/": TextualContentPropertyValue;
};

export type TextPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/": TextualContentPropertyValueWithMetadata;
  };
};

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
 * A time zone identifier (e.g. 'America/Los_Angeles', 'Europe/London').
 */
export type TimezonePropertyValue = TextDataType;

export type TimezonePropertyValueWithMetadata = TextDataTypeWithMetadata;

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
 * The trigger definition of a flow.
 */
export type TriggerDefinitionPropertyValue = {
  "https://hash.ai/@h/types/property-type/output-definitions/"?: OutputDefinitionsPropertyValue;
  "https://hash.ai/@h/types/property-type/trigger-definition-id/": TriggerDefinitionIDPropertyValue;
};

export type TriggerDefinitionPropertyValueWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/output-definitions/"?: OutputDefinitionsPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/trigger-definition-id/": TriggerDefinitionIDPropertyValueWithMetadata;
  };
};

/**
 * The trigger of a flow.
 */
export type TriggerPropertyValue = {
  "https://hash.ai/@h/types/property-type/outputs/"?: OutputsPropertyValue;
  "https://hash.ai/@h/types/property-type/trigger-definition-id/": TriggerDefinitionIDPropertyValue;
};

export type TriggerPropertyValueWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/outputs/"?: OutputsPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/trigger-definition-id/": TriggerDefinitionIDPropertyValueWithMetadata;
  };
};

/**
 * A user that triggered something.
 */
export type TriggeredByUser = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/triggered-by-user/v/1"];
  properties: TriggeredByUserProperties;
  propertiesWithMetadata: TriggeredByUserPropertiesWithMetadata;
};

export type TriggeredByUserOutgoingLinkAndTarget = never;

export type TriggeredByUserOutgoingLinksByLinkEntityTypeId = {};

/**
 * A user that triggered something.
 */
export type TriggeredByUserProperties = LinkProperties & {};

export type TriggeredByUserPropertiesWithMetadata =
  LinkPropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {};
  };

/**
 * A unique identifier for a resource (e.g. a URL, or URN).
 */
export type URIDataType = TextDataType;

export type URIDataTypeWithMetadata = {
  value: URIDataType;
  metadata: URIDataTypeMetadata;
};
export type URIDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/uri/v/1";
};

/**
 * The timestamp when the upload of something has completed
 */
export type UploadCompletedAtPropertyValue = DateTimeDataType;

export type UploadCompletedAtPropertyValueWithMetadata =
  DateTimeDataTypeWithMetadata;

/**
 * A user of the HASH application.
 */
export type User = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/user/v/7"];
  properties: UserProperties;
  propertiesWithMetadata: UserPropertiesWithMetadata;
};

export type UserHasAvatarLink = {
  linkEntity: HasAvatar;
  rightEntity: ImageFile;
};

export type UserHasBioLink = { linkEntity: HasBio; rightEntity: ProfileBio };

export type UserHasCoverImageLink = {
  linkEntity: HasCoverImage;
  rightEntity: ImageFile;
};

export type UserHasLink = {
  linkEntity: Has;
  rightEntity: BrowserPluginSettings;
};

export type UserHasServiceAccountLink = {
  linkEntity: HasServiceAccount;
  rightEntity: ServiceAccount;
};

export type UserIsMemberOfLink = {
  linkEntity: IsMemberOf;
  rightEntity: Organization;
};

export type UserOutgoingLinkAndTarget =
  | UserHasAvatarLink
  | UserHasBioLink
  | UserHasCoverImageLink
  | UserHasServiceAccountLink
  | UserHasLink
  | UserIsMemberOfLink;

export type UserOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@h/types/entity-type/has-avatar/v/1": UserHasAvatarLink;
  "https://hash.ai/@h/types/entity-type/has-bio/v/1": UserHasBioLink;
  "https://hash.ai/@h/types/entity-type/has-cover-image/v/1": UserHasCoverImageLink;
  "https://hash.ai/@h/types/entity-type/has-service-account/v/1": UserHasServiceAccountLink;
  "https://hash.ai/@h/types/entity-type/has/v/1": UserHasLink;
  "https://hash.ai/@h/types/entity-type/is-member-of/v/1": UserIsMemberOfLink;
};

/**
 * A user of the HASH application.
 */
export type UserProperties = ActorProperties & {
  "https://hash.ai/@h/types/property-type/application-preferences/"?: ApplicationPreferencesPropertyValue;
  /**
   * @minItems 1
   */
  "https://hash.ai/@h/types/property-type/email/": [
    EmailPropertyValue,
    ...EmailPropertyValue[],
  ];
  "https://hash.ai/@h/types/property-type/enabled-feature-flags/"?: EnabledFeatureFlagsPropertyValue;
  "https://hash.ai/@h/types/property-type/kratos-identity-id/": KratosIdentityIdPropertyValue;
  "https://hash.ai/@h/types/property-type/location/"?: LocationPropertyValue;
  /**
   * @maxItems 5
   */
  "https://hash.ai/@h/types/property-type/pinned-entity-type-base-url/"?:
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
  "https://hash.ai/@h/types/property-type/preferred-pronouns/"?: PreferredPronounsPropertyValue;
  "https://hash.ai/@h/types/property-type/shortname/"?: ShortnamePropertyValue;
  "https://hash.ai/@h/types/property-type/website-url/"?: WebsiteURLPropertyValue;
};

export type UserPropertiesWithMetadata = ActorPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/application-preferences/"?: ApplicationPreferencesPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/email/": {
      value: EmailPropertyValueWithMetadata[];
      metadata?: ArrayMetadata;
    };
    "https://hash.ai/@h/types/property-type/enabled-feature-flags/"?: EnabledFeatureFlagsPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/kratos-identity-id/": KratosIdentityIdPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/location/"?: LocationPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/pinned-entity-type-base-url/"?: {
      value: PinnedEntityTypeBaseURLPropertyValueWithMetadata[];
      metadata?: ArrayMetadata;
    };
    "https://hash.ai/@h/types/property-type/preferred-pronouns/"?: PreferredPronounsPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/shortname/"?: ShortnamePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/website-url/"?: WebsiteURLPropertyValueWithMetadata;
  };
};

/**
 * A secret or credential belonging to a user.
 */
export type UserSecret = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/user-secret/v/1"];
  properties: UserSecretProperties;
  propertiesWithMetadata: UserSecretPropertiesWithMetadata;
};

export type UserSecretOutgoingLinkAndTarget = never;

export type UserSecretOutgoingLinksByLinkEntityTypeId = {};

/**
 * A secret or credential belonging to a user.
 */
export type UserSecretProperties = {
  "https://hash.ai/@h/types/property-type/connection-source-name/": ConnectionSourceNamePropertyValue;
  "https://hash.ai/@h/types/property-type/expired-at/": ExpiredAtPropertyValue;
  "https://hash.ai/@h/types/property-type/vault-path/": VaultPathPropertyValue;
};

export type UserSecretPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/connection-source-name/": ConnectionSourceNamePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/expired-at/": ExpiredAtPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/vault-path/": VaultPathPropertyValueWithMetadata;
  };
};

/**
 * Something that uses something else.
 */
export type Uses = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/uses/v/1"];
  properties: UsesProperties;
  propertiesWithMetadata: UsesPropertiesWithMetadata;
};

export type UsesOutgoingLinkAndTarget = never;

export type UsesOutgoingLinksByLinkEntityTypeId = {};

/**
 * Something that uses something else.
 */
export type UsesProperties = LinkProperties & {};

export type UsesPropertiesWithMetadata = LinkPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * The path to a secret in Hashicorp Vault.
 */
export type VaultPathPropertyValue = TextDataType;

export type VaultPathPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A URL for a website
 */
export type WebsiteURLPropertyValue = URIDataType;

export type WebsiteURLPropertyValueWithMetadata = URIDataTypeWithMetadata;

/**
 * An identifier for a workflow.
 */
export type WorkflowIDPropertyValue = TextDataType;

export type WorkflowIDPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A year in the Gregorian calendar.
 */
export type YearDataType = IntegerDataType;

export type YearDataTypeWithMetadata = {
  value: YearDataType;
  metadata: YearDataTypeMetadata;
};
export type YearDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/year/v/1";
};
