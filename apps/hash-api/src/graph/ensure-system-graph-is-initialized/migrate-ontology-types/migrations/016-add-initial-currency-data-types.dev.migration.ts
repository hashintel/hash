import type { MigrationFunction } from "../types.js";
import { createSystemDataTypeIfNotExists } from "../util.js";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      title: "USD",
      description: "An amount denominated in US Dollars",
      type: "number",
    },
    webShortname: "hash",
    migrationState,
  });

  await createSystemDataTypeIfNotExists(context, authentication, {
    dataTypeDefinition: {
      title: "GBP",
      description: "An amount denominated in British pounds sterling",
      type: "number",
    },
    webShortname: "hash",
    migrationState,
  });

  return migrationState;
};

export default migrate;
