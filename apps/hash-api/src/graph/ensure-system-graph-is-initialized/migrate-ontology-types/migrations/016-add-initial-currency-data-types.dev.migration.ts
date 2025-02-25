import { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { MigrationFunction } from "../types";
import { createSystemDataTypeIfNotExists } from "../util";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  const currencyDataTypes = await createSystemDataTypeIfNotExists(
    context,
    authentication,
    {
      dataTypeDefinition: {
        allOf: [{ $ref: blockProtocolDataTypes.number.dataTypeId }],
        abstract: true,
        title: "Currency",
        description:
          "A system of money in common use within a specific environment over time, especially for people in a nation state.",
        type: "number",
      },
      conversions: {},
      webShortname: "h",
      migrationState,
    },
  );

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: currencyDataTypes.schema.$id }],
      title: "USD",
      description: "An amount denominated in US Dollars.",
      type: "number",
      label: {
        left: "$",
      },
    },
    conversions: {},
    webShortname: "h",
    migrationState,
  });

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: currencyDataTypes.schema.$id }],
      title: "GBP",
      description: "An amount denominated in British pounds sterling.",
      type: "number",
      label: {
        left: "£",
      },
    },
    conversions: {},
    webShortname: "h",
    migrationState,
  });

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      allOf: [{ $ref: currencyDataTypes.schema.$id }],
      title: "EUR",
      description: "An amount denominated in Euros.",
      type: "number",
      label: {
        left: "€",
      },
    },
    conversions: {},
    webShortname: "h",
    migrationState,
  });

  return migrationState;
};

export default migrate;
