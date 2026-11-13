import { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { ensureUnitDataType } from "../shared/ensure-unit-data-type";

import type { MigrationFunction } from "../../types";
import type { SiUnitGroup, UnitSystem } from "./si-unit-groups";
import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";

export const seedUnitGroups = async (
  { context, authentication, migrationState }: Parameters<MigrationFunction>[0],
  groups: SiUnitGroup[],
): ReturnType<MigrationFunction> => {
  const unitDefinitions = new Map(
    groups.flatMap((group) =>
      group.units.map((unit) => [unit.title, unit] as const),
    ),
  );
  const unitParents = new Map<string, Set<VersionedUrl>>();

  for (const group of groups) {
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

    const units = [
      ...group.units,
      ...(group.sharedUnits ?? []).map((title) => {
        const unit = unitDefinitions.get(title);
        if (!unit) {
          throw new Error(`Shared unit '${title}' is not in the catalogue`);
        }
        return unit;
      }),
    ];
    const systems = new Set<UnitSystem>(
      units.flatMap<UnitSystem>((unit) => unit.systems ?? ["Metric"]),
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

    for (const unit of units) {
      const parents = unitParents.get(unit.title) ?? new Set<VersionedUrl>();
      for (const system of unit.systems ?? ["Metric"]) {
        const systemId = systemIds.get(system);
        if (!systemId) {
          throw new Error(`Unit system '${system}' has not been seeded`);
        }
        parents.add(systemId);
      }
      unitParents.set(unit.title, parents);
    }
  }

  const seededUnitBaseUrls = new Set<BaseUrl>();
  for (const unit of unitDefinitions.values()) {
    for (const target of Object.keys(unit.conversions ?? {})) {
      if (!seededUnitBaseUrls.has(target as BaseUrl)) {
        throw new Error(`Conversion target '${target}' has not been seeded`);
      }
    }

    const dataType = await ensureUnitDataType(context, authentication, {
      dataTypeDefinition: {
        allOf: [...(unitParents.get(unit.title) ?? [])].sort().map(($ref) => ({
          $ref,
        })),
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

  return migrationState;
};
