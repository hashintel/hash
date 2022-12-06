import {
  SYSTEM_ACCOUNT_NAME,
  SYSTEM_ACCOUNT_SHORTNAME,
} from "@hashintel/hash-shared/environment";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { GraphApi } from "@hashintel/hash-graph-client";
import { types } from "@hashintel/hash-shared/types";
import { getEntities } from "@hashintel/hash-subgraph/src/stdlib/element/entity";
import {
  extractEntityUuidFromEntityId,
  Subgraph,
  SubgraphRootTypes,
} from "@hashintel/hash-subgraph";
import { extractBaseUri } from "@blockprotocol/type-system";
import { OrgModel, OrgSize } from "../model";
import { PageDefinition, seedPages } from "../seed-data/seed-pages";

// eslint-disable-next-line import/no-mutable-exports
export let systemOrgAccountId: string;

/**
 * Ensure the `systemOrgAccountId` exists by fetching it or creating it. Note this
 * method is designed to be run before the system types are initialized.
 */
export const ensureSystemOrgAccountIdExists = async (params: {
  graphApi: GraphApi;
  logger: Logger;
}) => {
  const { graphApi, logger } = params;
  const { data: existingOrgEntitiesSubgraph } =
    await graphApi.getEntitiesByQuery({
      filter: {
        all: [
          { equal: [{ path: ["version"] }, { parameter: "latest" }] },
          {
            equal: [
              { path: ["type", "versionedUri"] },
              { parameter: types.entityType.org.entityTypeId },
            ],
          },
        ],
      },
      graphResolveDepths: {
        inheritsFrom: { outgoing: 0 },
        constrainsValuesOn: { outgoing: 0 },
        constrainsPropertiesOn: { outgoing: 0 },
        constrainsLinksOn: { outgoing: 0 },
        constrainsLinkDestinationsOn: { outgoing: 0 },
        isOfType: { outgoing: 0 },
        hasLeftEntity: { outgoing: 0, incoming: 0 },
        hasRightEntity: { outgoing: 0, incoming: 0 },
      },
    });

  const existingOrgEntities = getEntities(
    existingOrgEntitiesSubgraph as Subgraph<SubgraphRootTypes["entity"]>,
  );

  const existingSystemOrgEntity = existingOrgEntities.find(
    ({ properties }) =>
      properties[
        extractBaseUri(types.propertyType.shortName.propertyTypeId)
      ] === SYSTEM_ACCOUNT_SHORTNAME,
  );

  if (existingSystemOrgEntity) {
    systemOrgAccountId = extractEntityUuidFromEntityId(
      existingSystemOrgEntity.metadata.editionId.baseId,
    );
    logger.info(`Using existing system org account id: ${systemOrgAccountId}`);
  } else {
    systemOrgAccountId = (await graphApi.createAccountId()).data;
    logger.info(`Created system org account id: ${systemOrgAccountId}`);
  }
};

// eslint-disable-next-line import/no-mutable-exports
export let systemOrgModel: OrgModel;

/**
 * Ensure the `systemOrgModel` exists by fetching it or creating it using
 * the `systemOrgAccountId`. Note this method must be run after the
 * `systemOrgAccountId` and the system types have been initialized.
 */
export const ensureSystemOrgExists = async (params: {
  graphApi: GraphApi;
  logger: Logger;
}) => {
  const { graphApi, logger } = params;

  const existingSystemOrgModel = await OrgModel.getOrgByShortname(graphApi, {
    shortname: SYSTEM_ACCOUNT_SHORTNAME,
  });

  if (existingSystemOrgModel) {
    systemOrgModel = existingSystemOrgModel;
  } else {
    systemOrgModel = await OrgModel.createOrg(graphApi, {
      name: SYSTEM_ACCOUNT_NAME,
      shortname: SYSTEM_ACCOUNT_SHORTNAME,
      providedInfo: {
        orgSize: OrgSize.ElevenToFifty,
      },
      actorId: systemOrgAccountId,
    });

    logger.info(
      `System Org available with shortname = "${systemOrgModel.getShortname()}"`,
    );

    const pageTitles: PageDefinition[] = [
      { title: "First" },
      { title: "Second" },
      { title: "Third" },
    ];

    await seedPages(pageTitles, systemOrgModel.getEntityUuid(), params);

    logger.info(
      `System Org with shortname = "${systemOrgModel.getShortname()}" now has seeded pages.`,
    );
  }
};
