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
    webShortname: "hash",
    migrationState,
  });

  return migrationState;
};

export default migrate;
