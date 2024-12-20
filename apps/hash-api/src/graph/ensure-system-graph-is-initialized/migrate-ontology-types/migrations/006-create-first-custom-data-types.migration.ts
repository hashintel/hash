import {
  blockProtocolDataTypes,
  systemDataTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { MigrationFunction } from "../types";
import { createSystemDataTypeIfNotExists } from "../util";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: blockProtocolDataTypes.text.dataTypeId }],
      title: "URI",
      description: "A unique identifier for a resource (e.g. a URL, or URN).",
      format: "uri",
      type: "string",
    },
    conversions: {},
    webShortname: "hash",
    migrationState,
  });

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: blockProtocolDataTypes.text.dataTypeId }],
      title: "Email",
      description:
        "An identifier for an email box to which messages are delivered.",
      format: "email",
      type: "string",
    },
    conversions: {},
    webShortname: "hash",
    migrationState,
  });

  const lengthDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: blockProtocolDataTypes.number.dataTypeId }],
        abstract: true,
        title: "Length",
        description: "A measure of distance.",
        type: "number",
      },
      conversions: {},
      webShortname: "hash",
      migrationState,
    },
  );

  const metricLengthDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: lengthDataType.schema.$id }],
        abstract: true,
        title: "Metric Length (SI)",
        description:
          "A measure of distance in the International System of Units (SI), the international standard for decimal-based measurements.",
        type: "number",
      },
      conversions: {},
      webShortname: "hash",
      migrationState,
    },
  );

  const imperialLengthUkDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: lengthDataType.schema.$id }],
        abstract: true,
        title: "Imperial Length (UK)",
        description:
          "A measure of distance in the system of units defined in the British Weights and Measures Acts, in use alongside metric units in the UK and elsewhere.",
        type: "number",
      },
      conversions: {},
      webShortname: "hash",
      migrationState,
    },
  );

  const imperialLengthUsDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: lengthDataType.schema.$id }],
        abstract: true,
        title: "Imperial Length (US)",
        description:
          "A measure of distance in the system of units commonly used in the United States, formally known as United States customary units.",
        type: "number",
      },
      conversions: {},
      webShortname: "hash",
      migrationState,
    },
  );

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: metricLengthDataType.schema.$id }],
      title: "Meters",
      description:
        "The base unit of length in the International System of Units (SI).",
      label: {
        right: "m",
      },
      type: "number",
    },
    conversions: {},
    webShortname: "hash",
    migrationState,
  });

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: metricLengthDataType.schema.$id }],
      title: "Millimeters",
      description:
        "A unit of length in the International System of Units (SI), equal to one thousandth of a meter.",
      label: {
        right: "mm",
      },
      type: "number",
    },
    conversions: {
      [systemDataTypes.meters.dataTypeBaseUrl]: {
        from: { expression: ["*", "self", { const: 1000, type: "number" }] },
        to: { expression: ["/", "self", { const: 1000, type: "number" }] },
      },
    },
    webShortname: "hash",
    migrationState,
  });

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: metricLengthDataType.schema.$id }],
      title: "Centimeters",
      description:
        "A unit of length in the International System of Units (SI), equal to one hundredth of a meter.",
      label: {
        right: "cm",
      },
      type: "number",
    },
    conversions: {
      [systemDataTypes.meters.dataTypeBaseUrl]: {
        from: { expression: ["*", "self", { const: 100, type: "number" }] },
        to: { expression: ["/", "self", { const: 100, type: "number" }] },
      },
    },
    webShortname: "hash",
    migrationState,
  });

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: metricLengthDataType.schema.$id }],
      title: "Kilometers",
      description:
        "A unit of length in the International System of Units (SI), equal to one thousand meters.",
      label: {
        right: "km",
      },
      type: "number",
    },
    conversions: {
      [systemDataTypes.meters.dataTypeBaseUrl]: {
        from: { expression: ["/", "self", { const: 1000, type: "number" }] },
        to: { expression: ["*", "self", { const: 1000, type: "number" }] },
      },
    },
    webShortname: "hash",
    migrationState,
  });

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [
        { $ref: imperialLengthUkDataType.schema.$id },
        { $ref: imperialLengthUsDataType.schema.$id },
      ],
      title: "Miles",
      description:
        "An imperial unit of length, equivalent to 1,609.344 meters in the International System of Units (SI).",
      label: {
        right: "mi",
      },
      type: "number",
    },
    conversions: {
      [systemDataTypes.meters.dataTypeBaseUrl]: {
        from: {
          expression: ["/", "self", { const: 1609.344, type: "number" }],
        },
        to: { expression: ["*", "self", { const: 1609.344, type: "number" }] },
      },
    },
    webShortname: "hash",
    migrationState,
  });

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [
        { $ref: imperialLengthUkDataType.schema.$id },
        { $ref: imperialLengthUsDataType.schema.$id },
      ],
      title: "Yards",
      description:
        "An imperial unit of length. 1,760 yards equals 1 mile. Equivalent to 0.9144 meters in the International System of Units (SI).",
      label: {
        right: "yd",
      },
      type: "number",
    },
    conversions: {
      [systemDataTypes.meters.dataTypeBaseUrl]: {
        from: {
          expression: ["/", "self", { const: 0.9144, type: "number" }],
        },
        to: { expression: ["*", "self", { const: 0.9144, type: "number" }] },
      },
    },
    webShortname: "hash",
    migrationState,
  });

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [
        { $ref: imperialLengthUkDataType.schema.$id },
        { $ref: imperialLengthUsDataType.schema.$id },
      ],
      title: "Feet",
      description:
        "An imperial unit of length. 3 feet equals 1 yard. Equivalent to 0.3048 meters in the International System of Units (SI).",
      label: {
        right: "ft",
      },
      type: "number",
    },
    conversions: {
      [systemDataTypes.meters.dataTypeBaseUrl]: {
        from: {
          expression: ["/", "self", { const: 0.3048, type: "number" }],
        },
        to: { expression: ["*", "self", { const: 0.3048, type: "number" }] },
      },
    },
    webShortname: "hash",
    migrationState,
  });

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [
        { $ref: imperialLengthUkDataType.schema.$id },
        { $ref: imperialLengthUsDataType.schema.$id },
      ],
      title: "Inches",
      description:
        "An imperial unit of length. 12 inches equals 1 foot. Equivalent to 0.0254 meters in the International System of Units (SI).",
      label: {
        right: "in",
      },
      type: "number",
    },
    conversions: {
      [systemDataTypes.meters.dataTypeBaseUrl]: {
        from: {
          expression: ["/", "self", { const: 0.0254, type: "number" }],
        },
        to: { expression: ["*", "self", { const: 0.0254, type: "number" }] },
      },
    },
    webShortname: "hash",
    migrationState,
  });

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: blockProtocolDataTypes.text.dataTypeId }],
      title: "Date",
      description:
        "A reference to a particular day represented within a calendar system, formatted according to RFC 3339.",
      type: "string",
      format: "date",
    },
    conversions: {},
    webShortname: "hash",
    migrationState,
  });

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: blockProtocolDataTypes.text.dataTypeId }],
      title: "DateTime",
      description:
        "A reference to a particular date and time, formatted according to RFC 3339.",
      type: "string",
      format: "date-time",
    },
    conversions: {},
    webShortname: "hash",
    migrationState,
  });

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: blockProtocolDataTypes.text.dataTypeId }],
      title: "Time",
      description:
        "A reference to a particular clock time, formatted according to RFC 3339.",
      type: "string",
      format: "time",
    },
    conversions: {},
    webShortname: "hash",
    migrationState,
  });

  const frequencyDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: blockProtocolDataTypes.number.dataTypeId }],
        abstract: true,
        title: "Frequency",
        description:
          "The number of occurrences of a repeating event per unit of time (temporal frequency).",
        type: "number",
      },
      conversions: {},
      webShortname: "hash",
      migrationState,
    },
  );

  const hertzDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: frequencyDataType.schema.$id }],
        title: "Hertz",
        description:
          "A unit of frequency in the International System of Units (SI), equivalent to one cycle per second.",
        label: {
          right: "Hz",
        },
        type: "number",
      },
      conversions: {},
      webShortname: "hash",
      migrationState,
    },
  );

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: frequencyDataType.schema.$id }],
      title: "Kilohertz",
      description:
        "A unit of frequency in the International System of Units (SI), equal to one thousand hertz.",
      label: {
        right: "kHz",
      },
      type: "number",
    },
    conversions: {
      [hertzDataType.metadata.recordId.baseUrl]: {
        from: { expression: ["/", "self", { const: 1e3, type: "number" }] },
        to: { expression: ["*", "self", { const: 1e3, type: "number" }] },
      },
    },
    webShortname: "hash",
    migrationState,
  });

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: frequencyDataType.schema.$id }],
      title: "Megahertz",
      description:
        "A unit of frequency in the International System of Units (SI), equal to one million hertz.",
      label: {
        right: "MHz",
      },
      type: "number",
    },
    conversions: {
      [hertzDataType.metadata.recordId.baseUrl]: {
        from: { expression: ["/", "self", { const: 1e6, type: "number" }] },
        to: { expression: ["*", "self", { const: 1e6, type: "number" }] },
      },
    },
    webShortname: "hash",
    migrationState,
  });

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: frequencyDataType.schema.$id }],
      title: "Gigahertz",
      description:
        "A unit of frequency in the International System of Units (SI), equal to one billion hertz.",
      label: {
        right: "GHz",
      },
      type: "number",
    },
    conversions: {
      [hertzDataType.metadata.recordId.baseUrl]: {
        from: { expression: ["/", "self", { const: 1e9, type: "number" }] },
        to: { expression: ["*", "self", { const: 1e9, type: "number" }] },
      },
    },
    webShortname: "hash",
    migrationState,
  });

  const informationDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: blockProtocolDataTypes.number.dataTypeId }],
        abstract: true,
        title: "Information",
        description: "A measure of information content.",
        type: "number",
      },
      conversions: {},
      webShortname: "hash",
      migrationState,
    },
  );

  const bytesDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: informationDataType.schema.$id }],
        title: "Bytes",
        description: "A unit of information equal to eight bits.",
        label: {
          right: "B",
        },
        type: "number",
      },
      conversions: {},
      webShortname: "hash",
      migrationState,
    },
  );

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: informationDataType.schema.$id }],
      title: "Bits",
      description: "A unit of information equal to one binary digit.",
      label: {
        right: "b",
      },
      type: "number",
    },
    conversions: {
      [bytesDataType.metadata.recordId.baseUrl]: {
        from: { expression: ["*", "self", { const: 8, type: "number" }] },
        to: { expression: ["/", "self", { const: 8, type: "number" }] },
      },
    },
    webShortname: "hash",
    migrationState,
  });

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: informationDataType.schema.$id }],
      title: "Kilobytes",
      description: "A unit of information equal to one thousand bytes.",
      label: {
        right: "KB",
      },
      type: "number",
    },
    conversions: {
      [bytesDataType.metadata.recordId.baseUrl]: {
        from: { expression: ["/", "self", { const: 1e3, type: "number" }] },
        to: { expression: ["*", "self", { const: 1e3, type: "number" }] },
      },
    },
    webShortname: "hash",
    migrationState,
  });

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: informationDataType.schema.$id }],
      title: "Megabytes",
      description: "A unit of information equal to one million bytes.",
      label: {
        right: "MB",
      },
      type: "number",
    },
    conversions: {
      [bytesDataType.metadata.recordId.baseUrl]: {
        from: { expression: ["/", "self", { const: 1e6, type: "number" }] },
        to: { expression: ["*", "self", { const: 1e6, type: "number" }] },
      },
    },
    webShortname: "hash",
    migrationState,
  });

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: informationDataType.schema.$id }],
      title: "Gigabytes",
      description: "A unit of information equal to one billion bytes.",
      label: {
        right: "GB",
      },
      type: "number",
    },
    conversions: {
      [bytesDataType.metadata.recordId.baseUrl]: {
        from: { expression: ["/", "self", { const: 1e9, type: "number" }] },
        to: { expression: ["*", "self", { const: 1e9, type: "number" }] },
      },
    },
    webShortname: "hash",
    migrationState,
  });

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: informationDataType.schema.$id }],
      title: "Terabytes",
      description: "A unit of information equal to one trillion bytes.",
      label: {
        right: "TB",
      },
      type: "number",
    },
    conversions: {
      [bytesDataType.metadata.recordId.baseUrl]: {
        from: { expression: ["/", "self", { const: 1e12, type: "number" }] },
        to: { expression: ["*", "self", { const: 1e12, type: "number" }] },
      },
    },
    webShortname: "hash",
    migrationState,
  });

  const powerDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: blockProtocolDataTypes.number.dataTypeId }],
        abstract: true,
        title: "Power",
        description:
          "The amount of energy transferred or converted per unit time.",
        type: "number",
      },
      conversions: {},
      webShortname: "hash",
      migrationState,
    },
  );

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: powerDataType.schema.$id }],
      title: "Watts",
      description:
        "The unit of power or radiant flux in the International System of Units (SI) – the rate at which work is done or energy is transferred. Equal to one joule per second.",
      label: {
        right: "W",
      },
      type: "number",
    },
    conversions: {},
    webShortname: "hash",
    migrationState,
  });

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: powerDataType.schema.$id }],
      title: "Kilowatts",
      description:
        "A unit of power in the International System of Units (SI), equal to one thousand watts.",
      label: {
        right: "kW",
      },
      type: "number",
    },
    conversions: {
      [systemDataTypes.watts.dataTypeBaseUrl]: {
        from: { expression: ["/", "self", { const: 1e3, type: "number" }] },
        to: { expression: ["*", "self", { const: 1e3, type: "number" }] },
      },
    },
    webShortname: "hash",
    migrationState,
  });

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: powerDataType.schema.$id }],
      title: "Megawatts",
      description:
        "A unit of power in the International System of Units (SI), equal to one million watts.",
      label: {
        right: "MW",
      },
      type: "number",
    },
    conversions: {
      [systemDataTypes.watts.dataTypeBaseUrl]: {
        from: { expression: ["/", "self", { const: 1e6, type: "number" }] },
        to: { expression: ["*", "self", { const: 1e6, type: "number" }] },
      },
    },
    webShortname: "hash",
    migrationState,
  });

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: powerDataType.schema.$id }],
      title: "Gigawatts",
      description:
        "A unit of power in the International System of Units (SI), equal to one billion watts.",
      label: {
        right: "GW",
      },
      type: "number",
    },
    conversions: {
      [systemDataTypes.watts.dataTypeBaseUrl]: {
        from: { expression: ["/", "self", { const: 1e9, type: "number" }] },
        to: { expression: ["*", "self", { const: 1e9, type: "number" }] },
      },
    },
    webShortname: "hash",
    migrationState,
  });

  return migrationState;
};

export default migrate;
