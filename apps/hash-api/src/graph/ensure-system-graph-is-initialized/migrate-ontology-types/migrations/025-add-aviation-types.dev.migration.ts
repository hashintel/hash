import {
  blockProtocolDataTypes,
  blockProtocolEntityTypes,
  blockProtocolPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { MigrationFunction } from "../types";
import {
  createSystemDataTypeIfNotExists,
  createSystemEntityTypeIfNotExists,
  createSystemPropertyTypeIfNotExists,
  getCurrentHashDataTypeId,
} from "../util";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  /**
   * Step 1: Create data types
   */

  /**
   * Angle data type hierarchy: Angle → Degree → Latitude/Longitude
   */

  const angleDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: blockProtocolDataTypes.number.dataTypeId }],
        abstract: true,
        title: "Angle",
        description:
          "A measure of rotation or the space between two intersecting lines.",
        type: "number",
      },
      conversions: {},
      migrationState,
      webShortname: "h",
    },
  );

  const degreeDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: angleDataType.schema.$id }],
        title: "Degree",
        description:
          "A unit of angular measure equal to 1/360 of a full rotation.",
        label: {
          right: "°",
        },
        type: "number",
      },
      conversions: {},
      migrationState,
      webShortname: "h",
    },
  );

  const latitudeDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: degreeDataType.schema.$id }],
        title: "Latitude",
        description:
          "The angular distance of a position north or south of the equator, ranging from -90° (South Pole) to +90° (North Pole).",
        minimum: -90,
        maximum: 90,
        type: "number",
      },
      conversions: {},
      migrationState,
      webShortname: "h",
    },
  );

  const longitudeDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: degreeDataType.schema.$id }],
        title: "Longitude",
        description:
          "The angular distance of a position east or west of the prime meridian, ranging from -180° to +180°.",
        minimum: -180,
        maximum: 180,
        type: "number",
      },
      conversions: {},
      migrationState,
      webShortname: "h",
    },
  );

  /**
   * Speed data type hierarchy: Speed → Kilometers per Hour
   */

  const speedDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: blockProtocolDataTypes.number.dataTypeId }],
        abstract: true,
        title: "Speed",
        description:
          "A measure of the rate of movement or change in position over time.",
        type: "number",
      },
      conversions: {},
      migrationState,
      webShortname: "h",
    },
  );

  const kilometersPerHourDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: speedDataType.schema.$id }],
        title: "Kilometers per Hour",
        description:
          "A unit of speed expressing the number of kilometers traveled in one hour.",
        label: {
          right: "km/h",
        },
        type: "number",
      },
      conversions: {},
      migrationState,
      webShortname: "h",
    },
  );

  /**
   * Step 2: Create property types
   */

  const iataCodePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "IATA Code",
        description:
          "A code assigned by the International Air Transport Association (IATA) to identify airports, airlines, or aircraft types.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const icaoCodePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "ICAO Code",
        description:
          "A code assigned by the International Civil Aviation Organization (ICAO) to identify airports, airlines, or aircraft types.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const gatePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Gate",
        description:
          "The gate number or identifier at an airport terminal where passengers board or disembark.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const terminalPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Terminal",
        description:
          "The terminal building or area at an airport where passengers check in, wait, and board flights.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const baggageClaimPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Baggage Claim",
        description:
          "The area or carousel number where passengers collect their checked luggage after a flight.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const integerDataTypeId = getCurrentHashDataTypeId({
    dataTypeKey: "integer",
    migrationState,
  });

  const datetimeDataTypeId = getCurrentHashDataTypeId({
    dataTypeKey: "datetime",
    migrationState,
  });

  const dateDataTypeId = getCurrentHashDataTypeId({
    dataTypeKey: "date",
    migrationState,
  });

  const delayInMinutesPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Delay In Minutes",
        description:
          "The amount of delay in minutes for a scheduled event such as a flight departure or arrival.",
        possibleValues: [{ dataTypeId: integerDataTypeId }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const scheduledTimePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Scheduled Time",
        description:
          "The originally planned date and time for an event to occur.",
        possibleValues: [{ dataTypeId: datetimeDataTypeId }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const estimatedTimePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Estimated Time",
        description:
          "The predicted date and time for an event to occur, which may differ from the scheduled time.",
        possibleValues: [{ dataTypeId: datetimeDataTypeId }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const actualTimePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Actual Time",
        description: "The date and time when an event actually occurred.",
        possibleValues: [{ dataTypeId: datetimeDataTypeId }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const flightNumberPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Flight Number",
        description:
          "A numeric or alphanumeric code identifying a specific scheduled airline service.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const flightStatusDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: blockProtocolDataTypes.text.dataTypeId }],
        title: "Flight Status",
        description:
          "The current operational status of a flight, indicating whether it is scheduled, in progress, completed, or has encountered issues.",
        enum: [
          "Scheduled",
          "Active",
          "Landed",
          "Cancelled",
          "Incident",
          "Diverted",
        ],
        type: "string",
      },
      conversions: {},
      migrationState,
      webShortname: "h",
    },
  );

  const flightStatusPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Flight Status",
        description: "The current operational status of a flight.",
        possibleValues: [{ dataTypeId: flightStatusDataType.schema.$id }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const flightDatePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Flight Date",
        description:
          "The calendar date on which a flight is scheduled to operate.",
        possibleValues: [{ dataTypeId: dateDataTypeId }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const timezonePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Timezone",
        description:
          "A time zone identifier (e.g. 'America/Los_Angeles', 'Europe/London').",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const registrationNumberPropertyType =
    await createSystemPropertyTypeIfNotExists(context, authentication, {
      propertyTypeDefinition: {
        title: "Registration Number",
        description:
          "A unique alphanumeric code assigned to an aircraft, also known as a tail number (e.g. 'N123AB').",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    });

  const icao24AddressPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "ICAO24 Address",
        description:
          "A unique 24-bit transponder address assigned to an aircraft, represented in hexadecimal format.",
        possibleValues: [{ primitiveDataType: "text" }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const metersDataTypeId = getCurrentHashDataTypeId({
    dataTypeKey: "meters",
    migrationState,
  });

  const latitudePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Latitude",
        description:
          "The angular distance of a position north or south of the equator.",
        possibleValues: [{ dataTypeId: latitudeDataType.schema.$id }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const longitudePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Longitude",
        description:
          "The angular distance of a position east or west of the prime meridian.",
        possibleValues: [{ dataTypeId: longitudeDataType.schema.$id }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const altitudePropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Altitude",
        description:
          "The height of an object above a reference point, such as sea level or the ground.",
        possibleValues: [{ dataTypeId: metersDataTypeId }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const directionPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Direction",
        description:
          "The heading or bearing of something, measured in degrees from true north.",
        possibleValues: [{ dataTypeId: degreeDataType.schema.$id }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const horizontalSpeedPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Horizontal Speed",
        description: "The rate of horizontal movement.",
        possibleValues: [{ dataTypeId: kilometersPerHourDataType.schema.$id }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const verticalSpeedPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Vertical Speed",
        description: "The rate of vertical movement (climb or descent).",
        possibleValues: [{ dataTypeId: kilometersPerHourDataType.schema.$id }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const isOnGroundPropertyType = await createSystemPropertyTypeIfNotExists(
    context,
    authentication,
    {
      propertyTypeDefinition: {
        title: "Is On Ground",
        description: "Whether something is currently on the ground.",
        possibleValues: [{ primitiveDataType: "boolean" }],
      },
      migrationState,
      webShortname: "h",
    },
  );

  /**
   * Step 2: Create entity types
   */

  const airportEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Airport",
        titlePlural: "Airports",
        icon: "🛬",
        description:
          "A facility where aircraft take off and land, with infrastructure for passenger and cargo services.",
        labelProperty: blockProtocolPropertyTypes.name.propertyTypeBaseUrl,
        properties: [
          {
            propertyType: blockProtocolPropertyTypes.name.propertyTypeId,
            required: true,
          },
          {
            propertyType: iataCodePropertyType,
          },
          {
            propertyType: icaoCodePropertyType,
          },
          {
            propertyType: timezonePropertyType,
          },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const airlineEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Airline",
        titlePlural: "Airlines",
        icon: "🛫",
        description:
          "A company that provides air transport services for passengers and/or cargo.",
        labelProperty: blockProtocolPropertyTypes.name.propertyTypeBaseUrl,
        properties: [
          {
            propertyType: blockProtocolPropertyTypes.name.propertyTypeId,
            required: true,
          },
          {
            propertyType: iataCodePropertyType,
          },
          {
            propertyType: icaoCodePropertyType,
          },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const aircraftEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Aircraft",
        titlePlural: "Aircraft",
        icon: "🛩️",
        description:
          "A vehicle designed for air travel, such as an airplane or helicopter.",
        labelProperty: registrationNumberPropertyType.metadata.recordId.baseUrl,
        properties: [
          {
            propertyType: registrationNumberPropertyType,
            required: true,
          },
          {
            propertyType: iataCodePropertyType,
          },
          {
            propertyType: icaoCodePropertyType,
          },
          {
            propertyType: icao24AddressPropertyType,
          },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  /**
   * Step 3: Create link entity types
   */

  const departsFromLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Departs From",
        icon: "🛫",
        inverse: {
          title: "Departure For",
        },
        description:
          "Indicates the airport from which a flight departs, including departure-specific details.",
        properties: [
          { propertyType: gatePropertyType },
          { propertyType: terminalPropertyType },
          { propertyType: delayInMinutesPropertyType },
          { propertyType: scheduledTimePropertyType },
          { propertyType: estimatedTimePropertyType },
          { propertyType: actualTimePropertyType },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const arrivesAtLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Arrives At",
        icon: "🛬",
        inverse: {
          title: "Arrival For",
        },
        description:
          "Indicates the airport at which a flight arrives, including arrival-specific details.",
        properties: [
          { propertyType: gatePropertyType },
          { propertyType: terminalPropertyType },
          { propertyType: baggageClaimPropertyType },
          { propertyType: delayInMinutesPropertyType },
          { propertyType: scheduledTimePropertyType },
          { propertyType: estimatedTimePropertyType },
          { propertyType: actualTimePropertyType },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const operatedByLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Operated By",
        inverse: {
          title: "Operates",
        },
        description: "Indicates the airline that operates a flight.",
        properties: [],
      },
      migrationState,
      webShortname: "h",
    },
  );

  const usesAircraftLinkEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        allOf: [blockProtocolEntityTypes.link.entityTypeId],
        title: "Uses Aircraft",
        inverse: {
          title: "Used For Flight",
        },
        description: "Indicates the aircraft used to operate a flight.",
        properties: [],
      },
      migrationState,
      webShortname: "h",
    },
  );

  /**
   * Step 4: Create the Flight entity type with links
   */

  const _flightEntityType = await createSystemEntityTypeIfNotExists(
    context,
    authentication,
    {
      entityTypeDefinition: {
        title: "Flight",
        titlePlural: "Flights",
        icon: "✈️",
        description: "A scheduled air transport service between two airports.",
        labelProperty: flightNumberPropertyType.metadata.recordId.baseUrl,
        properties: [
          {
            propertyType: flightNumberPropertyType,
            required: true,
          },
          {
            propertyType: iataCodePropertyType,
          },
          {
            propertyType: icaoCodePropertyType,
          },
          {
            propertyType: flightStatusPropertyType,
          },
          {
            propertyType: flightDatePropertyType,
          },
          {
            propertyType: latitudePropertyType,
          },
          {
            propertyType: longitudePropertyType,
          },
          {
            propertyType: altitudePropertyType,
          },
          {
            propertyType: directionPropertyType,
          },
          {
            propertyType: horizontalSpeedPropertyType,
          },
          {
            propertyType: verticalSpeedPropertyType,
          },
          {
            propertyType: isOnGroundPropertyType,
          },
        ],
        outgoingLinks: [
          {
            linkEntityType: departsFromLinkEntityType,
            destinationEntityTypes: [airportEntityType.schema.$id],
            minItems: 1,
            maxItems: 1,
          },
          {
            linkEntityType: arrivesAtLinkEntityType,
            destinationEntityTypes: [airportEntityType.schema.$id],
            minItems: 1,
            maxItems: 1,
          },
          {
            linkEntityType: operatedByLinkEntityType,
            destinationEntityTypes: [airlineEntityType.schema.$id],
            maxItems: 1,
          },
          {
            linkEntityType: usesAircraftLinkEntityType,
            destinationEntityTypes: [aircraftEntityType.schema.$id],
            maxItems: 1,
          },
        ],
      },
      migrationState,
      webShortname: "h",
    },
  );

  return migrationState;
};

export default migrate;
