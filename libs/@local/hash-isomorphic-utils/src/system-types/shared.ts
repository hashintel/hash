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
 * An amount denominated in UAE Dirham (ISO 4217 AED).
 */
export type AEDDataType = CurrencyDataType;

export type AEDDataTypeWithMetadata = {
  value: AEDDataType;
  metadata: AEDDataTypeMetadata;
};
export type AEDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/aed/v/1";
};

/**
 * An amount denominated in Afghani (ISO 4217 AFN).
 */
export type AFNDataType = CurrencyDataType;

export type AFNDataTypeWithMetadata = {
  value: AFNDataType;
  metadata: AFNDataTypeMetadata;
};
export type AFNDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/afn/v/1";
};

/**
 * An amount denominated in Lek (ISO 4217 ALL).
 */
export type ALLDataType = CurrencyDataType;

export type ALLDataTypeWithMetadata = {
  value: ALLDataType;
  metadata: ALLDataTypeMetadata;
};
export type ALLDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/all/v/1";
};

/**
 * An amount denominated in Armenian Dram (ISO 4217 AMD).
 */
export type AMDDataType = CurrencyDataType;

export type AMDDataTypeWithMetadata = {
  value: AMDDataType;
  metadata: AMDDataTypeMetadata;
};
export type AMDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/amd/v/1";
};

/**
 * An amount denominated in Netherlands Antillean Guilder (ISO 4217 ANG).
 */
export type ANGDataType = CurrencyDataType;

export type ANGDataTypeWithMetadata = {
  value: ANGDataType;
  metadata: ANGDataTypeMetadata;
};
export type ANGDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/ang/v/1";
};

/**
 * An amount denominated in Kwanza (ISO 4217 AOA).
 */
export type AOADataType = CurrencyDataType;

export type AOADataTypeWithMetadata = {
  value: AOADataType;
  metadata: AOADataTypeMetadata;
};
export type AOADataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/aoa/v/1";
};

/**
 * An amount denominated in Argentine Peso (ISO 4217 ARS).
 */
export type ARSDataType = CurrencyDataType;

export type ARSDataTypeWithMetadata = {
  value: ARSDataType;
  metadata: ARSDataTypeMetadata;
};
export type ARSDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/ars/v/1";
};

/**
 * An amount denominated in Australian Dollar (ISO 4217 AUD).
 */
export type AUDDataType = CurrencyDataType;

export type AUDDataTypeWithMetadata = {
  value: AUDDataType;
  metadata: AUDDataTypeMetadata;
};
export type AUDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/aud/v/1";
};

/**
 * An amount denominated in Aruban Florin (ISO 4217 AWG).
 */
export type AWGDataType = CurrencyDataType;

export type AWGDataTypeWithMetadata = {
  value: AWGDataType;
  metadata: AWGDataTypeMetadata;
};
export type AWGDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/awg/v/1";
};

/**
 * An amount denominated in Azerbaijan Manat (ISO 4217 AZN).
 */
export type AZNDataType = CurrencyDataType;

export type AZNDataTypeWithMetadata = {
  value: AZNDataType;
  metadata: AZNDataTypeMetadata;
};
export type AZNDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/azn/v/1";
};

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
 * The date on which an activity actually finished.
 */
export type ActualFinishDatePropertyValue = DateDataType;

export type ActualFinishDatePropertyValueWithMetadata =
  DateDataTypeWithMetadata;

/**
 * The actual date on which goods were issued.
 */
export type ActualGoodsIssueDatePropertyValue = DateDataType;

export type ActualGoodsIssueDatePropertyValueWithMetadata =
  DateDataTypeWithMetadata;

/**
 * The date on which an activity actually started.
 */
export type ActualStartDatePropertyValue = DateDataType;

export type ActualStartDatePropertyValueWithMetadata = DateDataTypeWithMetadata;

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
 * The alternative bill of materials identifier.
 */
export type AlternativeBOMPropertyValue = TextDataType;

export type AlternativeBOMPropertyValueWithMetadata = TextDataTypeWithMetadata;

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
 * A measure of the extent of a two-dimensional surface.
 */
export type AreaDataType = NumberDataType;

export type AreaDataTypeWithMetadata = {
  value: AreaDataType;
  metadata: AreaDataTypeMetadata;
};
export type AreaDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/area/v/1";
};

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
 * An amount denominated in Convertible Mark (ISO 4217 BAM).
 */
export type BAMDataType = CurrencyDataType;

export type BAMDataTypeWithMetadata = {
  value: BAMDataType;
  metadata: BAMDataTypeMetadata;
};
export type BAMDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/bam/v/1";
};

/**
 * An amount denominated in Barbados Dollar (ISO 4217 BBD).
 */
export type BBDDataType = CurrencyDataType;

export type BBDDataTypeWithMetadata = {
  value: BBDDataType;
  metadata: BBDDataTypeMetadata;
};
export type BBDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/bbd/v/1";
};

/**
 * An amount denominated in Taka (ISO 4217 BDT).
 */
export type BDTDataType = CurrencyDataType;

export type BDTDataTypeWithMetadata = {
  value: BDTDataType;
  metadata: BDTDataTypeMetadata;
};
export type BDTDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/bdt/v/1";
};

/**
 * An amount denominated in Bulgarian Lev (ISO 4217 BGN).
 */
export type BGNDataType = CurrencyDataType;

export type BGNDataTypeWithMetadata = {
  value: BGNDataType;
  metadata: BGNDataTypeMetadata;
};
export type BGNDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/bgn/v/1";
};

/**
 * An amount denominated in Bahraini Dinar (ISO 4217 BHD).
 */
export type BHDDataType = CurrencyDataType;

export type BHDDataTypeWithMetadata = {
  value: BHDDataType;
  metadata: BHDDataTypeMetadata;
};
export type BHDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/bhd/v/1";
};

/**
 * An amount denominated in Burundi Franc (ISO 4217 BIF).
 */
export type BIFDataType = CurrencyDataType;

export type BIFDataTypeWithMetadata = {
  value: BIFDataType;
  metadata: BIFDataTypeMetadata;
};
export type BIFDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/bif/v/1";
};

/**
 * An amount denominated in Bermudian Dollar (ISO 4217 BMD).
 */
export type BMDDataType = CurrencyDataType;

export type BMDDataTypeWithMetadata = {
  value: BMDDataType;
  metadata: BMDDataTypeMetadata;
};
export type BMDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/bmd/v/1";
};

/**
 * An amount denominated in Brunei Dollar (ISO 4217 BND).
 */
export type BNDDataType = CurrencyDataType;

export type BNDDataTypeWithMetadata = {
  value: BNDDataType;
  metadata: BNDDataTypeMetadata;
};
export type BNDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/bnd/v/1";
};

/**
 * An amount denominated in Boliviano (ISO 4217 BOB).
 */
export type BOBDataType = CurrencyDataType;

export type BOBDataTypeWithMetadata = {
  value: BOBDataType;
  metadata: BOBDataTypeMetadata;
};
export type BOBDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/bob/v/1";
};

/**
 * An amount denominated in Brazilian Real (ISO 4217 BRL).
 */
export type BRLDataType = CurrencyDataType;

export type BRLDataTypeWithMetadata = {
  value: BRLDataType;
  metadata: BRLDataTypeMetadata;
};
export type BRLDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/brl/v/1";
};

/**
 * An amount denominated in Bahamian Dollar (ISO 4217 BSD).
 */
export type BSDDataType = CurrencyDataType;

export type BSDDataTypeWithMetadata = {
  value: BSDDataType;
  metadata: BSDDataTypeMetadata;
};
export type BSDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/bsd/v/1";
};

/**
 * An amount denominated in Ngultrum (ISO 4217 BTN).
 */
export type BTNDataType = CurrencyDataType;

export type BTNDataTypeWithMetadata = {
  value: BTNDataType;
  metadata: BTNDataTypeMetadata;
};
export type BTNDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/btn/v/1";
};

/**
 * An amount denominated in Pula (ISO 4217 BWP).
 */
export type BWPDataType = CurrencyDataType;

export type BWPDataTypeWithMetadata = {
  value: BWPDataType;
  metadata: BWPDataTypeMetadata;
};
export type BWPDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/bwp/v/1";
};

/**
 * An amount denominated in Belarusian Ruble (ISO 4217 BYN).
 */
export type BYNDataType = CurrencyDataType;

export type BYNDataTypeWithMetadata = {
  value: BYNDataType;
  metadata: BYNDataTypeMetadata;
};
export type BYNDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/byn/v/1";
};

/**
 * An amount denominated in Belize Dollar (ISO 4217 BZD).
 */
export type BZDDataType = CurrencyDataType;

export type BZDDataTypeWithMetadata = {
  value: BZDDataType;
  metadata: BZDDataTypeMetadata;
};
export type BZDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/bzd/v/1";
};

/**
 * A specific lot of a material, tracked through production, storage, and movement.
 */
export type Batch = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/batch/v/1"];
  properties: BatchProperties;
  propertiesWithMetadata: BatchPropertiesWithMetadata;
};

/**
 * A batch or lot identifier used for tracking goods.
 */
export type BatchNumberPropertyValue = TextDataType;

export type BatchNumberPropertyValueWithMetadata = TextDataTypeWithMetadata;

export type BatchOfMaterialLink = {
  linkEntity: OfMaterial;
  rightEntity: Material;
};

export type BatchOutgoingLinkAndTarget = BatchOfMaterialLink;

export type BatchOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@h/types/entity-type/of-material/v/1": BatchOfMaterialLink;
};

/**
 * A specific lot of a material, tracked through production, storage, and movement.
 */
export type BatchProperties = {
  "https://hash.ai/@h/types/property-type/batch-number/"?: BatchNumberPropertyValue;
  "https://hash.ai/@h/types/property-type/expiry-date/"?: ExpiryDatePropertyValue;
  "https://hash.ai/@h/types/property-type/stock-quantity/"?: StockQuantityPropertyValue;
  "https://hash.ai/@h/types/property-type/unit-of-measure/"?: UnitOfMeasurePropertyValue;
};

export type BatchPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/batch-number/"?: BatchNumberPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/expiry-date/"?: ExpiryDatePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/stock-quantity/"?: StockQuantityPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/unit-of-measure/"?: UnitOfMeasurePropertyValueWithMetadata;
  };
};

/**
 * A component line within a bill of materials.
 */
export type BillOfMaterialsItem = {
  entityTypeIds: [
    "https://hash.ai/@h/types/entity-type/bill-of-materials-item/v/1",
  ];
  properties: BillOfMaterialsItemProperties;
  propertiesWithMetadata: BillOfMaterialsItemPropertiesWithMetadata;
};

export type BillOfMaterialsItemHasMaterialLink = {
  linkEntity: HasMaterial;
  rightEntity: Material;
};

export type BillOfMaterialsItemOutgoingLinkAndTarget =
  BillOfMaterialsItemHasMaterialLink;

export type BillOfMaterialsItemOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@h/types/entity-type/has-material/v/1": BillOfMaterialsItemHasMaterialLink;
};

/**
 * A component line within a bill of materials.
 */
export type BillOfMaterialsItemProperties = {
  "https://hash.ai/@h/types/property-type/component-quantity/"?: ComponentQuantityPropertyValue;
  "https://hash.ai/@h/types/property-type/deletion-indicator/"?: DeletionIndicatorPropertyValue;
  "https://hash.ai/@h/types/property-type/fixed-quantity-indicator/"?: FixedQuantityIndicatorPropertyValue;
  "https://hash.ai/@h/types/property-type/item-category/"?: ItemCategoryPropertyValue;
  "https://hash.ai/@h/types/property-type/item-number/"?: ItemNumberPropertyValue;
  "https://hash.ai/@h/types/property-type/scrap-percentage/"?: ScrapPercentagePropertyValue;
  "https://hash.ai/@h/types/property-type/unit-of-measure/"?: UnitOfMeasurePropertyValue;
  "https://hash.ai/@h/types/property-type/valid-from-date/"?: ValidFromDatePropertyValue;
};

export type BillOfMaterialsItemPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/component-quantity/"?: ComponentQuantityPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/deletion-indicator/"?: DeletionIndicatorPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/fixed-quantity-indicator/"?: FixedQuantityIndicatorPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/item-category/"?: ItemCategoryPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/item-number/"?: ItemNumberPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/scrap-percentage/"?: ScrapPercentagePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/unit-of-measure/"?: UnitOfMeasurePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/valid-from-date/"?: ValidFromDatePropertyValueWithMetadata;
  };
};

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
 * An amount denominated in Canadian Dollar (ISO 4217 CAD).
 */
export type CADDataType = CurrencyDataType;

export type CADDataTypeWithMetadata = {
  value: CADDataType;
  metadata: CADDataTypeMetadata;
};
export type CADDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/cad/v/1";
};

/**
 * An amount denominated in Congolese Franc (ISO 4217 CDF).
 */
export type CDFDataType = CurrencyDataType;

export type CDFDataTypeWithMetadata = {
  value: CDFDataType;
  metadata: CDFDataTypeMetadata;
};
export type CDFDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/cdf/v/1";
};

/**
 * An amount denominated in Swiss Franc (ISO 4217 CHF).
 */
export type CHFDataType = CurrencyDataType;

export type CHFDataTypeWithMetadata = {
  value: CHFDataType;
  metadata: CHFDataTypeMetadata;
};
export type CHFDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/chf/v/1";
};

/**
 * An amount denominated in Chilean Peso (ISO 4217 CLP).
 */
export type CLPDataType = CurrencyDataType;

export type CLPDataTypeWithMetadata = {
  value: CLPDataType;
  metadata: CLPDataTypeMetadata;
};
export type CLPDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/clp/v/1";
};

/**
 * An amount denominated in Yuan Renminbi (ISO 4217 CNY).
 */
export type CNYDataType = CurrencyDataType;

export type CNYDataTypeWithMetadata = {
  value: CNYDataType;
  metadata: CNYDataTypeMetadata;
};
export type CNYDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/cny/v/1";
};

/**
 * An amount denominated in Colombian Peso (ISO 4217 COP).
 */
export type COPDataType = CurrencyDataType;

export type COPDataTypeWithMetadata = {
  value: COPDataType;
  metadata: COPDataTypeMetadata;
};
export type COPDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/cop/v/1";
};

/**
 * An amount denominated in Costa Rican Colon (ISO 4217 CRC).
 */
export type CRCDataType = CurrencyDataType;

export type CRCDataTypeWithMetadata = {
  value: CRCDataType;
  metadata: CRCDataTypeMetadata;
};
export type CRCDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/crc/v/1";
};

/**
 * An amount denominated in Cuban Peso (ISO 4217 CUP).
 */
export type CUPDataType = CurrencyDataType;

export type CUPDataTypeWithMetadata = {
  value: CUPDataType;
  metadata: CUPDataTypeMetadata;
};
export type CUPDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/cup/v/1";
};

/**
 * An amount denominated in Cabo Verde Escudo (ISO 4217 CVE).
 */
export type CVEDataType = CurrencyDataType;

export type CVEDataTypeWithMetadata = {
  value: CVEDataType;
  metadata: CVEDataTypeMetadata;
};
export type CVEDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/cve/v/1";
};

/**
 * An amount denominated in Czech Koruna (ISO 4217 CZK).
 */
export type CZKDataType = CurrencyDataType;

export type CZKDataTypeWithMetadata = {
  value: CZKDataType;
  metadata: CZKDataTypeMetadata;
};
export type CZKDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/czk/v/1";
};

/**
 * A year in the Gregorian calendar.
 */
export type CalendarYearDataType = IntegerDataType;

export type CalendarYearDataTypeWithMetadata = {
  value: CalendarYearDataType;
  metadata: CalendarYearDataTypeMetadata;
};
export type CalendarYearDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/calendar-year/v/1";
};

/**
 * A unit of length in the International System of Units (SI), equal to one hundredth of a meter.
 */
export type CentimetersDataType = MetricLengthSIDataType;

export type CentimetersDataTypeWithMetadata = {
  value: CentimetersDataType;
  metadata: CentimetersDataTypeMetadata;
};
export type CentimetersDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/centimeters/v/1";
};

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
 * A business or legal entity engaged in commercial activity, such as a customer or vendor.
 */
export type Company = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/company/v/1"];
  properties: CompanyProperties;
  propertiesWithMetadata: CompanyPropertiesWithMetadata;
};

/**
 * The account or registration number of a company.
 */
export type CompanyNumberPropertyValue = TextDataType;

export type CompanyNumberPropertyValueWithMetadata = TextDataTypeWithMetadata;

export type CompanyOutgoingLinkAndTarget = never;

export type CompanyOutgoingLinksByLinkEntityTypeId = {};

/**
 * A business or legal entity engaged in commercial activity, such as a customer or vendor.
 */
export type CompanyProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValue;
  "https://hash.ai/@h/types/property-type/company-number/"?: CompanyNumberPropertyValue;
};

export type CompanyPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValueWithMetadata;
    "https://blockprotocol.org/@blockprotocol/types/property-type/name/": NamePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/company-number/"?: CompanyNumberPropertyValueWithMetadata;
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
 * The quantity of a component required by a bill of materials.
 */
export type ComponentQuantityPropertyValue = KilogramsDataType;

export type ComponentQuantityPropertyValueWithMetadata =
  KilogramsDataTypeWithMetadata;

/**
 * The name of the connection source.
 */
export type ConnectionSourceNamePropertyValue = TextDataType;

export type ConnectionSourceNamePropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * The country in which something is located, or to which it belongs.
 */
export type CountryPropertyValue = TextDataType;

export type CountryPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * An imperial unit of volume equal to approximately 28.317 litres.
 */
export type CubicFeetDataType = VolumeDataType;

export type CubicFeetDataTypeWithMetadata = {
  value: CubicFeetDataType;
  metadata: CubicFeetDataTypeMetadata;
};
export type CubicFeetDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/cubic-feet/v/1";
};

/**
 * A metric unit of volume equal to 1000 litres.
 */
export type CubicMetresDataType = VolumeDataType;

export type CubicMetresDataTypeWithMetadata = {
  value: CubicMetresDataType;
  metadata: CubicMetresDataTypeMetadata;
};
export type CubicMetresDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/cubic-metres/v/1";
};

/**
 * An ISO 4217 currency code identifying the currency of monetary values.
 */
export type CurrencyCodePropertyValue = TextDataType;

export type CurrencyCodePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A system of money in common use within a specific environment over time, especially for people in a nation state.
 */
export type CurrencyDataType = NumberDataType;

export type CurrencyDataTypeWithMetadata = {
  value: CurrencyDataType;
  metadata: CurrencyDataTypeMetadata;
};
export type CurrencyDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/currency/v/1";
};

/**
 * An organisation or individual that purchases goods or services.
 */
export type Customer = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/customer/v/1"];
  properties: CustomerProperties;
  propertiesWithMetadata: CustomerPropertiesWithMetadata;
};

/**
 * The customer account number.
 */
export type CustomerNumberPropertyValue = TextDataType;

export type CustomerNumberPropertyValueWithMetadata = TextDataTypeWithMetadata;

export type CustomerOutgoingLinkAndTarget = never;

export type CustomerOutgoingLinksByLinkEntityTypeId = {};

/**
 * An organisation or individual that purchases goods or services.
 */
export type CustomerProperties = PersonProperties &
  CompanyProperties & {
    "https://hash.ai/@h/types/property-type/city/"?: CityPropertyValue;
    "https://hash.ai/@h/types/property-type/country/"?: CountryPropertyValue;
    "https://hash.ai/@h/types/property-type/customer-number/"?: CustomerNumberPropertyValue;
    "https://hash.ai/@h/types/property-type/industry/"?: IndustryPropertyValue;
    "https://hash.ai/@h/types/property-type/postal-code/"?: PostalCodePropertyValue;
    "https://hash.ai/@h/types/property-type/region/"?: RegionPropertyValue;
    "https://hash.ai/@h/types/property-type/street-address/"?: StreetAddressPropertyValue;
  };

export type CustomerPropertiesWithMetadata = PersonPropertiesWithMetadata &
  CompanyPropertiesWithMetadata & {
    metadata?: ObjectMetadata;
    value: {
      "https://hash.ai/@h/types/property-type/city/"?: CityPropertyValueWithMetadata;
      "https://hash.ai/@h/types/property-type/country/"?: CountryPropertyValueWithMetadata;
      "https://hash.ai/@h/types/property-type/customer-number/"?: CustomerNumberPropertyValueWithMetadata;
      "https://hash.ai/@h/types/property-type/industry/"?: IndustryPropertyValueWithMetadata;
      "https://hash.ai/@h/types/property-type/postal-code/"?: PostalCodePropertyValueWithMetadata;
      "https://hash.ai/@h/types/property-type/region/"?: RegionPropertyValueWithMetadata;
      "https://hash.ai/@h/types/property-type/street-address/"?: StreetAddressPropertyValueWithMetadata;
    };
  };

/**
 * A reference provided by the customer, such as their own purchase order number.
 */
export type CustomerReferencePropertyValue = TextDataType;

export type CustomerReferencePropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * An amount denominated in Djibouti Franc (ISO 4217 DJF).
 */
export type DJFDataType = CurrencyDataType;

export type DJFDataTypeWithMetadata = {
  value: DJFDataType;
  metadata: DJFDataTypeMetadata;
};
export type DJFDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/djf/v/1";
};

/**
 * An amount denominated in Danish Krone (ISO 4217 DKK).
 */
export type DKKDataType = CurrencyDataType;

export type DKKDataTypeWithMetadata = {
  value: DKKDataType;
  metadata: DKKDataTypeMetadata;
};
export type DKKDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/dkk/v/1";
};

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
 * An amount denominated in Dominican Peso (ISO 4217 DOP).
 */
export type DOPDataType = CurrencyDataType;

export type DOPDataTypeWithMetadata = {
  value: DOPDataType;
  metadata: DOPDataTypeMetadata;
};
export type DOPDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/dop/v/1";
};

/**
 * An amount denominated in Algerian Dinar (ISO 4217 DZD).
 */
export type DZDDataType = CurrencyDataType;

export type DZDDataTypeWithMetadata = {
  value: DZDDataType;
  metadata: DZDDataTypeMetadata;
};
export type DZDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/dzd/v/1";
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
 * A unit of time equal to 24 hours.
 */
export type DaysDataType = DurationDataType;

export type DaysDataTypeWithMetadata = {
  value: DaysDataType;
  metadata: DaysDataTypeMetadata;
};
export type DaysDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/days/v/1";
};

/**
 * Indicates whether a posting is a debit or a credit.
 */
export type DebitCreditIndicatorPropertyValue = TextDataType;

export type DebitCreditIndicatorPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * Stringified timestamp of when something was deleted.
 */
export type DeletedAtPropertyValue = DateTimeDataType;

export type DeletedAtPropertyValueWithMetadata = DateTimeDataTypeWithMetadata;

/**
 * Indicates whether a source-system record is marked for deletion.
 */
export type DeletionIndicatorPropertyValue = TextDataType;

export type DeletionIndicatorPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * The quantity actually delivered.
 */
export type DeliveredQuantityPropertyValue = KilogramsDataType;

export type DeliveredQuantityPropertyValueWithMetadata =
  KilogramsDataTypeWithMetadata;

/**
 * Something delivered by something.
 */
export type Delivers = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/delivers/v/1"];
  properties: DeliversProperties;
  propertiesWithMetadata: DeliversPropertiesWithMetadata;
};

export type DeliversOutgoingLinkAndTarget = never;

export type DeliversOutgoingLinksByLinkEntityTypeId = {};

/**
 * Something delivered by something.
 */
export type DeliversProperties = LinkProperties & {};

export type DeliversPropertiesWithMetadata = LinkPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * A logistics execution document for delivering goods against a sales order or transfer requirement.
 */
export type Delivery = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/delivery/v/1"];
  properties: DeliveryProperties;
  propertiesWithMetadata: DeliveryPropertiesWithMetadata;
};

export type DeliveryFulfillsLink = {
  linkEntity: Fulfills;
  rightEntity: SalesOrder;
};

export type DeliveryHasCustomerLink = {
  linkEntity: HasCustomer;
  rightEntity: Customer;
};

export type DeliveryHasLineItemLink = {
  linkEntity: HasLineItem;
  rightEntity: DeliveryItem;
};

/**
 * A line item within a delivery.
 */
export type DeliveryItem = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/delivery-item/v/1"];
  properties: DeliveryItemProperties;
  propertiesWithMetadata: DeliveryItemPropertiesWithMetadata;
};

export type DeliveryItemDeliversLink = {
  linkEntity: Delivers;
  rightEntity: Batch;
};

export type DeliveryItemFulfillsLink = {
  linkEntity: Fulfills;
  rightEntity: SalesOrderItem;
};

export type DeliveryItemHasMaterialLink = {
  linkEntity: HasMaterial;
  rightEntity: Material;
};

export type DeliveryItemLocatedAtLink = {
  linkEntity: LocatedAt;
  rightEntity: Site;
};

/**
 * The item number for a delivery.
 */
export type DeliveryItemNumberPropertyValue = TextDataType;

export type DeliveryItemNumberPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

export type DeliveryItemOutgoingLinkAndTarget =
  | DeliveryItemDeliversLink
  | DeliveryItemFulfillsLink
  | DeliveryItemHasMaterialLink
  | DeliveryItemLocatedAtLink;

export type DeliveryItemOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@h/types/entity-type/delivers/v/1": DeliveryItemDeliversLink;
  "https://hash.ai/@h/types/entity-type/fulfills/v/1": DeliveryItemFulfillsLink;
  "https://hash.ai/@h/types/entity-type/has-material/v/1": DeliveryItemHasMaterialLink;
  "https://hash.ai/@h/types/entity-type/located-at/v/1": DeliveryItemLocatedAtLink;
};

/**
 * A line item within a delivery.
 */
export type DeliveryItemProperties = {
  "https://hash.ai/@h/types/property-type/batch-number/"?: BatchNumberPropertyValue;
  "https://hash.ai/@h/types/property-type/delivered-quantity/"?: DeliveredQuantityPropertyValue;
  "https://hash.ai/@h/types/property-type/delivery-item-number/"?: DeliveryItemNumberPropertyValue;
  "https://hash.ai/@h/types/property-type/item-number/"?: ItemNumberPropertyValue;
  "https://hash.ai/@h/types/property-type/unit-of-measure/"?: UnitOfMeasurePropertyValue;
};

export type DeliveryItemPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/batch-number/"?: BatchNumberPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/delivered-quantity/"?: DeliveredQuantityPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/delivery-item-number/"?: DeliveryItemNumberPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/item-number/"?: ItemNumberPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/unit-of-measure/"?: UnitOfMeasurePropertyValueWithMetadata;
  };
};

/**
 * The delivery number.
 */
export type DeliveryNumberPropertyValue = TextDataType;

export type DeliveryNumberPropertyValueWithMetadata = TextDataTypeWithMetadata;

export type DeliveryOutgoingLinkAndTarget =
  | DeliveryFulfillsLink
  | DeliveryHasCustomerLink
  | DeliveryHasLineItemLink;

export type DeliveryOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@h/types/entity-type/fulfills/v/1": DeliveryFulfillsLink;
  "https://hash.ai/@h/types/entity-type/has-customer/v/1": DeliveryHasCustomerLink;
  "https://hash.ai/@h/types/entity-type/has-line-item/v/1": DeliveryHasLineItemLink;
};

/**
 * A logistics execution document for delivering goods against a sales order or transfer requirement.
 */
export type DeliveryProperties = {
  "https://hash.ai/@h/types/property-type/actual-goods-issue-date/"?: ActualGoodsIssueDatePropertyValue;
  "https://hash.ai/@h/types/property-type/delivery-number/"?: DeliveryNumberPropertyValue;
  "https://hash.ai/@h/types/property-type/delivery-type/"?: DeliveryTypePropertyValue;
  "https://hash.ai/@h/types/property-type/incoterms/"?: IncotermsPropertyValue;
  "https://hash.ai/@h/types/property-type/picking-date/"?: PickingDatePropertyValue;
  "https://hash.ai/@h/types/property-type/planned-goods-issue-date/"?: PlannedGoodsIssueDatePropertyValue;
  "https://hash.ai/@h/types/property-type/route/"?: RoutePropertyValue;
  "https://hash.ai/@h/types/property-type/scheduled-delivery-date/"?: ScheduledDeliveryDatePropertyValue;
  "https://hash.ai/@h/types/property-type/shipping-point/"?: ShippingPointPropertyValue;
};

export type DeliveryPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/actual-goods-issue-date/"?: ActualGoodsIssueDatePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/delivery-number/"?: DeliveryNumberPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/delivery-type/"?: DeliveryTypePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/incoterms/"?: IncotermsPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/picking-date/"?: PickingDatePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/planned-goods-issue-date/"?: PlannedGoodsIssueDatePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/route/"?: RoutePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/scheduled-delivery-date/"?: ScheduledDeliveryDatePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/shipping-point/"?: ShippingPointPropertyValueWithMetadata;
  };
};

/**
 * The category of a delivery.
 */
export type DeliveryTypePropertyValue = TextDataType;

export type DeliveryTypePropertyValueWithMetadata = TextDataTypeWithMetadata;

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
 * The channel through which goods or services reach the customer.
 */
export type DistributionChannelPropertyValue = TextDataType;

export type DistributionChannelPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * A product line or business division within an organization.
 */
export type DivisionPropertyValue = TextDataType;

export type DivisionPropertyValueWithMetadata = TextDataTypeWithMetadata;

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
 * The date shown on a document.
 */
export type DocumentDatePropertyValue = DateDataType;

export type DocumentDatePropertyValueWithMetadata = DateDataTypeWithMetadata;

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
 * An amount denominated in Egyptian Pound (ISO 4217 EGP).
 */
export type EGPDataType = CurrencyDataType;

export type EGPDataTypeWithMetadata = {
  value: EGPDataType;
  metadata: EGPDataTypeMetadata;
};
export type EGPDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/egp/v/1";
};

/**
 * An amount denominated in Nakfa (ISO 4217 ERN).
 */
export type ERNDataType = CurrencyDataType;

export type ERNDataTypeWithMetadata = {
  value: ERNDataType;
  metadata: ERNDataTypeMetadata;
};
export type ERNDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/ern/v/1";
};

/**
 * An amount denominated in Ethiopian Birr (ISO 4217 ETB).
 */
export type ETBDataType = CurrencyDataType;

export type ETBDataTypeWithMetadata = {
  value: ETBDataType;
  metadata: ETBDataTypeMetadata;
};
export type ETBDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/etb/v/1";
};

/**
 * An amount denominated in Euro (ISO 4217 EUR).
 */
export type EURDataType = CurrencyDataType;

export type EURDataTypeWithMetadata = {
  value: EURDataType;
  metadata: EURDataTypeMetadata;
};
export type EURDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/eur/v/1";
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
 * The date on which a batch expires or is no longer usable.
 */
export type ExpiryDatePropertyValue = DateDataType;

export type ExpiryDatePropertyValueWithMetadata = DateDataTypeWithMetadata;

/**
 * An explanation or justification for something.
 */
export type ExplanationPropertyValue = TextDataType;

export type ExplanationPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * An amount denominated in Fiji Dollar (ISO 4217 FJD).
 */
export type FJDDataType = CurrencyDataType;

export type FJDDataTypeWithMetadata = {
  value: FJDDataType;
  metadata: FJDDataTypeMetadata;
};
export type FJDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/fjd/v/1";
};

/**
 * An amount denominated in Falkland Islands Pound (ISO 4217 FKP).
 */
export type FKPDataType = CurrencyDataType;

export type FKPDataTypeWithMetadata = {
  value: FKPDataType;
  metadata: FKPDataTypeMetadata;
};
export type FKPDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/fkp/v/1";
};

/**
 * The name of a feature
 */
export type FeatureNamePropertyValue = TextDataType;

export type FeatureNamePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * An imperial unit of length. 3 feet equals 1 yard. Equivalent to 0.3048 meters in the International System of Units (SI).
 */
export type FeetDataType = ImperialLengthUKDataType;

export type FeetDataTypeWithMetadata = {
  value: FeetDataType;
  metadata: FeetDataTypeMetadata;
};
export type FeetDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/feet/v/1";
};

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
 * The fiscal year to which data applies.
 */
export type FiscalYearPropertyValue = CalendarYearDataType;

export type FiscalYearPropertyValueWithMetadata =
  CalendarYearDataTypeWithMetadata;

/**
 * Indicates whether a component quantity is fixed rather than scaled by order quantity.
 */
export type FixedQuantityIndicatorPropertyValue = TextDataType;

export type FixedQuantityIndicatorPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

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
 * Something that something fulfills.
 */
export type Fulfills = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/fulfills/v/1"];
  properties: FulfillsProperties;
  propertiesWithMetadata: FulfillsPropertiesWithMetadata;
};

export type FulfillsOutgoingLinkAndTarget = never;

export type FulfillsOutgoingLinksByLinkEntityTypeId = {};

/**
 * Something that something fulfills.
 */
export type FulfillsProperties = LinkProperties & {};

export type FulfillsPropertiesWithMetadata = LinkPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * An amount denominated in Pound Sterling (ISO 4217 GBP).
 */
export type GBPDataType = CurrencyDataType;

export type GBPDataTypeWithMetadata = {
  value: GBPDataType;
  metadata: GBPDataTypeMetadata;
};
export type GBPDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/gbp/v/1";
};

/**
 * An amount denominated in Lari (ISO 4217 GEL).
 */
export type GELDataType = CurrencyDataType;

export type GELDataTypeWithMetadata = {
  value: GELDataType;
  metadata: GELDataTypeMetadata;
};
export type GELDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/gel/v/1";
};

/**
 * An amount denominated in Ghana Cedi (ISO 4217 GHS).
 */
export type GHSDataType = CurrencyDataType;

export type GHSDataTypeWithMetadata = {
  value: GHSDataType;
  metadata: GHSDataTypeMetadata;
};
export type GHSDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/ghs/v/1";
};

/**
 * An amount denominated in Gibraltar Pound (ISO 4217 GIP).
 */
export type GIPDataType = CurrencyDataType;

export type GIPDataTypeWithMetadata = {
  value: GIPDataType;
  metadata: GIPDataTypeMetadata;
};
export type GIPDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/gip/v/1";
};

/**
 * An amount denominated in Dalasi (ISO 4217 GMD).
 */
export type GMDDataType = CurrencyDataType;

export type GMDDataTypeWithMetadata = {
  value: GMDDataType;
  metadata: GMDDataTypeMetadata;
};
export type GMDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/gmd/v/1";
};

/**
 * An amount denominated in Guinean Franc (ISO 4217 GNF).
 */
export type GNFDataType = CurrencyDataType;

export type GNFDataTypeWithMetadata = {
  value: GNFDataType;
  metadata: GNFDataTypeMetadata;
};
export type GNFDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/gnf/v/1";
};

/**
 * An amount denominated in Quetzal (ISO 4217 GTQ).
 */
export type GTQDataType = CurrencyDataType;

export type GTQDataTypeWithMetadata = {
  value: GTQDataType;
  metadata: GTQDataTypeMetadata;
};
export type GTQDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/gtq/v/1";
};

/**
 * An amount denominated in Guyana Dollar (ISO 4217 GYD).
 */
export type GYDDataType = CurrencyDataType;

export type GYDDataTypeWithMetadata = {
  value: GYDDataType;
  metadata: GYDDataTypeMetadata;
};
export type GYDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/gyd/v/1";
};

/**
 * The quantity received against an order or schedule line.
 */
export type GoodsReceiptQuantityPropertyValue = KilogramsDataType;

export type GoodsReceiptQuantityPropertyValueWithMetadata =
  | KilogramsDataTypeWithMetadata
  | GramsDataTypeWithMetadata
  | MetricTonnesDataTypeWithMetadata
  | PoundsDataTypeWithMetadata
  | LitresDataTypeWithMetadata
  | MillilitresDataTypeWithMetadata
  | CubicMetresDataTypeWithMetadata
  | CubicFeetDataTypeWithMetadata
  | MetersDataTypeWithMetadata
  | CentimetersDataTypeWithMetadata
  | MillimetersDataTypeWithMetadata
  | KilometersDataTypeWithMetadata
  | FeetDataTypeWithMetadata
  | InchesDataTypeWithMetadata
  | YardsDataTypeWithMetadata
  | MilesDataTypeWithMetadata
  | SquareMetresDataTypeWithMetadata
  | SquareCentimetresDataTypeWithMetadata
  | SquareFeetDataTypeWithMetadata
  | HoursDataTypeWithMetadata
  | DaysDataTypeWithMetadata
  | UnitDataTypeWithMetadata;

/**
 * A metric unit of mass equal to one thousandth of a kilogram.
 */
export type GramsDataType = MassDataType;

export type GramsDataTypeWithMetadata = {
  value: GramsDataType;
  metadata: GramsDataTypeMetadata;
};
export type GramsDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/grams/v/1";
};

/**
 * The total weight of an object including its packaging or container.
 */
export type GrossWeightPropertyValue = KilogramsDataType;

export type GrossWeightPropertyValueWithMetadata =
  | KilogramsDataTypeWithMetadata
  | GramsDataTypeWithMetadata
  | MetricTonnesDataTypeWithMetadata
  | PoundsDataTypeWithMetadata;

/**
 * An amount denominated in Hong Kong Dollar (ISO 4217 HKD).
 */
export type HKDDataType = CurrencyDataType;

export type HKDDataTypeWithMetadata = {
  value: HKDDataType;
  metadata: HKDDataTypeMetadata;
};
export type HKDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/hkd/v/1";
};

/**
 * An amount denominated in Lempira (ISO 4217 HNL).
 */
export type HNLDataType = CurrencyDataType;

export type HNLDataTypeWithMetadata = {
  value: HNLDataType;
  metadata: HNLDataTypeMetadata;
};
export type HNLDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/hnl/v/1";
};

/**
 * An amount denominated in Gourde (ISO 4217 HTG).
 */
export type HTGDataType = CurrencyDataType;

export type HTGDataTypeWithMetadata = {
  value: HTGDataType;
  metadata: HTGDataTypeMetadata;
};
export type HTGDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/htg/v/1";
};

/**
 * An amount denominated in Forint (ISO 4217 HUF).
 */
export type HUFDataType = CurrencyDataType;

export type HUFDataTypeWithMetadata = {
  value: HUFDataType;
  metadata: HUFDataTypeMetadata;
};
export type HUFDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/huf/v/1";
};

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
 * A customer associated with something.
 */
export type HasCustomer = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/has-customer/v/1"];
  properties: HasCustomerProperties;
  propertiesWithMetadata: HasCustomerPropertiesWithMetadata;
};

export type HasCustomerOutgoingLinkAndTarget = never;

export type HasCustomerOutgoingLinksByLinkEntityTypeId = {};

/**
 * A customer associated with something.
 */
export type HasCustomerProperties = LinkProperties & {};

export type HasCustomerPropertiesWithMetadata = LinkPropertiesWithMetadata & {
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

/**
 * A line item that something has.
 */
export type HasLineItem = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/has-line-item/v/1"];
  properties: HasLineItemProperties;
  propertiesWithMetadata: HasLineItemPropertiesWithMetadata;
};

export type HasLineItemOutgoingLinkAndTarget = never;

export type HasLineItemOutgoingLinksByLinkEntityTypeId = {};

/**
 * A line item that something has.
 */
export type HasLineItemProperties = LinkProperties & {};

export type HasLineItemPropertiesWithMetadata = LinkPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * A material that something concerns.
 */
export type HasMaterial = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/has-material/v/1"];
  properties: HasMaterialProperties;
  propertiesWithMetadata: HasMaterialPropertiesWithMetadata;
};

export type HasMaterialOutgoingLinkAndTarget = never;

export type HasMaterialOutgoingLinksByLinkEntityTypeId = {};

/**
 * A material that something concerns.
 */
export type HasMaterialProperties = LinkProperties & {};

export type HasMaterialPropertiesWithMetadata = LinkPropertiesWithMetadata & {
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
 * A unit of time equal to 60 minutes.
 */
export type HoursDataType = DurationDataType;

export type HoursDataTypeWithMetadata = {
  value: HoursDataType;
  metadata: HoursDataTypeMetadata;
};
export type HoursDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/hours/v/1";
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
 * An amount denominated in Rupiah (ISO 4217 IDR).
 */
export type IDRDataType = CurrencyDataType;

export type IDRDataTypeWithMetadata = {
  value: IDRDataType;
  metadata: IDRDataTypeMetadata;
};
export type IDRDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/idr/v/1";
};

/**
 * An amount denominated in New Israeli Sheqel (ISO 4217 ILS).
 */
export type ILSDataType = CurrencyDataType;

export type ILSDataTypeWithMetadata = {
  value: ILSDataType;
  metadata: ILSDataTypeMetadata;
};
export type ILSDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/ils/v/1";
};

/**
 * An amount denominated in Indian Rupee (ISO 4217 INR).
 */
export type INRDataType = CurrencyDataType;

export type INRDataTypeWithMetadata = {
  value: INRDataType;
  metadata: INRDataTypeMetadata;
};
export type INRDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/inr/v/1";
};

/**
 * An amount denominated in Iraqi Dinar (ISO 4217 IQD).
 */
export type IQDDataType = CurrencyDataType;

export type IQDDataTypeWithMetadata = {
  value: IQDDataType;
  metadata: IQDDataTypeMetadata;
};
export type IQDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/iqd/v/1";
};

/**
 * An amount denominated in Iranian Rial (ISO 4217 IRR).
 */
export type IRRDataType = CurrencyDataType;

export type IRRDataTypeWithMetadata = {
  value: IRRDataType;
  metadata: IRRDataTypeMetadata;
};
export type IRRDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/irr/v/1";
};

/**
 * An amount denominated in Iceland Krona (ISO 4217 ISK).
 */
export type ISKDataType = CurrencyDataType;

export type ISKDataTypeWithMetadata = {
  value: ISKDataType;
  metadata: ISKDataTypeMetadata;
};
export type ISKDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/isk/v/1";
};

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
 * A measure of distance in the system of units defined in the British Weights and Measures Acts, in use alongside metric units in the UK and elsewhere.
 */
export type ImperialLengthUKDataType = LengthDataType;

export type ImperialLengthUKDataTypeWithMetadata = {
  value: ImperialLengthUKDataType;
  metadata: ImperialLengthUKDataTypeMetadata;
};
export type ImperialLengthUKDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/imperial-length-uk/v/1";
};

/**
 * A measure of distance in the system of units commonly used in the United States, formally known as United States customary units.
 */
export type ImperialLengthUSDataType = LengthDataType;

export type ImperialLengthUSDataTypeWithMetadata = {
  value: ImperialLengthUSDataType;
  metadata: ImperialLengthUSDataTypeMetadata;
};
export type ImperialLengthUSDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/imperial-length-us/v/1";
};

/**
 * An imperial unit of length. 12 inches equals 1 foot. Equivalent to 0.0254 meters in the International System of Units (SI).
 */
export type InchesDataType = ImperialLengthUKDataType;

export type InchesDataTypeWithMetadata = {
  value: InchesDataType;
  metadata: InchesDataTypeMetadata;
};
export type InchesDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/inches/v/1";
};

/**
 * The Incoterms rule and location for a sales or delivery.
 */
export type IncotermsPropertyValue = TextDataType;

export type IncotermsPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * An industry classification.
 */
export type IndustryPropertyValue = TextDataType;

export type IndustryPropertyValueWithMetadata = TextDataTypeWithMetadata;

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
 * A grouping used to classify materials for sales and pricing logic.
 */
export type ItemCategoryGroupPropertyValue = TextDataType;

export type ItemCategoryGroupPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * The item category for a line item or BOM component.
 */
export type ItemCategoryPropertyValue = TextDataType;

export type ItemCategoryPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The position of a line item.
 */
export type ItemNumberPropertyValue = TextDataType;

export type ItemNumberPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * An amount denominated in Jamaican Dollar (ISO 4217 JMD).
 */
export type JMDDataType = CurrencyDataType;

export type JMDDataTypeWithMetadata = {
  value: JMDDataType;
  metadata: JMDDataTypeMetadata;
};
export type JMDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/jmd/v/1";
};

/**
 * An amount denominated in Jordanian Dinar (ISO 4217 JOD).
 */
export type JODDataType = CurrencyDataType;

export type JODDataTypeWithMetadata = {
  value: JODDataType;
  metadata: JODDataTypeMetadata;
};
export type JODDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/jod/v/1";
};

/**
 * An amount denominated in Yen (ISO 4217 JPY).
 */
export type JPYDataType = CurrencyDataType;

export type JPYDataTypeWithMetadata = {
  value: JPYDataType;
  metadata: JPYDataTypeMetadata;
};
export type JPYDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/jpy/v/1";
};

/**
 * An amount denominated in Kenyan Shilling (ISO 4217 KES).
 */
export type KESDataType = CurrencyDataType;

export type KESDataTypeWithMetadata = {
  value: KESDataType;
  metadata: KESDataTypeMetadata;
};
export type KESDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/kes/v/1";
};

/**
 * An amount denominated in Som (ISO 4217 KGS).
 */
export type KGSDataType = CurrencyDataType;

export type KGSDataTypeWithMetadata = {
  value: KGSDataType;
  metadata: KGSDataTypeMetadata;
};
export type KGSDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/kgs/v/1";
};

/**
 * An amount denominated in Riel (ISO 4217 KHR).
 */
export type KHRDataType = CurrencyDataType;

export type KHRDataTypeWithMetadata = {
  value: KHRDataType;
  metadata: KHRDataTypeMetadata;
};
export type KHRDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/khr/v/1";
};

/**
 * An amount denominated in Comorian Franc (ISO 4217 KMF).
 */
export type KMFDataType = CurrencyDataType;

export type KMFDataTypeWithMetadata = {
  value: KMFDataType;
  metadata: KMFDataTypeMetadata;
};
export type KMFDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/kmf/v/1";
};

/**
 * An amount denominated in North Korean Won (ISO 4217 KPW).
 */
export type KPWDataType = CurrencyDataType;

export type KPWDataTypeWithMetadata = {
  value: KPWDataType;
  metadata: KPWDataTypeMetadata;
};
export type KPWDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/kpw/v/1";
};

/**
 * An amount denominated in Won (ISO 4217 KRW).
 */
export type KRWDataType = CurrencyDataType;

export type KRWDataTypeWithMetadata = {
  value: KRWDataType;
  metadata: KRWDataTypeMetadata;
};
export type KRWDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/krw/v/1";
};

/**
 * An amount denominated in Kuwaiti Dinar (ISO 4217 KWD).
 */
export type KWDDataType = CurrencyDataType;

export type KWDDataTypeWithMetadata = {
  value: KWDDataType;
  metadata: KWDDataTypeMetadata;
};
export type KWDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/kwd/v/1";
};

/**
 * An amount denominated in Cayman Islands Dollar (ISO 4217 KYD).
 */
export type KYDDataType = CurrencyDataType;

export type KYDDataTypeWithMetadata = {
  value: KYDDataType;
  metadata: KYDDataTypeMetadata;
};
export type KYDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/kyd/v/1";
};

/**
 * An amount denominated in Tenge (ISO 4217 KZT).
 */
export type KZTDataType = CurrencyDataType;

export type KZTDataTypeWithMetadata = {
  value: KZTDataType;
  metadata: KZTDataTypeMetadata;
};
export type KZTDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/kzt/v/1";
};

/**
 * The SI base unit of mass, equal to 1000 grams.
 */
export type KilogramsDataType = MassDataType;

export type KilogramsDataTypeWithMetadata = {
  value: KilogramsDataType;
  metadata: KilogramsDataTypeMetadata;
};
export type KilogramsDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/kilograms/v/1";
};

/**
 * A unit of length in the International System of Units (SI), equal to one thousand meters.
 */
export type KilometersDataType = MetricLengthSIDataType;

export type KilometersDataTypeWithMetadata = {
  value: KilometersDataType;
  metadata: KilometersDataTypeMetadata;
};
export type KilometersDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/kilometers/v/1";
};

/**
 * An identifier for a record in Ory Kratos.
 */
export type KratosIdentityIdPropertyValue = TextDataType;

export type KratosIdentityIdPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * An amount denominated in Lao Kip (ISO 4217 LAK).
 */
export type LAKDataType = CurrencyDataType;

export type LAKDataTypeWithMetadata = {
  value: LAKDataType;
  metadata: LAKDataTypeMetadata;
};
export type LAKDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/lak/v/1";
};

/**
 * An amount denominated in Lebanese Pound (ISO 4217 LBP).
 */
export type LBPDataType = CurrencyDataType;

export type LBPDataTypeWithMetadata = {
  value: LBPDataType;
  metadata: LBPDataTypeMetadata;
};
export type LBPDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/lbp/v/1";
};

/**
 * An amount denominated in Sri Lanka Rupee (ISO 4217 LKR).
 */
export type LKRDataType = CurrencyDataType;

export type LKRDataTypeWithMetadata = {
  value: LKRDataType;
  metadata: LKRDataTypeMetadata;
};
export type LKRDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/lkr/v/1";
};

/**
 * An amount denominated in Liberian Dollar (ISO 4217 LRD).
 */
export type LRDDataType = CurrencyDataType;

export type LRDDataTypeWithMetadata = {
  value: LRDDataType;
  metadata: LRDDataTypeMetadata;
};
export type LRDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/lrd/v/1";
};

/**
 * An amount denominated in Loti (ISO 4217 LSL).
 */
export type LSLDataType = CurrencyDataType;

export type LSLDataTypeWithMetadata = {
  value: LSLDataType;
  metadata: LSLDataTypeMetadata;
};
export type LSLDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/lsl/v/1";
};

/**
 * An amount denominated in Libyan Dinar (ISO 4217 LYD).
 */
export type LYDDataType = CurrencyDataType;

export type LYDDataTypeWithMetadata = {
  value: LYDDataType;
  metadata: LYDDataTypeMetadata;
};
export type LYDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/lyd/v/1";
};

/**
 * A language, for example of a text or description.
 */
export type LanguagePropertyValue = TextDataType;

export type LanguagePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A measure of distance.
 */
export type LengthDataType = NumberDataType;

export type LengthDataTypeWithMetadata = {
  value: LengthDataType;
  metadata: LengthDataTypeMetadata;
};
export type LengthDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/length/v/1";
};

/**
 * The category of a line item, determining how it behaves.
 */
export type LineItemCategoryPropertyValue = TextDataType;

export type LineItemCategoryPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * The most generic connection between two entities, defining a relationship from a source to a target. It serves as a parent type for more specific link entity types, enabling consistent and interoperable data relationships.
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

/**
 * The most generic connection between two entities, defining a relationship from a source to a target. It serves as a parent type for more specific link entity types, enabling consistent and interoperable data relationships.
 */
export type LinkProperties = {};

export type LinkPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * A metric unit of volume equal to one cubic decimetre.
 */
export type LitresDataType = VolumeDataType;

export type LitresDataTypeWithMetadata = {
  value: LitresDataType;
  metadata: LitresDataTypeMetadata;
};
export type LitresDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/litres/v/1";
};

/**
 * The site where something is located or takes place.
 */
export type LocatedAt = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/located-at/v/1"];
  properties: LocatedAtProperties;
  propertiesWithMetadata: LocatedAtPropertiesWithMetadata;
};

export type LocatedAtOutgoingLinkAndTarget = never;

export type LocatedAtOutgoingLinksByLinkEntityTypeId = {};

/**
 * The site where something is located or takes place.
 */
export type LocatedAtProperties = LinkProperties & {};

export type LocatedAtPropertiesWithMetadata = LinkPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * A location for something, expressed as a single string
 */
export type LocationPropertyValue = TextDataType;

export type LocationPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * An amount denominated in Moroccan Dirham (ISO 4217 MAD).
 */
export type MADDataType = CurrencyDataType;

export type MADDataTypeWithMetadata = {
  value: MADDataType;
  metadata: MADDataTypeMetadata;
};
export type MADDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/mad/v/1";
};

/**
 * An amount denominated in Moldovan Leu (ISO 4217 MDL).
 */
export type MDLDataType = CurrencyDataType;

export type MDLDataTypeWithMetadata = {
  value: MDLDataType;
  metadata: MDLDataTypeMetadata;
};
export type MDLDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/mdl/v/1";
};

/**
 * An amount denominated in Malagasy Ariary (ISO 4217 MGA).
 */
export type MGADataType = CurrencyDataType;

export type MGADataTypeWithMetadata = {
  value: MGADataType;
  metadata: MGADataTypeMetadata;
};
export type MGADataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/mga/v/1";
};

/**
 * A MIME (Multipurpose Internet Mail Extensions) type.
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types
 */
export type MIMETypePropertyValue = TextDataType;

export type MIMETypePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * An amount denominated in Denar (ISO 4217 MKD).
 */
export type MKDDataType = CurrencyDataType;

export type MKDDataTypeWithMetadata = {
  value: MKDDataType;
  metadata: MKDDataTypeMetadata;
};
export type MKDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/mkd/v/1";
};

/**
 * An amount denominated in Kyat (ISO 4217 MMK).
 */
export type MMKDataType = CurrencyDataType;

export type MMKDataTypeWithMetadata = {
  value: MMKDataType;
  metadata: MMKDataTypeMetadata;
};
export type MMKDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/mmk/v/1";
};

/**
 * An amount denominated in Tugrik (ISO 4217 MNT).
 */
export type MNTDataType = CurrencyDataType;

export type MNTDataTypeWithMetadata = {
  value: MNTDataType;
  metadata: MNTDataTypeMetadata;
};
export type MNTDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/mnt/v/1";
};

/**
 * An amount denominated in Pataca (ISO 4217 MOP).
 */
export type MOPDataType = CurrencyDataType;

export type MOPDataTypeWithMetadata = {
  value: MOPDataType;
  metadata: MOPDataTypeMetadata;
};
export type MOPDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/mop/v/1";
};

/**
 * The person or group responsible for material requirements planning.
 */
export type MRPControllerPropertyValue = TextDataType;

export type MRPControllerPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * An amount denominated in Ouguiya (ISO 4217 MRU).
 */
export type MRUDataType = CurrencyDataType;

export type MRUDataTypeWithMetadata = {
  value: MRUDataType;
  metadata: MRUDataTypeMetadata;
};
export type MRUDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/mru/v/1";
};

/**
 * An amount denominated in Mauritius Rupee (ISO 4217 MUR).
 */
export type MURDataType = CurrencyDataType;

export type MURDataTypeWithMetadata = {
  value: MURDataType;
  metadata: MURDataTypeMetadata;
};
export type MURDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/mur/v/1";
};

/**
 * An amount denominated in Rufiyaa (ISO 4217 MVR).
 */
export type MVRDataType = CurrencyDataType;

export type MVRDataTypeWithMetadata = {
  value: MVRDataType;
  metadata: MVRDataTypeMetadata;
};
export type MVRDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/mvr/v/1";
};

/**
 * An amount denominated in Malawi Kwacha (ISO 4217 MWK).
 */
export type MWKDataType = CurrencyDataType;

export type MWKDataTypeWithMetadata = {
  value: MWKDataType;
  metadata: MWKDataTypeMetadata;
};
export type MWKDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/mwk/v/1";
};

/**
 * An amount denominated in Mexican Peso (ISO 4217 MXN).
 */
export type MXNDataType = CurrencyDataType;

export type MXNDataTypeWithMetadata = {
  value: MXNDataType;
  metadata: MXNDataTypeMetadata;
};
export type MXNDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/mxn/v/1";
};

/**
 * An amount denominated in Malaysian Ringgit (ISO 4217 MYR).
 */
export type MYRDataType = CurrencyDataType;

export type MYRDataTypeWithMetadata = {
  value: MYRDataType;
  metadata: MYRDataTypeMetadata;
};
export type MYRDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/myr/v/1";
};

/**
 * An amount denominated in Mozambique Metical (ISO 4217 MZN).
 */
export type MZNDataType = CurrencyDataType;

export type MZNDataTypeWithMetadata = {
  value: MZNDataType;
  metadata: MZNDataTypeMetadata;
};
export type MZNDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/mzn/v/1";
};

/**
 * Configuration for a manual entity inference feature
 */
export type ManualInferenceConfigurationPropertyValue = ObjectDataType;

export type ManualInferenceConfigurationPropertyValueWithMetadata =
  ObjectDataTypeWithMetadata;

/**
 * A measure of the amount of matter in an object.
 */
export type MassDataType = NumberDataType;

export type MassDataTypeWithMetadata = {
  value: MassDataType;
  metadata: MassDataTypeMetadata;
};
export type MassDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/mass/v/1";
};

/**
 * A good or material that can be produced, stored, sold, or procured, including raw materials, intermediates, and finished goods.
 */
export type Material = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/material/v/1"];
  properties: MaterialProperties;
  propertiesWithMetadata: MaterialPropertiesWithMetadata;
};

/**
 * A grouping of materials for reporting, purchasing, or pricing.
 */
export type MaterialGroupPropertyValue = TextDataType;

export type MaterialGroupPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The material number.
 */
export type MaterialNumberPropertyValue = TextDataType;

export type MaterialNumberPropertyValueWithMetadata = TextDataTypeWithMetadata;

export type MaterialOutgoingLinkAndTarget = never;

export type MaterialOutgoingLinksByLinkEntityTypeId = {};

/**
 * A good or material that can be produced, stored, sold, or procured, including raw materials, intermediates, and finished goods.
 */
export type MaterialProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValue;
  "https://blockprotocol.org/@blockprotocol/types/property-type/name/"?: NamePropertyValue;
  "https://hash.ai/@h/types/property-type/division/"?: DivisionPropertyValue;
  "https://hash.ai/@h/types/property-type/gross-weight/"?: GrossWeightPropertyValue;
  "https://hash.ai/@h/types/property-type/item-category-group/"?: ItemCategoryGroupPropertyValue;
  "https://hash.ai/@h/types/property-type/language/"?: LanguagePropertyValue;
  "https://hash.ai/@h/types/property-type/material-group/"?: MaterialGroupPropertyValue;
  "https://hash.ai/@h/types/property-type/material-number/"?: MaterialNumberPropertyValue;
  "https://hash.ai/@h/types/property-type/material-type/"?: MaterialTypePropertyValue;
  "https://hash.ai/@h/types/property-type/mrp-controller/"?: MRPControllerPropertyValue;
  "https://hash.ai/@h/types/property-type/net-weight/"?: NetWeightPropertyValue;
  "https://hash.ai/@h/types/property-type/procurement-type/"?: ProcurementTypePropertyValue;
  "https://hash.ai/@h/types/property-type/status/"?: StatusPropertyValue;
  "https://hash.ai/@h/types/property-type/unit-of-measure/"?: UnitOfMeasurePropertyValue;
};

export type MaterialPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/description/"?: DescriptionPropertyValueWithMetadata;
    "https://blockprotocol.org/@blockprotocol/types/property-type/name/"?: NamePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/division/"?: DivisionPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/gross-weight/"?: GrossWeightPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/item-category-group/"?: ItemCategoryGroupPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/language/"?: LanguagePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/material-group/"?: MaterialGroupPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/material-number/"?: MaterialNumberPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/material-type/"?: MaterialTypePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/mrp-controller/"?: MRPControllerPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/net-weight/"?: NetWeightPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/procurement-type/"?: ProcurementTypePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/status/"?: StatusPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/unit-of-measure/"?: UnitOfMeasurePropertyValueWithMetadata;
  };
};

/**
 * The material type, such as finished good, raw material, or service.
 */
export type MaterialTypePropertyValue = TextDataType;

export type MaterialTypePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The base unit of length in the International System of Units (SI).
 */
export type MetersDataType = MetricLengthSIDataType;

export type MetersDataTypeWithMetadata = {
  value: MetersDataType;
  metadata: MetersDataTypeMetadata;
};
export type MetersDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/meters/v/1";
};

/**
 * The procedure via which something was produced, analyzed, or otherwise approached.
 */
export type MethodologyPropertyValue = TextDataType;

export type MethodologyPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A measure of distance in the International System of Units (SI), the international standard for decimal-based measurements.
 */
export type MetricLengthSIDataType = LengthDataType;

export type MetricLengthSIDataTypeWithMetadata = {
  value: MetricLengthSIDataType;
  metadata: MetricLengthSIDataTypeMetadata;
};
export type MetricLengthSIDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/metric-length-si/v/1";
};

/**
 * A metric unit of mass equal to 1000 kilograms.
 */
export type MetricTonnesDataType = MassDataType;

export type MetricTonnesDataTypeWithMetadata = {
  value: MetricTonnesDataType;
  metadata: MetricTonnesDataTypeMetadata;
};
export type MetricTonnesDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/metric-tonnes/v/1";
};

/**
 * An imperial unit of length, equivalent to 1,609.344 meters in the International System of Units (SI).
 */
export type MilesDataType = ImperialLengthUKDataType;

export type MilesDataTypeWithMetadata = {
  value: MilesDataType;
  metadata: MilesDataTypeMetadata;
};
export type MilesDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/miles/v/1";
};

/**
 * A metric unit of volume equal to one thousandth of a litre.
 */
export type MillilitresDataType = VolumeDataType;

export type MillilitresDataTypeWithMetadata = {
  value: MillilitresDataType;
  metadata: MillilitresDataTypeMetadata;
};
export type MillilitresDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/millilitres/v/1";
};

/**
 * A unit of length in the International System of Units (SI), equal to one thousandth of a meter.
 */
export type MillimetersDataType = MetricLengthSIDataType;

export type MillimetersDataTypeWithMetadata = {
  value: MillimetersDataType;
  metadata: MillimetersDataTypeMetadata;
};
export type MillimetersDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/millimeters/v/1";
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
 * An amount denominated in Namibia Dollar (ISO 4217 NAD).
 */
export type NADDataType = CurrencyDataType;

export type NADDataTypeWithMetadata = {
  value: NADDataType;
  metadata: NADDataTypeMetadata;
};
export type NADDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/nad/v/1";
};

/**
 * An amount denominated in Naira (ISO 4217 NGN).
 */
export type NGNDataType = CurrencyDataType;

export type NGNDataTypeWithMetadata = {
  value: NGNDataType;
  metadata: NGNDataTypeMetadata;
};
export type NGNDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/ngn/v/1";
};

/**
 * An amount denominated in Cordoba Oro (ISO 4217 NIO).
 */
export type NIODataType = CurrencyDataType;

export type NIODataTypeWithMetadata = {
  value: NIODataType;
  metadata: NIODataTypeMetadata;
};
export type NIODataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/nio/v/1";
};

/**
 * An amount denominated in Norwegian Krone (ISO 4217 NOK).
 */
export type NOKDataType = CurrencyDataType;

export type NOKDataTypeWithMetadata = {
  value: NOKDataType;
  metadata: NOKDataTypeMetadata;
};
export type NOKDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/nok/v/1";
};

/**
 * An amount denominated in Nepalese Rupee (ISO 4217 NPR).
 */
export type NPRDataType = CurrencyDataType;

export type NPRDataTypeWithMetadata = {
  value: NPRDataType;
  metadata: NPRDataTypeMetadata;
};
export type NPRDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/npr/v/1";
};

/**
 * An amount denominated in New Zealand Dollar (ISO 4217 NZD).
 */
export type NZDDataType = CurrencyDataType;

export type NZDDataTypeWithMetadata = {
  value: NZDDataType;
  metadata: NZDDataTypeMetadata;
};
export type NZDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/nzd/v/1";
};

/**
 * A word or set of words by which something is known, addressed, or referred to.
 */
export type NamePropertyValue = TextDataType;

export type NamePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The net monetary value of something.
 */
export type NetValuePropertyValue = AEDDataType;

export type NetValuePropertyValueWithMetadata =
  | AEDDataTypeWithMetadata
  | AUDDataTypeWithMetadata
  | BRLDataTypeWithMetadata
  | CADDataTypeWithMetadata
  | CHFDataTypeWithMetadata
  | CNYDataTypeWithMetadata
  | EURDataTypeWithMetadata
  | GBPDataTypeWithMetadata
  | IDRDataTypeWithMetadata
  | JPYDataTypeWithMetadata
  | KRWDataTypeWithMetadata
  | KWDDataTypeWithMetadata
  | MXNDataTypeWithMetadata
  | OMRDataTypeWithMetadata
  | PENDataTypeWithMetadata
  | QARDataTypeWithMetadata
  | RUBDataTypeWithMetadata
  | SGDDataTypeWithMetadata
  | UAHDataTypeWithMetadata
  | USDDataTypeWithMetadata
  | ZARDataTypeWithMetadata
  | AFNDataTypeWithMetadata
  | ALLDataTypeWithMetadata
  | AMDDataTypeWithMetadata
  | ANGDataTypeWithMetadata
  | AOADataTypeWithMetadata
  | ARSDataTypeWithMetadata
  | AWGDataTypeWithMetadata
  | AZNDataTypeWithMetadata
  | BAMDataTypeWithMetadata
  | BBDDataTypeWithMetadata
  | BDTDataTypeWithMetadata
  | BGNDataTypeWithMetadata
  | BHDDataTypeWithMetadata
  | BIFDataTypeWithMetadata
  | BMDDataTypeWithMetadata
  | BNDDataTypeWithMetadata
  | BOBDataTypeWithMetadata
  | BSDDataTypeWithMetadata
  | BTNDataTypeWithMetadata
  | BWPDataTypeWithMetadata
  | BYNDataTypeWithMetadata
  | BZDDataTypeWithMetadata
  | CDFDataTypeWithMetadata
  | CLPDataTypeWithMetadata
  | COPDataTypeWithMetadata
  | CRCDataTypeWithMetadata
  | CUPDataTypeWithMetadata
  | CVEDataTypeWithMetadata
  | CZKDataTypeWithMetadata
  | DJFDataTypeWithMetadata
  | DKKDataTypeWithMetadata
  | DOPDataTypeWithMetadata
  | DZDDataTypeWithMetadata
  | EGPDataTypeWithMetadata
  | ERNDataTypeWithMetadata
  | ETBDataTypeWithMetadata
  | FJDDataTypeWithMetadata
  | FKPDataTypeWithMetadata
  | GELDataTypeWithMetadata
  | GHSDataTypeWithMetadata
  | GIPDataTypeWithMetadata
  | GMDDataTypeWithMetadata
  | GNFDataTypeWithMetadata
  | GTQDataTypeWithMetadata
  | GYDDataTypeWithMetadata
  | HKDDataTypeWithMetadata
  | HNLDataTypeWithMetadata
  | HTGDataTypeWithMetadata
  | HUFDataTypeWithMetadata
  | ILSDataTypeWithMetadata
  | INRDataTypeWithMetadata
  | IQDDataTypeWithMetadata
  | IRRDataTypeWithMetadata
  | ISKDataTypeWithMetadata
  | JMDDataTypeWithMetadata
  | JODDataTypeWithMetadata
  | KESDataTypeWithMetadata
  | KGSDataTypeWithMetadata
  | KHRDataTypeWithMetadata
  | KMFDataTypeWithMetadata
  | KPWDataTypeWithMetadata
  | KYDDataTypeWithMetadata
  | KZTDataTypeWithMetadata
  | LAKDataTypeWithMetadata
  | LBPDataTypeWithMetadata
  | LKRDataTypeWithMetadata
  | LRDDataTypeWithMetadata
  | LSLDataTypeWithMetadata
  | LYDDataTypeWithMetadata
  | MADDataTypeWithMetadata
  | MDLDataTypeWithMetadata
  | MGADataTypeWithMetadata
  | MKDDataTypeWithMetadata
  | MMKDataTypeWithMetadata
  | MNTDataTypeWithMetadata
  | MOPDataTypeWithMetadata
  | MRUDataTypeWithMetadata
  | MURDataTypeWithMetadata
  | MVRDataTypeWithMetadata
  | MWKDataTypeWithMetadata
  | MYRDataTypeWithMetadata
  | MZNDataTypeWithMetadata
  | NADDataTypeWithMetadata
  | NGNDataTypeWithMetadata
  | NIODataTypeWithMetadata
  | NOKDataTypeWithMetadata
  | NPRDataTypeWithMetadata
  | NZDDataTypeWithMetadata
  | PABDataTypeWithMetadata
  | PGKDataTypeWithMetadata
  | PHPDataTypeWithMetadata
  | PKRDataTypeWithMetadata
  | PLNDataTypeWithMetadata
  | PYGDataTypeWithMetadata
  | RONDataTypeWithMetadata
  | RSDDataTypeWithMetadata
  | RWFDataTypeWithMetadata
  | SARDataTypeWithMetadata
  | SBDDataTypeWithMetadata
  | SCRDataTypeWithMetadata
  | SDGDataTypeWithMetadata
  | SEKDataTypeWithMetadata
  | SHPDataTypeWithMetadata
  | SLEDataTypeWithMetadata
  | SOSDataTypeWithMetadata
  | SRDDataTypeWithMetadata
  | SSPDataTypeWithMetadata
  | STNDataTypeWithMetadata
  | SVCDataTypeWithMetadata
  | SYPDataTypeWithMetadata
  | SZLDataTypeWithMetadata
  | THBDataTypeWithMetadata
  | TJSDataTypeWithMetadata
  | TMTDataTypeWithMetadata
  | TNDDataTypeWithMetadata
  | TOPDataTypeWithMetadata
  | TRYDataTypeWithMetadata
  | TTDDataTypeWithMetadata
  | TWDDataTypeWithMetadata
  | TZSDataTypeWithMetadata
  | UGXDataTypeWithMetadata
  | UYUDataTypeWithMetadata
  | UZSDataTypeWithMetadata
  | VESDataTypeWithMetadata
  | VNDDataTypeWithMetadata
  | VUVDataTypeWithMetadata
  | WSTDataTypeWithMetadata
  | XAFDataTypeWithMetadata
  | XCDDataTypeWithMetadata
  | XCGDataTypeWithMetadata
  | XOFDataTypeWithMetadata
  | XPFDataTypeWithMetadata
  | YERDataTypeWithMetadata
  | ZMWDataTypeWithMetadata
  | ZWGDataTypeWithMetadata;

/**
 * The weight of an object excluding its packaging or container.
 */
export type NetWeightPropertyValue = KilogramsDataType;

export type NetWeightPropertyValueWithMetadata =
  | KilogramsDataTypeWithMetadata
  | GramsDataTypeWithMetadata
  | MetricTonnesDataTypeWithMetadata
  | PoundsDataTypeWithMetadata;

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
 * An amount denominated in Rial Omani (ISO 4217 OMR).
 */
export type OMRDataType = CurrencyDataType;

export type OMRDataTypeWithMetadata = {
  value: OMRDataType;
  metadata: OMRDataTypeMetadata;
};
export type OMRDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/omr/v/1";
};

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
 * The material that something is made up of.
 */
export type OfMaterial = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/of-material/v/1"];
  properties: OfMaterialProperties;
  propertiesWithMetadata: OfMaterialPropertiesWithMetadata;
};

export type OfMaterialOutgoingLinkAndTarget = never;

export type OfMaterialOutgoingLinksByLinkEntityTypeId = {};

/**
 * The material that something is made up of.
 */
export type OfMaterialProperties = LinkProperties & {};

export type OfMaterialPropertiesWithMetadata = LinkPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * The date on which an order or purchasing document was created.
 */
export type OrderDatePropertyValue = DateDataType;

export type OrderDatePropertyValueWithMetadata = DateDataTypeWithMetadata;

/**
 * The quantity ordered.
 */
export type OrderQuantityPropertyValue = KilogramsDataType;

export type OrderQuantityPropertyValueWithMetadata =
  KilogramsDataTypeWithMetadata;

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
 * An amount denominated in Balboa (ISO 4217 PAB).
 */
export type PABDataType = CurrencyDataType;

export type PABDataTypeWithMetadata = {
  value: PABDataType;
  metadata: PABDataTypeMetadata;
};
export type PABDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/pab/v/1";
};

/**
 * An amount denominated in Sol (ISO 4217 PEN).
 */
export type PENDataType = CurrencyDataType;

export type PENDataTypeWithMetadata = {
  value: PENDataType;
  metadata: PENDataTypeMetadata;
};
export type PENDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/pen/v/1";
};

/**
 * An amount denominated in Kina (ISO 4217 PGK).
 */
export type PGKDataType = CurrencyDataType;

export type PGKDataTypeWithMetadata = {
  value: PGKDataType;
  metadata: PGKDataTypeMetadata;
};
export type PGKDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/pgk/v/1";
};

/**
 * An amount denominated in Philippine Peso (ISO 4217 PHP).
 */
export type PHPDataType = CurrencyDataType;

export type PHPDataTypeWithMetadata = {
  value: PHPDataType;
  metadata: PHPDataTypeMetadata;
};
export type PHPDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/php/v/1";
};

/**
 * An amount denominated in Pakistan Rupee (ISO 4217 PKR).
 */
export type PKRDataType = CurrencyDataType;

export type PKRDataTypeWithMetadata = {
  value: PKRDataType;
  metadata: PKRDataTypeMetadata;
};
export type PKRDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/pkr/v/1";
};

/**
 * An amount denominated in Zloty (ISO 4217 PLN).
 */
export type PLNDataType = CurrencyDataType;

export type PLNDataTypeWithMetadata = {
  value: PLNDataType;
  metadata: PLNDataTypeMetadata;
};
export type PLNDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/pln/v/1";
};

/**
 * An amount denominated in Guarani (ISO 4217 PYG).
 */
export type PYGDataType = CurrencyDataType;

export type PYGDataTypeWithMetadata = {
  value: PYGDataType;
  metadata: PYGDataTypeMetadata;
};
export type PYGDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/pyg/v/1";
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
 * A measure of the proportion of a whole.
 */
export type PercentageDataType = NumberDataType;

export type PercentageDataTypeWithMetadata = {
  value: PercentageDataType;
  metadata: PercentageDataTypeMetadata;
};
export type PercentageDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/percentage/v/1";
};

/**
 * An individual, typically characterized by self-awareness, reasoning, and the capacity for relationships and culture.
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
 * An individual, typically characterized by self-awareness, reasoning, and the capacity for relationships and culture.
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
 * The date on which goods were picked.
 */
export type PickingDatePropertyValue = DateDataType;

export type PickingDatePropertyValueWithMetadata = DateDataTypeWithMetadata;

/**
 * The base URL of a pinned entity type.
 */
export type PinnedEntityTypeBaseURLPropertyValue = URIDataType;

export type PinnedEntityTypeBaseURLPropertyValueWithMetadata =
  URIDataTypeWithMetadata;

/**
 * The planned date on which goods are issued.
 */
export type PlannedGoodsIssueDatePropertyValue = DateDataType;

export type PlannedGoodsIssueDatePropertyValueWithMetadata =
  DateDataTypeWithMetadata;

/**
 * A code used by postal services to identify a geographic area for sorting and delivery of mail.
 */
export type PostalCodePropertyValue = TextDataType;

export type PostalCodePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * An imperial unit of mass equal to exactly 0.45359237 kilograms.
 */
export type PoundsDataType = MassDataType;

export type PoundsDataTypeWithMetadata = {
  value: PoundsDataType;
  metadata: PoundsDataTypeMetadata;
};
export type PoundsDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/pounds/v/1";
};

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
 * How a material is procured, such as in-house production or external procurement.
 */
export type ProcurementTypePropertyValue = TextDataType;

export type ProcurementTypePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * Something procured by something.
 */
export type Procures = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/procures/v/1"];
  properties: ProcuresProperties;
  propertiesWithMetadata: ProcuresPropertiesWithMetadata;
};

export type ProcuresOutgoingLinkAndTarget = never;

export type ProcuresOutgoingLinksByLinkEntityTypeId = {};

/**
 * Something procured by something.
 */
export type ProcuresProperties = LinkProperties & {};

export type ProcuresPropertiesWithMetadata = LinkPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * Something produced by something.
 */
export type Produces = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/produces/v/1"];
  properties: ProducesProperties;
  propertiesWithMetadata: ProducesPropertiesWithMetadata;
};

export type ProducesOutgoingLinkAndTarget = never;

export type ProducesOutgoingLinksByLinkEntityTypeId = {};

/**
 * Something produced by something.
 */
export type ProducesProperties = LinkProperties & {};

export type ProducesPropertiesWithMetadata = LinkPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * An order to manufacture a material.
 */
export type ProductionOrder = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/production-order/v/1"];
  properties: ProductionOrderProperties;
  propertiesWithMetadata: ProductionOrderPropertiesWithMetadata;
};

export type ProductionOrderHasLineItemLink = {
  linkEntity: HasLineItem;
  rightEntity: ProductionOrderItem;
};

/**
 * A line item within a production order.
 */
export type ProductionOrderItem = {
  entityTypeIds: [
    "https://hash.ai/@h/types/entity-type/production-order-item/v/1",
  ];
  properties: ProductionOrderItemProperties;
  propertiesWithMetadata: ProductionOrderItemPropertiesWithMetadata;
};

export type ProductionOrderItemLocatedAtLink = {
  linkEntity: LocatedAt;
  rightEntity: Site;
};

export type ProductionOrderItemOutgoingLinkAndTarget =
  | ProductionOrderItemLocatedAtLink
  | ProductionOrderItemProducesLink;

export type ProductionOrderItemOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@h/types/entity-type/located-at/v/1": ProductionOrderItemLocatedAtLink;
  "https://hash.ai/@h/types/entity-type/produces/v/1": ProductionOrderItemProducesLink;
};

export type ProductionOrderItemProducesLink = {
  linkEntity: Produces;
  rightEntity: Material;
};

/**
 * A line item within a production order.
 */
export type ProductionOrderItemProperties = {
  "https://hash.ai/@h/types/property-type/goods-receipt-quantity/"?: GoodsReceiptQuantityPropertyValue;
  "https://hash.ai/@h/types/property-type/item-number/"?: ItemNumberPropertyValue;
  "https://hash.ai/@h/types/property-type/production-quantity/"?: ProductionQuantityPropertyValue;
};

export type ProductionOrderItemPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/goods-receipt-quantity/"?: GoodsReceiptQuantityPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/item-number/"?: ItemNumberPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/production-quantity/"?: ProductionQuantityPropertyValueWithMetadata;
  };
};

/**
 * The production order number.
 */
export type ProductionOrderNumberPropertyValue = TextDataType;

export type ProductionOrderNumberPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

export type ProductionOrderOutgoingLinkAndTarget =
  | ProductionOrderHasLineItemLink
  | ProductionOrderYieldsLink;

export type ProductionOrderOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@h/types/entity-type/has-line-item/v/1": ProductionOrderHasLineItemLink;
  "https://hash.ai/@h/types/entity-type/yields/v/1": ProductionOrderYieldsLink;
};

/**
 * An order to manufacture a material.
 */
export type ProductionOrderProperties = {
  "https://hash.ai/@h/types/property-type/actual-finish-date/"?: ActualFinishDatePropertyValue;
  "https://hash.ai/@h/types/property-type/actual-start-date/"?: ActualStartDatePropertyValue;
  "https://hash.ai/@h/types/property-type/alternative-bom/"?: AlternativeBOMPropertyValue;
  "https://hash.ai/@h/types/property-type/production-order-number/"?: ProductionOrderNumberPropertyValue;
  "https://hash.ai/@h/types/property-type/production-order-type/"?: ProductionOrderTypePropertyValue;
  "https://hash.ai/@h/types/property-type/release-date/"?: ReleaseDatePropertyValue;
  "https://hash.ai/@h/types/property-type/scheduled-finish-date/"?: ScheduledFinishDatePropertyValue;
  "https://hash.ai/@h/types/property-type/scheduled-start-date/"?: ScheduledStartDatePropertyValue;
};

export type ProductionOrderPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/actual-finish-date/"?: ActualFinishDatePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/actual-start-date/"?: ActualStartDatePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/alternative-bom/"?: AlternativeBOMPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/production-order-number/"?: ProductionOrderNumberPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/production-order-type/"?: ProductionOrderTypePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/release-date/"?: ReleaseDatePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/scheduled-finish-date/"?: ScheduledFinishDatePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/scheduled-start-date/"?: ScheduledStartDatePropertyValueWithMetadata;
  };
};

/**
 * The category of production order, such as a standard or process order.
 */
export type ProductionOrderTypePropertyValue = TextDataType;

export type ProductionOrderTypePropertyValueWithMetadata =
  TextDataTypeWithMetadata;

export type ProductionOrderYieldsLink = {
  linkEntity: Yields;
  rightEntity: Batch;
};

/**
 * The quantity to be produced.
 */
export type ProductionQuantityPropertyValue = KilogramsDataType;

export type ProductionQuantityPropertyValueWithMetadata =
  KilogramsDataTypeWithMetadata;

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
export type PublicationYearPropertyValue = CalendarYearDataType;

export type PublicationYearPropertyValueWithMetadata =
  CalendarYearDataTypeWithMetadata;

/**
 * A script written in the Python programming language.
 */
export type PythonScriptPropertyValue = TextDataType;

export type PythonScriptPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A line item within a purchase order.
 */
export type PurchaseOrderItem = {
  entityTypeIds: [
    "https://hash.ai/@h/types/entity-type/purchase-order-item/v/1",
  ];
  properties: PurchaseOrderItemProperties;
  propertiesWithMetadata: PurchaseOrderItemPropertiesWithMetadata;
};

export type PurchaseOrderItemHasLineItemLink = {
  linkEntity: HasLineItem;
  rightEntity: PurchaseOrderScheduleLine;
};

export type PurchaseOrderItemLocatedAtLink = {
  linkEntity: LocatedAt;
  rightEntity: Site;
};

/**
 * The purchase order item number.
 */
export type PurchaseOrderItemNumberPropertyValue = TextDataType;

export type PurchaseOrderItemNumberPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

export type PurchaseOrderItemOutgoingLinkAndTarget =
  | PurchaseOrderItemHasLineItemLink
  | PurchaseOrderItemLocatedAtLink
  | PurchaseOrderItemProcuresLink;

export type PurchaseOrderItemOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@h/types/entity-type/has-line-item/v/1": PurchaseOrderItemHasLineItemLink;
  "https://hash.ai/@h/types/entity-type/located-at/v/1": PurchaseOrderItemLocatedAtLink;
  "https://hash.ai/@h/types/entity-type/procures/v/1": PurchaseOrderItemProcuresLink;
};

export type PurchaseOrderItemProcuresLink = {
  linkEntity: Procures;
  rightEntity: Material;
};

/**
 * A line item within a purchase order.
 */
export type PurchaseOrderItemProperties = {
  "https://hash.ai/@h/types/property-type/item-number/"?: ItemNumberPropertyValue;
  "https://hash.ai/@h/types/property-type/net-value/"?: NetValuePropertyValue;
  "https://hash.ai/@h/types/property-type/order-quantity/"?: OrderQuantityPropertyValue;
  "https://hash.ai/@h/types/property-type/purchase-order-item-number/"?: PurchaseOrderItemNumberPropertyValue;
  "https://hash.ai/@h/types/property-type/unit-of-measure/"?: UnitOfMeasurePropertyValue;
};

export type PurchaseOrderItemPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/item-number/"?: ItemNumberPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/net-value/"?: NetValuePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/order-quantity/"?: OrderQuantityPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/purchase-order-item-number/"?: PurchaseOrderItemNumberPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/unit-of-measure/"?: UnitOfMeasurePropertyValueWithMetadata;
  };
};

/**
 * The purchase order number.
 */
export type PurchaseOrderNumberPropertyValue = TextDataType;

export type PurchaseOrderNumberPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * A delivery schedule line within a purchase order item.
 */
export type PurchaseOrderScheduleLine = {
  entityTypeIds: [
    "https://hash.ai/@h/types/entity-type/purchase-order-schedule-line/v/1",
  ];
  properties: PurchaseOrderScheduleLineProperties;
  propertiesWithMetadata: PurchaseOrderScheduleLinePropertiesWithMetadata;
};

export type PurchaseOrderScheduleLineOutgoingLinkAndTarget = never;

export type PurchaseOrderScheduleLineOutgoingLinksByLinkEntityTypeId = {};

/**
 * A delivery schedule line within a purchase order item.
 */
export type PurchaseOrderScheduleLineProperties = {
  "https://hash.ai/@h/types/property-type/goods-receipt-quantity/"?: GoodsReceiptQuantityPropertyValue;
  "https://hash.ai/@h/types/property-type/schedule-line-number/"?: ScheduleLineNumberPropertyValue;
  "https://hash.ai/@h/types/property-type/scheduled-delivery-date/"?: ScheduledDeliveryDatePropertyValue;
  "https://hash.ai/@h/types/property-type/scheduled-quantity/"?: ScheduledQuantityPropertyValue;
  "https://hash.ai/@h/types/property-type/statistics-relevant-delivery-date/"?: StatisticsRelevantDeliveryDatePropertyValue;
};

export type PurchaseOrderScheduleLinePropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/goods-receipt-quantity/"?: GoodsReceiptQuantityPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/schedule-line-number/"?: ScheduleLineNumberPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/scheduled-delivery-date/"?: ScheduledDeliveryDatePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/scheduled-quantity/"?: ScheduledQuantityPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/statistics-relevant-delivery-date/"?: StatisticsRelevantDeliveryDatePropertyValueWithMetadata;
  };
};

/**
 * The organizational unit responsible for purchasing goods or services.
 */
export type PurchasingOrganizationPropertyValue = TextDataType;

export type PurchasingOrganizationPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * An amount denominated in Qatari Rial (ISO 4217 QAR).
 */
export type QARDataType = CurrencyDataType;

export type QARDataTypeWithMetadata = {
  value: QARDataType;
  metadata: QARDataTypeMetadata;
};
export type QARDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/qar/v/1";
};

/**
 * An amount denominated in Romanian Leu (ISO 4217 RON).
 */
export type RONDataType = CurrencyDataType;

export type RONDataTypeWithMetadata = {
  value: RONDataType;
  metadata: RONDataTypeMetadata;
};
export type RONDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/ron/v/1";
};

/**
 * An amount denominated in Serbian Dinar (ISO 4217 RSD).
 */
export type RSDDataType = CurrencyDataType;

export type RSDDataTypeWithMetadata = {
  value: RSDDataType;
  metadata: RSDDataTypeMetadata;
};
export type RSDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/rsd/v/1";
};

/**
 * An amount denominated in Russian Ruble (ISO 4217 RUB).
 */
export type RUBDataType = CurrencyDataType;

export type RUBDataTypeWithMetadata = {
  value: RUBDataType;
  metadata: RUBDataTypeMetadata;
};
export type RUBDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/rub/v/1";
};

/**
 * An amount denominated in Rwanda Franc (ISO 4217 RWF).
 */
export type RWFDataType = CurrencyDataType;

export type RWFDataTypeWithMetadata = {
  value: RWFDataType;
  metadata: RWFDataTypeMetadata;
};
export type RWFDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/rwf/v/1";
};

/**
 * The timestamp of when something was read.
 */
export type ReadAtPropertyValue = DateTimeDataType;

export type ReadAtPropertyValueWithMetadata = DateTimeDataTypeWithMetadata;

/**
 * A region, state, province, or other administrative subdivision of a country.
 */
export type RegionPropertyValue = TextDataType;

export type RegionPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A unique alphanumeric code assigned to an aircraft, also known as a tail number (e.g. 'N123AB').
 */
export type RegistrationNumberPropertyValue = TextDataType;

export type RegistrationNumberPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * The reason something was rejected.
 */
export type RejectionReasonPropertyValue = TextDataType;

export type RejectionReasonPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The date on which an order or document was released.
 */
export type ReleaseDatePropertyValue = DateDataType;

export type ReleaseDatePropertyValueWithMetadata = DateDataTypeWithMetadata;

/**
 * The delivery date requested by the customer.
 */
export type RequestedDeliveryDatePropertyValue = DateDataType;

export type RequestedDeliveryDatePropertyValueWithMetadata =
  DateDataTypeWithMetadata;

/**
 * Stringified timestamp of when something was resolved.
 */
export type ResolvedAtPropertyValue = DateTimeDataType;

export type ResolvedAtPropertyValueWithMetadata = DateTimeDataTypeWithMetadata;

/**
 * The transport route or route code.
 */
export type RoutePropertyValue = TextDataType;

export type RoutePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * An amount denominated in Saudi Riyal (ISO 4217 SAR).
 */
export type SARDataType = CurrencyDataType;

export type SARDataTypeWithMetadata = {
  value: SARDataType;
  metadata: SARDataTypeMetadata;
};
export type SARDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/sar/v/1";
};

/**
 * An amount denominated in Solomon Islands Dollar (ISO 4217 SBD).
 */
export type SBDDataType = CurrencyDataType;

export type SBDDataTypeWithMetadata = {
  value: SBDDataType;
  metadata: SBDDataTypeMetadata;
};
export type SBDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/sbd/v/1";
};

/**
 * An amount denominated in Seychelles Rupee (ISO 4217 SCR).
 */
export type SCRDataType = CurrencyDataType;

export type SCRDataTypeWithMetadata = {
  value: SCRDataType;
  metadata: SCRDataTypeMetadata;
};
export type SCRDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/scr/v/1";
};

/**
 * An amount denominated in Sudanese Pound (ISO 4217 SDG).
 */
export type SDGDataType = CurrencyDataType;

export type SDGDataTypeWithMetadata = {
  value: SDGDataType;
  metadata: SDGDataTypeMetadata;
};
export type SDGDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/sdg/v/1";
};

/**
 * An amount denominated in Swedish Krona (ISO 4217 SEK).
 */
export type SEKDataType = CurrencyDataType;

export type SEKDataTypeWithMetadata = {
  value: SEKDataType;
  metadata: SEKDataTypeMetadata;
};
export type SEKDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/sek/v/1";
};

/**
 * An amount denominated in Singapore Dollar (ISO 4217 SGD).
 */
export type SGDDataType = CurrencyDataType;

export type SGDDataTypeWithMetadata = {
  value: SGDDataType;
  metadata: SGDDataTypeMetadata;
};
export type SGDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/sgd/v/1";
};

/**
 * An amount denominated in Saint Helena Pound (ISO 4217 SHP).
 */
export type SHPDataType = CurrencyDataType;

export type SHPDataTypeWithMetadata = {
  value: SHPDataType;
  metadata: SHPDataTypeMetadata;
};
export type SHPDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/shp/v/1";
};

/**
 * An amount denominated in Leone (ISO 4217 SLE).
 */
export type SLEDataType = CurrencyDataType;

export type SLEDataTypeWithMetadata = {
  value: SLEDataType;
  metadata: SLEDataTypeMetadata;
};
export type SLEDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/sle/v/1";
};

/**
 * An amount denominated in Somali Shilling (ISO 4217 SOS).
 */
export type SOSDataType = CurrencyDataType;

export type SOSDataTypeWithMetadata = {
  value: SOSDataType;
  metadata: SOSDataTypeMetadata;
};
export type SOSDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/sos/v/1";
};

/**
 * An amount denominated in Surinam Dollar (ISO 4217 SRD).
 */
export type SRDDataType = CurrencyDataType;

export type SRDDataTypeWithMetadata = {
  value: SRDDataType;
  metadata: SRDDataTypeMetadata;
};
export type SRDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/srd/v/1";
};

/**
 * An amount denominated in South Sudanese Pound (ISO 4217 SSP).
 */
export type SSPDataType = CurrencyDataType;

export type SSPDataTypeWithMetadata = {
  value: SSPDataType;
  metadata: SSPDataTypeMetadata;
};
export type SSPDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/ssp/v/1";
};

/**
 * An amount denominated in Dobra (ISO 4217 STN).
 */
export type STNDataType = CurrencyDataType;

export type STNDataTypeWithMetadata = {
  value: STNDataType;
  metadata: STNDataTypeMetadata;
};
export type STNDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/stn/v/1";
};

/**
 * An amount denominated in El Salvador Colon (ISO 4217 SVC).
 */
export type SVCDataType = CurrencyDataType;

export type SVCDataTypeWithMetadata = {
  value: SVCDataType;
  metadata: SVCDataTypeMetadata;
};
export type SVCDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/svc/v/1";
};

/**
 * An amount denominated in Syrian Pound (ISO 4217 SYP).
 */
export type SYPDataType = CurrencyDataType;

export type SYPDataTypeWithMetadata = {
  value: SYPDataType;
  metadata: SYPDataTypeMetadata;
};
export type SYPDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/syp/v/1";
};

/**
 * An amount denominated in Lilangeni (ISO 4217 SZL).
 */
export type SZLDataType = CurrencyDataType;

export type SZLDataTypeWithMetadata = {
  value: SZLDataType;
  metadata: SZLDataTypeMetadata;
};
export type SZLDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/szl/v/1";
};

/**
 * The category of sales document, such as an order, return, or quotation.
 */
export type SalesDocumentTypePropertyValue = TextDataType;

export type SalesDocumentTypePropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * A commitment by a customer to purchase goods or services on agreed terms.
 */
export type SalesOrder = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/sales-order/v/1"];
  properties: SalesOrderProperties;
  propertiesWithMetadata: SalesOrderPropertiesWithMetadata;
};

export type SalesOrderHasCustomerLink = {
  linkEntity: HasCustomer;
  rightEntity: Customer;
};

export type SalesOrderHasLineItemLink = {
  linkEntity: HasLineItem;
  rightEntity: SalesOrderItem;
};

/**
 * A line item within a sales order.
 */
export type SalesOrderItem = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/sales-order-item/v/1"];
  properties: SalesOrderItemProperties;
  propertiesWithMetadata: SalesOrderItemPropertiesWithMetadata;
};

export type SalesOrderItemHasMaterialLink = {
  linkEntity: HasMaterial;
  rightEntity: Material;
};

export type SalesOrderItemLocatedAtLink = {
  linkEntity: LocatedAt;
  rightEntity: Site;
};

export type SalesOrderItemOutgoingLinkAndTarget =
  | SalesOrderItemHasMaterialLink
  | SalesOrderItemLocatedAtLink;

export type SalesOrderItemOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@h/types/entity-type/has-material/v/1": SalesOrderItemHasMaterialLink;
  "https://hash.ai/@h/types/entity-type/located-at/v/1": SalesOrderItemLocatedAtLink;
};

/**
 * A line item within a sales order.
 */
export type SalesOrderItemProperties = {
  "https://hash.ai/@h/types/property-type/item-number/"?: ItemNumberPropertyValue;
  "https://hash.ai/@h/types/property-type/line-item-category/"?: LineItemCategoryPropertyValue;
  "https://hash.ai/@h/types/property-type/net-value/"?: NetValuePropertyValue;
  "https://hash.ai/@h/types/property-type/order-quantity/"?: OrderQuantityPropertyValue;
  "https://hash.ai/@h/types/property-type/rejection-reason/"?: RejectionReasonPropertyValue;
};

export type SalesOrderItemPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/item-number/"?: ItemNumberPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/line-item-category/"?: LineItemCategoryPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/net-value/"?: NetValuePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/order-quantity/"?: OrderQuantityPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/rejection-reason/"?: RejectionReasonPropertyValueWithMetadata;
  };
};

/**
 * The sales order number.
 */
export type SalesOrderNumberPropertyValue = TextDataType;

export type SalesOrderNumberPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

export type SalesOrderOutgoingLinkAndTarget =
  | SalesOrderHasCustomerLink
  | SalesOrderHasLineItemLink;

export type SalesOrderOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@h/types/entity-type/has-customer/v/1": SalesOrderHasCustomerLink;
  "https://hash.ai/@h/types/entity-type/has-line-item/v/1": SalesOrderHasLineItemLink;
};

/**
 * A commitment by a customer to purchase goods or services on agreed terms.
 */
export type SalesOrderProperties = {
  "https://hash.ai/@h/types/property-type/currency-code/"?: CurrencyCodePropertyValue;
  "https://hash.ai/@h/types/property-type/customer-reference/"?: CustomerReferencePropertyValue;
  "https://hash.ai/@h/types/property-type/distribution-channel/"?: DistributionChannelPropertyValue;
  "https://hash.ai/@h/types/property-type/division/"?: DivisionPropertyValue;
  "https://hash.ai/@h/types/property-type/net-value/"?: NetValuePropertyValue;
  "https://hash.ai/@h/types/property-type/order-date/"?: OrderDatePropertyValue;
  "https://hash.ai/@h/types/property-type/requested-delivery-date/"?: RequestedDeliveryDatePropertyValue;
  "https://hash.ai/@h/types/property-type/sales-document-type/"?: SalesDocumentTypePropertyValue;
  "https://hash.ai/@h/types/property-type/sales-order-number/"?: SalesOrderNumberPropertyValue;
  "https://hash.ai/@h/types/property-type/sales-organization/"?: SalesOrganizationPropertyValue;
};

export type SalesOrderPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/currency-code/"?: CurrencyCodePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/customer-reference/"?: CustomerReferencePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/distribution-channel/"?: DistributionChannelPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/division/"?: DivisionPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/net-value/"?: NetValuePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/order-date/"?: OrderDatePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/requested-delivery-date/"?: RequestedDeliveryDatePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/sales-document-type/"?: SalesDocumentTypePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/sales-order-number/"?: SalesOrderNumberPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/sales-organization/"?: SalesOrganizationPropertyValueWithMetadata;
  };
};

/**
 * The organizational unit responsible for selling goods or services.
 */
export type SalesOrganizationPropertyValue = TextDataType;

export type SalesOrganizationPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

/**
 * How far back to catch up missed runs after downtime.
 */
export type ScheduleCatchupWindowPropertyValue = MillisecondDataType;

export type ScheduleCatchupWindowPropertyValueWithMetadata =
  MillisecondDataTypeWithMetadata;

/**
 * The number identifying a schedule line.
 */
export type ScheduleLineNumberPropertyValue = TextDataType;

export type ScheduleLineNumberPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

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
 * The date on which delivery is scheduled or promised.
 */
export type ScheduledDeliveryDatePropertyValue = DateDataType;

export type ScheduledDeliveryDatePropertyValueWithMetadata =
  DateDataTypeWithMetadata;

/**
 * The date on which an activity is scheduled to finish.
 */
export type ScheduledFinishDatePropertyValue = DateDataType;

export type ScheduledFinishDatePropertyValueWithMetadata =
  DateDataTypeWithMetadata;

/**
 * The quantity scheduled for delivery.
 */
export type ScheduledQuantityPropertyValue = KilogramsDataType;

export type ScheduledQuantityPropertyValueWithMetadata =
  | KilogramsDataTypeWithMetadata
  | GramsDataTypeWithMetadata
  | MetricTonnesDataTypeWithMetadata
  | PoundsDataTypeWithMetadata
  | LitresDataTypeWithMetadata
  | MillilitresDataTypeWithMetadata
  | CubicMetresDataTypeWithMetadata
  | CubicFeetDataTypeWithMetadata
  | MetersDataTypeWithMetadata
  | CentimetersDataTypeWithMetadata
  | MillimetersDataTypeWithMetadata
  | KilometersDataTypeWithMetadata
  | FeetDataTypeWithMetadata
  | InchesDataTypeWithMetadata
  | YardsDataTypeWithMetadata
  | MilesDataTypeWithMetadata
  | SquareMetresDataTypeWithMetadata
  | SquareCentimetresDataTypeWithMetadata
  | SquareFeetDataTypeWithMetadata
  | HoursDataTypeWithMetadata
  | DaysDataTypeWithMetadata
  | UnitDataTypeWithMetadata;

/**
 * The date on which an activity is scheduled to start.
 */
export type ScheduledStartDatePropertyValue = DateDataType;

export type ScheduledStartDatePropertyValueWithMetadata =
  DateDataTypeWithMetadata;

/**
 * The expected percentage of a component lost as scrap.
 */
export type ScrapPercentagePropertyValue = PercentageDataType;

export type ScrapPercentagePropertyValueWithMetadata =
  PercentageDataTypeWithMetadata;

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
 * A line within a shipment, linking it to a delivery being transported.
 */
export type ShipmentItem = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/shipment-item/v/1"];
  properties: ShipmentItemProperties;
  propertiesWithMetadata: ShipmentItemPropertiesWithMetadata;
};

/**
 * The item number of a line within a shipment.
 */
export type ShipmentItemNumberPropertyValue = TextDataType;

export type ShipmentItemNumberPropertyValueWithMetadata =
  TextDataTypeWithMetadata;

export type ShipmentItemOutgoingLinkAndTarget = ShipmentItemTransportsLink;

export type ShipmentItemOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@h/types/entity-type/transports/v/1": ShipmentItemTransportsLink;
};

/**
 * A line within a shipment, linking it to a delivery being transported.
 */
export type ShipmentItemProperties = {
  "https://hash.ai/@h/types/property-type/delivery-number/"?: DeliveryNumberPropertyValue;
  "https://hash.ai/@h/types/property-type/shipment-item-number/"?: ShipmentItemNumberPropertyValue;
};

export type ShipmentItemPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/delivery-number/"?: DeliveryNumberPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/shipment-item-number/"?: ShipmentItemNumberPropertyValueWithMetadata;
  };
};

export type ShipmentItemTransportsLink = {
  linkEntity: Transports;
  rightEntity: Delivery;
};

/**
 * The shipping point responsible for outbound delivery processing.
 */
export type ShippingPointPropertyValue = TextDataType;

export type ShippingPointPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A unique identifier for something, in the form of a slug
 */
export type ShortnamePropertyValue = TextDataType;

export type ShortnamePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A physical site, such as a plant, warehouse, or distribution hub, where goods are produced, stored, or shipped.
 */
export type Site = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/site/v/1"];
  properties: SiteProperties;
  propertiesWithMetadata: SitePropertiesWithMetadata;
};

/**
 * A code identifying a site, facility, plant etc.
 */
export type SiteCodePropertyValue = TextDataType;

export type SiteCodePropertyValueWithMetadata = TextDataTypeWithMetadata;

export type SiteOutgoingLinkAndTarget = never;

export type SiteOutgoingLinksByLinkEntityTypeId = {};

/**
 * A physical site, such as a plant, warehouse, or distribution hub, where goods are produced, stored, or shipped.
 */
export type SiteProperties = {
  "https://blockprotocol.org/@blockprotocol/types/property-type/name/"?: NamePropertyValue;
  "https://hash.ai/@h/types/property-type/city/"?: CityPropertyValue;
  "https://hash.ai/@h/types/property-type/country/"?: CountryPropertyValue;
  "https://hash.ai/@h/types/property-type/postal-code/"?: PostalCodePropertyValue;
  "https://hash.ai/@h/types/property-type/purchasing-organization/"?: PurchasingOrganizationPropertyValue;
  "https://hash.ai/@h/types/property-type/region/"?: RegionPropertyValue;
  "https://hash.ai/@h/types/property-type/sales-organization/"?: SalesOrganizationPropertyValue;
  "https://hash.ai/@h/types/property-type/shipping-point/"?: ShippingPointPropertyValue;
  "https://hash.ai/@h/types/property-type/site-code/"?: SiteCodePropertyValue;
  "https://hash.ai/@h/types/property-type/site-type/"?: SiteTypePropertyValue;
  "https://hash.ai/@h/types/property-type/storage-bin/"?: StorageBinPropertyValue;
  "https://hash.ai/@h/types/property-type/storage-location/"?: StorageLocationPropertyValue;
  "https://hash.ai/@h/types/property-type/street-address/"?: StreetAddressPropertyValue;
};

export type SitePropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/name/"?: NamePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/city/"?: CityPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/country/"?: CountryPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/postal-code/"?: PostalCodePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/purchasing-organization/"?: PurchasingOrganizationPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/region/"?: RegionPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/sales-organization/"?: SalesOrganizationPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/shipping-point/"?: ShippingPointPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/site-code/"?: SiteCodePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/site-type/"?: SiteTypePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/storage-bin/"?: StorageBinPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/storage-location/"?: StorageLocationPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/street-address/"?: StreetAddressPropertyValueWithMetadata;
  };
};

/**
 * The type of site, such as a production plant, warehouse, or distribution hub.
 */
export type SiteTypePropertyValue = TextDataType;

export type SiteTypePropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A metric unit of area equal to one ten-thousandth of a square metre.
 */
export type SquareCentimetresDataType = AreaDataType;

export type SquareCentimetresDataTypeWithMetadata = {
  value: SquareCentimetresDataType;
  metadata: SquareCentimetresDataTypeMetadata;
};
export type SquareCentimetresDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/square-centimetres/v/1";
};

/**
 * An imperial unit of area equal to a square one foot on each side.
 */
export type SquareFeetDataType = AreaDataType;

export type SquareFeetDataTypeWithMetadata = {
  value: SquareFeetDataType;
  metadata: SquareFeetDataTypeMetadata;
};
export type SquareFeetDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/square-feet/v/1";
};

/**
 * A metric unit of area equal to a square one metre on each side.
 */
export type SquareMetresDataType = AreaDataType;

export type SquareMetresDataTypeWithMetadata = {
  value: SquareMetresDataType;
  metadata: SquareMetresDataTypeMetadata;
};
export type SquareMetresDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/square-metres/v/1";
};

/**
 * A delivery date used for vendor evaluation or statistical reporting.
 */
export type StatisticsRelevantDeliveryDatePropertyValue = DateDataType;

export type StatisticsRelevantDeliveryDatePropertyValueWithMetadata =
  DateDataTypeWithMetadata;

/**
 * The status of something.
 */
export type StatusPropertyValue = TextDataType;

export type StatusPropertyValueWithMetadata = TextDataTypeWithMetadata;

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
 * The quantity of stock on hand.
 */
export type StockQuantityPropertyValue = KilogramsDataType;

export type StockQuantityPropertyValueWithMetadata =
  | KilogramsDataTypeWithMetadata
  | GramsDataTypeWithMetadata
  | MetricTonnesDataTypeWithMetadata
  | PoundsDataTypeWithMetadata
  | LitresDataTypeWithMetadata
  | MillilitresDataTypeWithMetadata
  | CubicMetresDataTypeWithMetadata
  | CubicFeetDataTypeWithMetadata
  | MetersDataTypeWithMetadata
  | CentimetersDataTypeWithMetadata
  | MillimetersDataTypeWithMetadata
  | KilometersDataTypeWithMetadata
  | FeetDataTypeWithMetadata
  | InchesDataTypeWithMetadata
  | YardsDataTypeWithMetadata
  | MilesDataTypeWithMetadata
  | SquareMetresDataTypeWithMetadata
  | SquareCentimetresDataTypeWithMetadata
  | SquareFeetDataTypeWithMetadata
  | HoursDataTypeWithMetadata
  | DaysDataTypeWithMetadata
  | UnitDataTypeWithMetadata;

/**
 * A specific bin or position within a storage location.
 */
export type StorageBinPropertyValue = TextDataType;

export type StorageBinPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A location within a site where goods are stored.
 */
export type StorageLocationPropertyValue = TextDataType;

export type StorageLocationPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The street name and number (with any additional detail) of a postal address.
 */
export type StreetAddressPropertyValue = TextDataType;

export type StreetAddressPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * The summary of the something.
 */
export type SummaryPropertyValue = TextDataType;

export type SummaryPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * An amount denominated in Baht (ISO 4217 THB).
 */
export type THBDataType = CurrencyDataType;

export type THBDataTypeWithMetadata = {
  value: THBDataType;
  metadata: THBDataTypeMetadata;
};
export type THBDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/thb/v/1";
};

/**
 * An amount denominated in Somoni (ISO 4217 TJS).
 */
export type TJSDataType = CurrencyDataType;

export type TJSDataTypeWithMetadata = {
  value: TJSDataType;
  metadata: TJSDataTypeMetadata;
};
export type TJSDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/tjs/v/1";
};

/**
 * An amount denominated in Turkmenistan New Manat (ISO 4217 TMT).
 */
export type TMTDataType = CurrencyDataType;

export type TMTDataTypeWithMetadata = {
  value: TMTDataType;
  metadata: TMTDataTypeMetadata;
};
export type TMTDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/tmt/v/1";
};

/**
 * An amount denominated in Tunisian Dinar (ISO 4217 TND).
 */
export type TNDDataType = CurrencyDataType;

export type TNDDataTypeWithMetadata = {
  value: TNDDataType;
  metadata: TNDDataTypeMetadata;
};
export type TNDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/tnd/v/1";
};

/**
 * An amount denominated in Pa'anga (ISO 4217 TOP).
 */
export type TOPDataType = CurrencyDataType;

export type TOPDataTypeWithMetadata = {
  value: TOPDataType;
  metadata: TOPDataTypeMetadata;
};
export type TOPDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/top/v/1";
};

/**
 * An amount denominated in Turkish Lira (ISO 4217 TRY).
 */
export type TRYDataType = CurrencyDataType;

export type TRYDataTypeWithMetadata = {
  value: TRYDataType;
  metadata: TRYDataTypeMetadata;
};
export type TRYDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/try/v/1";
};

/**
 * An amount denominated in Trinidad and Tobago Dollar (ISO 4217 TTD).
 */
export type TTDDataType = CurrencyDataType;

export type TTDDataTypeWithMetadata = {
  value: TTDDataType;
  metadata: TTDDataTypeMetadata;
};
export type TTDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/ttd/v/1";
};

/**
 * An amount denominated in New Taiwan Dollar (ISO 4217 TWD).
 */
export type TWDDataType = CurrencyDataType;

export type TWDDataTypeWithMetadata = {
  value: TWDDataType;
  metadata: TWDDataTypeMetadata;
};
export type TWDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/twd/v/1";
};

/**
 * An amount denominated in Tanzanian Shilling (ISO 4217 TZS).
 */
export type TZSDataType = CurrencyDataType;

export type TZSDataTypeWithMetadata = {
  value: TZSDataType;
  metadata: TZSDataTypeMetadata;
};
export type TZSDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/tzs/v/1";
};

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
 * Something transported by something.
 */
export type Transports = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/transports/v/1"];
  properties: TransportsProperties;
  propertiesWithMetadata: TransportsPropertiesWithMetadata;
};

export type TransportsOutgoingLinkAndTarget = never;

export type TransportsOutgoingLinksByLinkEntityTypeId = {};

/**
 * Something transported by something.
 */
export type TransportsProperties = LinkProperties & {};

export type TransportsPropertiesWithMetadata = LinkPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};

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
 * An amount denominated in Hryvnia (ISO 4217 UAH).
 */
export type UAHDataType = CurrencyDataType;

export type UAHDataTypeWithMetadata = {
  value: UAHDataType;
  metadata: UAHDataTypeMetadata;
};
export type UAHDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/uah/v/1";
};

/**
 * An amount denominated in Uganda Shilling (ISO 4217 UGX).
 */
export type UGXDataType = CurrencyDataType;

export type UGXDataTypeWithMetadata = {
  value: UGXDataType;
  metadata: UGXDataTypeMetadata;
};
export type UGXDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/ugx/v/1";
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
 * An amount denominated in US Dollar (ISO 4217 USD).
 */
export type USDDataType = CurrencyDataType;

export type USDDataTypeWithMetadata = {
  value: USDDataType;
  metadata: USDDataTypeMetadata;
};
export type USDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/usd/v/1";
};

/**
 * An amount denominated in Peso Uruguayo (ISO 4217 UYU).
 */
export type UYUDataType = CurrencyDataType;

export type UYUDataTypeWithMetadata = {
  value: UYUDataType;
  metadata: UYUDataTypeMetadata;
};
export type UYUDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/uyu/v/1";
};

/**
 * An amount denominated in Uzbekistan Sum (ISO 4217 UZS).
 */
export type UZSDataType = CurrencyDataType;

export type UZSDataTypeWithMetadata = {
  value: UZSDataType;
  metadata: UZSDataTypeMetadata;
};
export type UZSDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/uzs/v/1";
};

/**
 * A dimensionless quantity: a count of discrete items, or an amount whose unit of measure has no dedicated data type.
 */
export type UnitDataType = NumberDataType;

export type UnitDataTypeWithMetadata = {
  value: UnitDataType;
  metadata: UnitDataTypeMetadata;
};
export type UnitDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/unit/v/1";
};

/**
 * The base unit of measure declared for an item (e.g. each, kilograms, litres).
 */
export type UnitOfMeasurePropertyValue = TextDataType;

export type UnitOfMeasurePropertyValueWithMetadata = TextDataTypeWithMetadata;

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
 * An amount denominated in Bolivar Soberano (ISO 4217 VES).
 */
export type VESDataType = CurrencyDataType;

export type VESDataTypeWithMetadata = {
  value: VESDataType;
  metadata: VESDataTypeMetadata;
};
export type VESDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/ves/v/1";
};

/**
 * An amount denominated in Dong (ISO 4217 VND).
 */
export type VNDDataType = CurrencyDataType;

export type VNDDataTypeWithMetadata = {
  value: VNDDataType;
  metadata: VNDDataTypeMetadata;
};
export type VNDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/vnd/v/1";
};

/**
 * An amount denominated in Vatu (ISO 4217 VUV).
 */
export type VUVDataType = CurrencyDataType;

export type VUVDataTypeWithMetadata = {
  value: VUVDataType;
  metadata: VUVDataTypeMetadata;
};
export type VUVDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/vuv/v/1";
};

/**
 * The date from which a source-system record is valid.
 */
export type ValidFromDatePropertyValue = DateDataType;

export type ValidFromDatePropertyValueWithMetadata = DateDataTypeWithMetadata;

/**
 * A piece of data that can be used to convey information about an attribute, quality or state of something.
 */
export type ValueDataType = null | boolean | number | string | unknown[] | {};

export type ValueDataTypeWithMetadata = {
  value: ValueDataType;
  metadata: ValueDataTypeMetadata;
};
export type ValueDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://blockprotocol.org/@blockprotocol/types/data-type/value/v/1";
};

/**
 * The path to a secret in Hashicorp Vault.
 */
export type VaultPathPropertyValue = TextDataType;

export type VaultPathPropertyValueWithMetadata = TextDataTypeWithMetadata;

/**
 * A company that provides goods or services.
 */
export type Vendor = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/vendor/v/1"];
  properties: VendorProperties;
  propertiesWithMetadata: VendorPropertiesWithMetadata;
};

/**
 * The vendor account number.
 */
export type VendorNumberPropertyValue = TextDataType;

export type VendorNumberPropertyValueWithMetadata = TextDataTypeWithMetadata;

export type VendorOutgoingLinkAndTarget = never;

export type VendorOutgoingLinksByLinkEntityTypeId = {};

/**
 * A company that provides goods or services.
 */
export type VendorProperties = CompanyProperties & {
  "https://hash.ai/@h/types/property-type/vendor-number/"?: VendorNumberPropertyValue;
};

export type VendorPropertiesWithMetadata = CompanyPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/vendor-number/"?: VendorNumberPropertyValueWithMetadata;
  };
};

/**
 * A measure of the three-dimensional space occupied by something.
 */
export type VolumeDataType = NumberDataType;

export type VolumeDataTypeWithMetadata = {
  value: VolumeDataType;
  metadata: VolumeDataTypeMetadata;
};
export type VolumeDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/volume/v/1";
};

/**
 * An amount denominated in Tala (ISO 4217 WST).
 */
export type WSTDataType = CurrencyDataType;

export type WSTDataTypeWithMetadata = {
  value: WSTDataType;
  metadata: WSTDataTypeMetadata;
};
export type WSTDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/wst/v/1";
};

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
 * An amount denominated in CFA Franc BEAC (ISO 4217 XAF).
 */
export type XAFDataType = CurrencyDataType;

export type XAFDataTypeWithMetadata = {
  value: XAFDataType;
  metadata: XAFDataTypeMetadata;
};
export type XAFDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/xaf/v/1";
};

/**
 * An amount denominated in East Caribbean Dollar (ISO 4217 XCD).
 */
export type XCDDataType = CurrencyDataType;

export type XCDDataTypeWithMetadata = {
  value: XCDDataType;
  metadata: XCDDataTypeMetadata;
};
export type XCDDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/xcd/v/1";
};

/**
 * An amount denominated in Caribbean Guilder (ISO 4217 XCG).
 */
export type XCGDataType = CurrencyDataType;

export type XCGDataTypeWithMetadata = {
  value: XCGDataType;
  metadata: XCGDataTypeMetadata;
};
export type XCGDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/xcg/v/1";
};

/**
 * An amount denominated in CFA Franc BCEAO (ISO 4217 XOF).
 */
export type XOFDataType = CurrencyDataType;

export type XOFDataTypeWithMetadata = {
  value: XOFDataType;
  metadata: XOFDataTypeMetadata;
};
export type XOFDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/xof/v/1";
};

/**
 * An amount denominated in CFP Franc (ISO 4217 XPF).
 */
export type XPFDataType = CurrencyDataType;

export type XPFDataTypeWithMetadata = {
  value: XPFDataType;
  metadata: XPFDataTypeMetadata;
};
export type XPFDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/xpf/v/1";
};

/**
 * An amount denominated in Yemeni Rial (ISO 4217 YER).
 */
export type YERDataType = CurrencyDataType;

export type YERDataTypeWithMetadata = {
  value: YERDataType;
  metadata: YERDataTypeMetadata;
};
export type YERDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/yer/v/1";
};

/**
 * An imperial unit of length. 1,760 yards equals 1 mile. Equivalent to 0.9144 meters in the International System of Units (SI).
 */
export type YardsDataType = ImperialLengthUKDataType;

export type YardsDataTypeWithMetadata = {
  value: YardsDataType;
  metadata: YardsDataTypeMetadata;
};
export type YardsDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/yards/v/1";
};

/**
 * Something yielded by something.
 */
export type Yields = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/yields/v/1"];
  properties: YieldsProperties;
  propertiesWithMetadata: YieldsPropertiesWithMetadata;
};

export type YieldsOutgoingLinkAndTarget = never;

export type YieldsOutgoingLinksByLinkEntityTypeId = {};

/**
 * Something yielded by something.
 */
export type YieldsProperties = LinkProperties & {};

export type YieldsPropertiesWithMetadata = LinkPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * An amount denominated in Rand (ISO 4217 ZAR).
 */
export type ZARDataType = CurrencyDataType;

export type ZARDataTypeWithMetadata = {
  value: ZARDataType;
  metadata: ZARDataTypeMetadata;
};
export type ZARDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/zar/v/1";
};

/**
 * An amount denominated in Zambian Kwacha (ISO 4217 ZMW).
 */
export type ZMWDataType = CurrencyDataType;

export type ZMWDataTypeWithMetadata = {
  value: ZMWDataType;
  metadata: ZMWDataTypeMetadata;
};
export type ZMWDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/zmw/v/1";
};

/**
 * An amount denominated in Zimbabwe Gold (ISO 4217 ZWG).
 */
export type ZWGDataType = CurrencyDataType;

export type ZWGDataTypeWithMetadata = {
  value: ZWGDataType;
  metadata: ZWGDataTypeMetadata;
};
export type ZWGDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/zwg/v/1";
};
