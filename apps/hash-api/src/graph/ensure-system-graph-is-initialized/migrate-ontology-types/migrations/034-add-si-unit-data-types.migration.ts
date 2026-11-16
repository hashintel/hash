import { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { createSystemDataTypeIfNotExists } from "../util";
import { siUnitGroups } from "./034-add-si-unit-data-types/si-unit-groups";

import type { MigrationFunction } from "../types";
import type {
  BaseUrl,
  Conversions,
  ConversionValue,
} from "@blockprotocol/type-system";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  for (const group of siUnitGroups) {
    const quantity = await createSystemDataTypeIfNotExists(
      context,
      authentication,
      {
        dataTypeDefinition: {
          allOf: [{ $ref: blockProtocolDataTypes.number.dataTypeId }],
          abstract: true,
          title: group.title,
          description: group.description,
          type: "number",
        },
        conversions: {},
        migrationState,
        webShortname: "h",
      },
    );

    const unitBaseUrls = new Map<string, BaseUrl>();

    for (const unit of group.units) {
      const conversions: Record<BaseUrl, Conversions> = {};

      if (unit.conversion) {
        const {
          target,
          factor = 1,
          divisor = 1,
          inputOffset = 0,
          offset = 0,
        } = unit.conversion;
        const targetBaseUrl = unitBaseUrls.get(target);
        if (!targetBaseUrl) {
          throw new Error(`Conversion target '${target}' has not been seeded`);
        }

        const constant = (value: number): ConversionValue => ({
          const: value,
          type: "number",
        });

        conversions[targetBaseUrl] = {
          to: {
            expression: [
              "+",
              [
                "/",
                ["*", ["+", "self", constant(inputOffset)], constant(factor)],
                constant(divisor),
              ],
              constant(offset),
            ],
          },
          from: {
            expression: [
              "-",
              [
                "/",
                ["*", ["-", "self", constant(offset)], constant(divisor)],
                constant(factor),
              ],
              constant(inputOffset),
            ],
          },
        };
      }

      const dataType = await createSystemDataTypeIfNotExists(
        context,
        authentication,
        {
          dataTypeDefinition: {
            allOf: [{ $ref: quantity.schema.$id }],
            title: unit.title,
            description: unit.description,
            label: { right: unit.symbol },
            type: "number",
            ...(unit.minimum === undefined ? {} : { minimum: unit.minimum }),
          },
          conversions,
          migrationState,
          webShortname: "h",
        },
      );
      unitBaseUrls.set(unit.title, dataType.metadata.recordId.baseUrl);
    }
  }

  return migrationState;
};

export default migrate;
