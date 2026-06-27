/**
 * This file was automatically generated – do not edit it.
 */

import type {
  Aircraft,
  AircraftOutgoingLinkAndTarget,
  AircraftOutgoingLinksByLinkEntityTypeId,
  AircraftProperties,
  AircraftPropertiesWithMetadata,
  Airline,
  AirlineOutgoingLinkAndTarget,
  AirlineOutgoingLinksByLinkEntityTypeId,
  AirlineProperties,
  AirlinePropertiesWithMetadata,
  Airport,
  AirportOutgoingLinkAndTarget,
  AirportOutgoingLinksByLinkEntityTypeId,
  AirportProperties,
  AirportPropertiesWithMetadata,
  ArrivesAt,
  ArrivesAtOutgoingLinkAndTarget,
  ArrivesAtOutgoingLinksByLinkEntityTypeId,
  ArrivesAtProperties,
  ArrivesAtPropertiesWithMetadata,
  BooleanDataType,
  BooleanDataTypeWithMetadata,
  CityPropertyValue,
  CityPropertyValueWithMetadata,
  DateDataType,
  DateDataTypeWithMetadata,
  DepartsFrom,
  DepartsFromOutgoingLinkAndTarget,
  DepartsFromOutgoingLinksByLinkEntityTypeId,
  DepartsFromProperties,
  DepartsFromPropertiesWithMetadata,
  IATACodePropertyValue,
  IATACodePropertyValueWithMetadata,
  ICAOCodePropertyValue,
  ICAOCodePropertyValueWithMetadata,
  LengthDataType,
  LengthDataTypeWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  MetersDataType,
  MetersDataTypeWithMetadata,
  MetricLengthSIDataType,
  MetricLengthSIDataTypeWithMetadata,
  NamePropertyValue,
  NamePropertyValueWithMetadata,
  NumberDataType,
  NumberDataTypeWithMetadata,
  RegistrationNumberPropertyValue,
  RegistrationNumberPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  TimezonePropertyValue,
  TimezonePropertyValueWithMetadata,
  ValueDataType,
  ValueDataTypeWithMetadata,
} from "./shared.js";
import type {
  ArrayMetadata,
  Confidence,
  ObjectMetadata,
  PropertyProvenance,
} from "@blockprotocol/type-system";

export type {
  Aircraft,
  AircraftOutgoingLinkAndTarget,
  AircraftOutgoingLinksByLinkEntityTypeId,
  AircraftProperties,
  AircraftPropertiesWithMetadata,
  Airline,
  AirlineOutgoingLinkAndTarget,
  AirlineOutgoingLinksByLinkEntityTypeId,
  AirlineProperties,
  AirlinePropertiesWithMetadata,
  Airport,
  AirportOutgoingLinkAndTarget,
  AirportOutgoingLinksByLinkEntityTypeId,
  AirportProperties,
  AirportPropertiesWithMetadata,
  ArrivesAt,
  ArrivesAtOutgoingLinkAndTarget,
  ArrivesAtOutgoingLinksByLinkEntityTypeId,
  ArrivesAtProperties,
  ArrivesAtPropertiesWithMetadata,
  BooleanDataType,
  BooleanDataTypeWithMetadata,
  CityPropertyValue,
  CityPropertyValueWithMetadata,
  DateDataType,
  DateDataTypeWithMetadata,
  DepartsFrom,
  DepartsFromOutgoingLinkAndTarget,
  DepartsFromOutgoingLinksByLinkEntityTypeId,
  DepartsFromProperties,
  DepartsFromPropertiesWithMetadata,
  IATACodePropertyValue,
  IATACodePropertyValueWithMetadata,
  ICAOCodePropertyValue,
  ICAOCodePropertyValueWithMetadata,
  LengthDataType,
  LengthDataTypeWithMetadata,
  Link,
  LinkOutgoingLinkAndTarget,
  LinkOutgoingLinksByLinkEntityTypeId,
  LinkProperties,
  LinkPropertiesWithMetadata,
  MetersDataType,
  MetersDataTypeWithMetadata,
  MetricLengthSIDataType,
  MetricLengthSIDataTypeWithMetadata,
  NamePropertyValue,
  NamePropertyValueWithMetadata,
  NumberDataType,
  NumberDataTypeWithMetadata,
  RegistrationNumberPropertyValue,
  RegistrationNumberPropertyValueWithMetadata,
  TextDataType,
  TextDataTypeWithMetadata,
  TimezonePropertyValue,
  TimezonePropertyValueWithMetadata,
  ValueDataType,
  ValueDataTypeWithMetadata,
};

/**
 * The height of an object above a reference point, such as sea level or the ground.
 */
export type AltitudePropertyValue = MetersDataType;

export type AltitudePropertyValueWithMetadata = MetersDataTypeWithMetadata;

/**
 * A measure of rotation or the space between two intersecting lines.
 */
export type AngleDataType = NumberDataType;

export type AngleDataTypeWithMetadata = {
  value: AngleDataType;
  metadata: AngleDataTypeMetadata;
};
export type AngleDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/angle/v/1";
};

/**
 * A codeshare flight number, where multiple airlines sell seats on the same flight under their own flight numbers.
 */
export type CodesharePropertyValue = {
  "https://hash.ai/@h/types/property-type/iata-code/"?: IATACodePropertyValue;
  "https://hash.ai/@h/types/property-type/icao-code/"?: ICAOCodePropertyValue;
};

export type CodesharePropertyValueWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/iata-code/"?: IATACodePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/icao-code/"?: ICAOCodePropertyValueWithMetadata;
  };
};

/**
 * A unit of angular measure equal to 1/360 of a full rotation.
 */
export type DegreeDataType = AngleDataType;

export type DegreeDataTypeWithMetadata = {
  value: DegreeDataType;
  metadata: DegreeDataTypeMetadata;
};
export type DegreeDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/degree/v/1";
};

/**
 * The heading or bearing of something, measured in degrees from true north.
 */
export type DirectionPropertyValue = DegreeDataType;

export type DirectionPropertyValueWithMetadata = DegreeDataTypeWithMetadata;

/**
 * A unit of vertical speed commonly used in aviation to measure rate of climb or descent.
 */
export type FeetPerMinuteDataType = SpeedDataType;

export type FeetPerMinuteDataTypeWithMetadata = {
  value: FeetPerMinuteDataType;
  metadata: FeetPerMinuteDataTypeMetadata;
};
export type FeetPerMinuteDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/feet-per-minute/v/1";
};

/**
 * A scheduled air transport service between two airports.
 */
export type Flight = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/flight/v/1"];
  properties: FlightProperties;
  propertiesWithMetadata: FlightPropertiesWithMetadata;
};

export type FlightArrivesAtLink = {
  linkEntity: ArrivesAt;
  rightEntity: Airport;
};

/**
 * The calendar date on which a flight is scheduled to operate.
 */
export type FlightDatePropertyValue = DateDataType;

export type FlightDatePropertyValueWithMetadata = DateDataTypeWithMetadata;

export type FlightDepartsFromLink = {
  linkEntity: DepartsFrom;
  rightEntity: Airport;
};

/**
 * A numeric or alphanumeric code identifying a specific scheduled airline service.
 */
export type FlightNumberPropertyValue = TextDataType;

export type FlightNumberPropertyValueWithMetadata = TextDataTypeWithMetadata;

export type FlightOperatedByLink = {
  linkEntity: OperatedBy;
  rightEntity: Airline;
};

export type FlightOutgoingLinkAndTarget =
  | FlightArrivesAtLink
  | FlightDepartsFromLink
  | FlightOperatedByLink
  | FlightUsesAircraftLink;

export type FlightOutgoingLinksByLinkEntityTypeId = {
  "https://hash.ai/@h/types/entity-type/arrives-at/v/1": FlightArrivesAtLink;
  "https://hash.ai/@h/types/entity-type/departs-from/v/1": FlightDepartsFromLink;
  "https://hash.ai/@h/types/entity-type/operated-by/v/1": FlightOperatedByLink;
  "https://hash.ai/@h/types/entity-type/uses-aircraft/v/1": FlightUsesAircraftLink;
};

/**
 * A scheduled air transport service between two airports.
 */
export type FlightProperties = {
  "https://hash.ai/@h/types/property-type/altitude/"?: AltitudePropertyValue;
  "https://hash.ai/@h/types/property-type/codeshare/"?: CodesharePropertyValue[];
  "https://hash.ai/@h/types/property-type/direction/"?: DirectionPropertyValue;
  "https://hash.ai/@h/types/property-type/flight-date/"?: FlightDatePropertyValue;
  "https://hash.ai/@h/types/property-type/flight-number/": FlightNumberPropertyValue;
  "https://hash.ai/@h/types/property-type/flight-status/"?: FlightStatusPropertyValue;
  "https://hash.ai/@h/types/property-type/flight-type/"?: FlightTypePropertyValue;
  "https://hash.ai/@h/types/property-type/ground-speed/"?: GroundSpeedPropertyValue;
  "https://hash.ai/@h/types/property-type/iata-code/"?: IATACodePropertyValue;
  "https://hash.ai/@h/types/property-type/icao-code/"?: ICAOCodePropertyValue;
  "https://hash.ai/@h/types/property-type/is-on-ground/"?: IsOnGroundPropertyValue;
  "https://hash.ai/@h/types/property-type/latitude/"?: LatitudePropertyValue;
  "https://hash.ai/@h/types/property-type/longitude/"?: LongitudePropertyValue;
  "https://hash.ai/@h/types/property-type/vertical-speed/"?: VerticalSpeedPropertyValue;
};

export type FlightPropertiesWithMetadata = {
  metadata?: ObjectMetadata;
  value: {
    "https://hash.ai/@h/types/property-type/altitude/"?: AltitudePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/codeshare/"?: {
      value: CodesharePropertyValueWithMetadata[];
      metadata?: ArrayMetadata;
    };
    "https://hash.ai/@h/types/property-type/direction/"?: DirectionPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/flight-date/"?: FlightDatePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/flight-number/": FlightNumberPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/flight-status/"?: FlightStatusPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/flight-type/"?: FlightTypePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/ground-speed/"?: GroundSpeedPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/iata-code/"?: IATACodePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/icao-code/"?: ICAOCodePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/is-on-ground/"?: IsOnGroundPropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/latitude/"?: LatitudePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/longitude/"?: LongitudePropertyValueWithMetadata;
    "https://hash.ai/@h/types/property-type/vertical-speed/"?: VerticalSpeedPropertyValueWithMetadata;
  };
};

/**
 * The current operational status of a flight, indicating whether it is scheduled, in progress, completed, or has encountered issues.
 */
export type FlightStatusDataType =
  | "Scheduled"
  | "Active"
  | "Landed"
  | "Cancelled"
  | "Incident"
  | "Diverted";

export type FlightStatusDataTypeWithMetadata = {
  value: FlightStatusDataType;
  metadata: FlightStatusDataTypeMetadata;
};
export type FlightStatusDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/flight-status/v/1";
};

/**
 * The current operational status of a flight.
 */
export type FlightStatusPropertyValue = FlightStatusDataType;

export type FlightStatusPropertyValueWithMetadata =
  FlightStatusDataTypeWithMetadata;

/**
 * The category of flight operation.
 */
export type FlightTypePropertyValue = TextDataType;

export type FlightTypePropertyValueWithMetadata = TextDataTypeWithMetadata;

export type FlightUsesAircraftLink = {
  linkEntity: UsesAircraft;
  rightEntity: Aircraft;
};

/**
 * The horizontal speed of an aircraft relative to the ground.
 */
export type GroundSpeedPropertyValue = KnotsDataType;

export type GroundSpeedPropertyValueWithMetadata = KnotsDataTypeWithMetadata;

/**
 * Whether something is currently on the ground.
 */
export type IsOnGroundPropertyValue = BooleanDataType;

export type IsOnGroundPropertyValueWithMetadata = BooleanDataTypeWithMetadata;

/**
 * A unit of speed equal to one nautical mile per hour, commonly used in aviation and maritime contexts.
 */
export type KnotsDataType = SpeedDataType;

export type KnotsDataTypeWithMetadata = {
  value: KnotsDataType;
  metadata: KnotsDataTypeMetadata;
};
export type KnotsDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/knots/v/1";
};

/**
 * The angular distance of a position north or south of the equator, ranging from -90° (South Pole) to +90° (North Pole).
 */
export type LatitudeDataType = DegreeDataType;

export type LatitudeDataTypeWithMetadata = {
  value: LatitudeDataType;
  metadata: LatitudeDataTypeMetadata;
};
export type LatitudeDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/latitude/v/1";
};

/**
 * The angular distance of a position north or south of the equator.
 */
export type LatitudePropertyValue = LatitudeDataType;

export type LatitudePropertyValueWithMetadata = LatitudeDataTypeWithMetadata;

/**
 * The angular distance of a position east or west of the prime meridian, ranging from -180° to +180°.
 */
export type LongitudeDataType = DegreeDataType;

export type LongitudeDataTypeWithMetadata = {
  value: LongitudeDataType;
  metadata: LongitudeDataTypeMetadata;
};
export type LongitudeDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/longitude/v/1";
};

/**
 * The angular distance of a position east or west of the prime meridian.
 */
export type LongitudePropertyValue = LongitudeDataType;

export type LongitudePropertyValueWithMetadata = LongitudeDataTypeWithMetadata;

/**
 * Indicates the airline that operates a flight.
 */
export type OperatedBy = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/operated-by/v/1"];
  properties: OperatedByProperties;
  propertiesWithMetadata: OperatedByPropertiesWithMetadata;
};

export type OperatedByOutgoingLinkAndTarget = never;

export type OperatedByOutgoingLinksByLinkEntityTypeId = {};

/**
 * Indicates the airline that operates a flight.
 */
export type OperatedByProperties = LinkProperties & {};

export type OperatedByPropertiesWithMetadata = LinkPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * A measure of the rate of movement or change in position over time.
 */
export type SpeedDataType = NumberDataType;

export type SpeedDataTypeWithMetadata = {
  value: SpeedDataType;
  metadata: SpeedDataTypeMetadata;
};
export type SpeedDataTypeMetadata = {
  provenance?: PropertyProvenance;
  confidence?: Confidence;
  dataTypeId: "https://hash.ai/@h/types/data-type/speed/v/1";
};

/**
 * Indicates the aircraft used to operate a flight.
 */
export type UsesAircraft = {
  entityTypeIds: ["https://hash.ai/@h/types/entity-type/uses-aircraft/v/1"];
  properties: UsesAircraftProperties;
  propertiesWithMetadata: UsesAircraftPropertiesWithMetadata;
};

export type UsesAircraftOutgoingLinkAndTarget = never;

export type UsesAircraftOutgoingLinksByLinkEntityTypeId = {};

/**
 * Indicates the aircraft used to operate a flight.
 */
export type UsesAircraftProperties = LinkProperties & {};

export type UsesAircraftPropertiesWithMetadata = LinkPropertiesWithMetadata & {
  metadata?: ObjectMetadata;
  value: {};
};

/**
 * The rate of vertical movement (climb or descent).
 */
export type VerticalSpeedPropertyValue = FeetPerMinuteDataType;

export type VerticalSpeedPropertyValueWithMetadata =
  FeetPerMinuteDataTypeWithMetadata;
