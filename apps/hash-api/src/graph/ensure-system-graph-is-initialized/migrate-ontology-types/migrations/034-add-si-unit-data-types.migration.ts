import { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { ensureUnitDataType } from "./034-add-si-unit-data-types/ensure-unit-data-type";
import { siUnitGroups } from "./034-add-si-unit-data-types/si-unit-groups";

import type { MigrationFunction } from "../types";
import type { UnitSystem } from "./034-add-si-unit-data-types/si-unit-groups";
import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";

const migrate: MigrationFunction = async ({
  context,
  authentication,
  migrationState,
}) => {
  for (const group of siUnitGroups) {
    const quantity = await ensureUnitDataType(context, authentication, {
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
    });

    const systems = new Set<UnitSystem>(
      group.units.flatMap<UnitSystem>((unit) => unit.systems ?? ["Metric"]),
    );
    const systemIds = new Map<UnitSystem, VersionedUrl>();
    for (const system of systems) {
      const systemGroup = await ensureUnitDataType(context, authentication, {
        dataTypeDefinition: {
          allOf: [{ $ref: quantity.schema.$id }],
          abstract: true,
          title: `${group.title} (${system})`,
          description: `${group.title} expressed in ${system === "Metric" ? "metric units, including SI units and their accepted companions" : system === "Imperial" ? "imperial units, including units shared with US customary measurement" : "US customary units"}.`,
          type: "number",
        },
        conversions: {},
        migrationState,
        webShortname: "h",
      });
      systemIds.set(system, systemGroup.schema.$id);
    }

    const seededUnitBaseUrls = new Set<BaseUrl>();

    for (const unit of group.units) {
      for (const target of Object.keys(unit.conversions ?? {})) {
        if (!seededUnitBaseUrls.has(target as BaseUrl)) {
          throw new Error(`Conversion target '${target}' has not been seeded`);
        }
      }

      const dataType = await ensureUnitDataType(context, authentication, {
        dataTypeDefinition: {
          allOf: (unit.systems ?? ["Metric"]).map((system) => {
            const systemId = systemIds.get(system);
            if (!systemId) {
              throw new Error(`Unit system '${system}' has not been seeded`);
            }
            return { $ref: systemId };
          }),
          title: unit.title,
          description: unit.description,
          label: { right: unit.symbol },
          type: "number",
          ...(unit.minimum === undefined ? {} : { minimum: unit.minimum }),
        },
        conversions: unit.conversions ?? {},
        migrationState,
        webShortname: "h",
      });
      seededUnitBaseUrls.add(dataType.metadata.recordId.baseUrl);
    }
  }

  return migrationState;
};

export default migrate;
