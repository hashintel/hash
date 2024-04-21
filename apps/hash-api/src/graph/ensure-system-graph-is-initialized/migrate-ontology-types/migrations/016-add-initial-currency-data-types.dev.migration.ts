import type { MigrationFunction } from "../types";
import { createSystemDataTypeIfNotExists } from "../util";

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
