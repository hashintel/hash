import { systemDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { MigrationFunction } from "../types";
import { createSystemDataTypeIfNotExists } from "../util";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
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

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
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

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      title: "Gigahertz",
      description: "A unit of frequency equal to one billion hertz.",
      label: {
        right: "GHz",
      },
      type: "number",
    },
    conversions: {},
    webShortname: "hash",
    migrationState,
  });

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      title: "Gigabytes",
      description: "A unit of information equal to one billion bytes.",
      label: {
        right: "GB",
      },
      type: "number",
    },
    conversions: {},
    webShortname: "hash",
    migrationState,
  });

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      title: "Watts",
      description:
        "A unit of power in the International System of Units (SI) equal to one joule per second.",
      label: {
        right: "W",
      },
      type: "number",
    },
    conversions: {},
    webShortname: "hash",
    migrationState,
  });

  return migrationState;
};

export default migrate;
