import { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { MigrationFunction } from "../types";
import { createSystemDataTypeIfNotExists } from "../util";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: blockProtocolDataTypes.number.dataTypeId }],
      label: {
        right: "%",
      },
      title: "Percentage",
      description: "A measure of the proportion of a whole.",
      type: "number",
    },
    conversions: {},
    webShortname: "h",
    migrationState,
  });

  const durationDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        abstract: true,
        allOf: [{ $ref: blockProtocolDataTypes.number.dataTypeId }],
        title: "Duration",
        description: "A measure of the length of time.",
        type: "number",
      },
      conversions: {},
      webShortname: "h",
      migrationState,
    },
  );

  const secondDataType = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: durationDataType.schema.$id }],
        title: "Second",
        description:
          "The base unit of duration in the International System of Units (SI), defined as about 9 billion oscillations of the caesium atom.",
        type: "number",
      },
      conversions: {},
      webShortname: "h",
      migrationState,
    },
  );

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: durationDataType.schema.$id }],
      title: "Millisecond",
      description:
        "A measure of the length of time in the International System of Units (SI), defined as exactly 1/1000 of a second.",
      type: "number",
    },
    conversions: {
      [secondDataType.metadata.recordId.baseUrl]: {
        from: { expression: ["*", "self", { const: 1000, type: "number" }] },
        to: { expression: ["/", "self", { const: 1000, type: "number" }] },
      },
    },
    webShortname: "h",
    migrationState,
  });

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: durationDataType.schema.$id }],
      title: "Microsecond",
      description:
        "A measure of the length of time in the International System of Units (SI), defined as exactly 1/1000000 (1 millionth) of a second.",
      type: "number",
    },
    conversions: {
      [secondDataType.metadata.recordId.baseUrl]: {
        from: { expression: ["*", "self", { const: 1000000, type: "number" }] },
        to: { expression: ["/", "self", { const: 1000000, type: "number" }] },
      },
    },
    webShortname: "h",
    migrationState,
  });

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: durationDataType.schema.$id }],
      title: "Minute",
      description:
        "A measure of the length of time, defined as exactly 60 seconds.",
      type: "number",
    },
    conversions: {
      [secondDataType.metadata.recordId.baseUrl]: {
        from: { expression: ["/", "self", { const: 60, type: "number" }] },
        to: { expression: ["*", "self", { const: 60, type: "number" }] },
      },
    },
    webShortname: "h",
    migrationState,
  });

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: durationDataType.schema.$id }],
      title: "Hour",
      description:
        "A measure of the length of time, defined as exactly 3,600 seconds.",
      type: "number",
    },
    conversions: {
      [secondDataType.metadata.recordId.baseUrl]: {
        from: { expression: ["/", "self", { const: 3600, type: "number" }] },
        to: { expression: ["*", "self", { const: 3600, type: "number" }] },
      },
    },
    webShortname: "h",
    migrationState,
  });

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: durationDataType.schema.$id }],
      title: "Day",
      description:
        "A measure of the length of time, defined as the time period of a full rotation of the Earth with respect to the Sun. On average, this is 24 hours.",
      type: "number",
    },
    conversions: {
      [secondDataType.metadata.recordId.baseUrl]: {
        from: { expression: ["/", "self", { const: 86400, type: "number" }] },
        to: { expression: ["*", "self", { const: 86400, type: "number" }] },
      },
    },
    webShortname: "h",
    migrationState,
  });

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: durationDataType.schema.$id }],
      title: "Week",
      description: "A measure of the length of time, defined as 7 days.",
      type: "number",
    },
    conversions: {
      [secondDataType.metadata.recordId.baseUrl]: {
        from: { expression: ["/", "self", { const: 604800, type: "number" }] },
        to: { expression: ["*", "self", { const: 604800, type: "number" }] },
      },
    },
    webShortname: "h",
    migrationState,
  });

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: durationDataType.schema.$id }],
      title: "Month",
      description:
        "A measure of the length of time. Months vary in length – there are 12 months in a Gregorian year.",
      type: "number",
    },
    conversions: {
      [secondDataType.metadata.recordId.baseUrl]: {
        from: { expression: ["/", "self", { const: 2629800, type: "number" }] },
        to: { expression: ["*", "self", { const: 2629800, type: "number" }] },
      },
    },
    webShortname: "h",
    migrationState,
  });

  /**
   * @todo H-5852 we will need to rename the existing Year data type to "Calendar Year" (it covers things such as '1999') before un-deving this migration
   */
  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: durationDataType.schema.$id }],
      title: "Year",
      description:
        "A measure of the length of time. In the Gregorian calendar, years vary in length – there are 365 days in a common year, and 366 days in a leap year.",
      type: "number",
    },
    conversions: {
      [secondDataType.metadata.recordId.baseUrl]: {
        from: {
          expression: ["/", "self", { const: 31557600, type: "number" }],
        },
        to: { expression: ["*", "self", { const: 31557600, type: "number" }] },
      },
    },
    webShortname: "h",
    migrationState,
  });

  return migrationState;
};

export default migrate;
