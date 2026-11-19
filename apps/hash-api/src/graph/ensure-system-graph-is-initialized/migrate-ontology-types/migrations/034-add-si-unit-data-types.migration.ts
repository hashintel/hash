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
  const unitDefinitions = new Map(
    siUnitGroups.flatMap((group) =>
      group.units.map(
        (unit) => [unit.dataTypeBaseUrl ?? unit.title, unit] as const,
      ),
    ),
  );
  const unitParents = new Map<string, Set<VersionedUrl>>();

  for (const group of siUnitGroups) {
    const quantity = await ensureUnitDataType(context, authentication, {
      dataTypeDefinition: {
        allOf: [{ $ref: blockProtocolDataTypes.number.dataTypeId }],
        abstract: true,
        title: group.title,
        ...(group.titlePlural === undefined
          ? {}
          : { titlePlural: group.titlePlural }),
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
          ...(group.titlePlural === undefined
            ? {}
            : { titlePlural: `${group.titlePlural} (${system})` }),
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
      const parents =
        unitParents.get(unit.dataTypeBaseUrl ?? unit.title) ??
        new Set<VersionedUrl>();
      for (const system of unit.systems ?? ["Metric"]) {
        const systemId = systemIds.get(system);
        if (!systemId) {
          throw new Error(`Unit system '${system}' has not been seeded`);
        }
        parents.add(systemId);
      }
      unitParents.set(unit.dataTypeBaseUrl ?? unit.title, parents);
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
        allOf: [
          ...(unitParents.get(unit.dataTypeBaseUrl ?? unit.title) ?? []),
        ].map(($ref) => ({
          $ref,
        })),
        title: unit.title,
        ...(unit.titlePlural === undefined
          ? {}
          : { titlePlural: unit.titlePlural }),
        description: unit.description,
        label: { right: unit.symbol },
        type: "number",
        ...(unit.minimum === undefined ? {} : { minimum: unit.minimum }),
      },
      dataTypeBaseUrl: unit.dataTypeBaseUrl,
      conversions: unit.conversions ?? {},
      migrationState,
      webShortname: unit.dataTypeBaseUrl?.startsWith("https://hash.ai/@bipm/")
        ? "bipm"
        : "h",
    });
    seededUnitBaseUrls.add(dataType.metadata.recordId.baseUrl);
  }

  return migrationState;
};

export default migrate;
