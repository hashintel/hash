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
   * Step 1: Create property types for aviation-related data
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
          "Aactive",
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
