import { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { activeCurrencies } from "../currencies";
import { createSystemDataTypeIfNotExists } from "../util";

import type { MigrationFunction } from "../types";

// Currencies with a well-known symbol; the rest display with their ISO code.
const currencySymbols: Record<string, string> = {
  USD: "$",
  GBP: "£",
  EUR: "€",
  JPY: "¥",
  CNY: "¥",
  INR: "₹",
};

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  const currencyDataType = await createSystemDataTypeIfNotExists(
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

  for (const { code, name } of activeCurrencies) {
    const symbol = currencySymbols[code];
    await createSystemDataTypeIfNotExists(context, authentication, {
      dataTypeDefinition: {
        allOf: [{ $ref: currencyDataType.schema.$id }],
        title: code,
        description: `An amount denominated in ${name} (ISO 4217 ${code}).`,
        type: "number",
        ...(symbol ? { label: { left: symbol } } : {}),
      },
      conversions: {},
      webShortname: "h",
      migrationState,
    });
  }

  return migrationState;
};

export default migrate;
