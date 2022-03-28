import { DbClient } from "@hashintel/hash-api/src/db";
import _ from "lodash";
import { Entity } from "@hashintel/hash-api/src/model";
import { stringy } from "../utils/stringy";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { StreamConfig } from "./createTargetOrg";

// class IngestedEntity extends Entity {
//   constructor(public readonly key: string) {
//     super()
//   }
// }
type CreateIngestEntity = {
  properties: Record<string, any>;
};

export function createStreamIngester(
  db: DbClient,
  options: {
    stream: string;
    logger: Logger;
    entityType: { entityId: string; entityVersionId: string };
    /**
     * Question: Maybe an org account id?
     *
     * TODO: Separate updator Account ID
     */
    accountId: string;
    streamConfig: StreamConfig;
  },
) {
  const logger = options.logger.child({
    name: "stream",
    stream: options.stream,
  });
  // TODO: Actually use a gsql query for looking into the key properties

  // For now: actually keep track of inserted/updated in this list
  const allEntitiesPromise = Entity.getEntitiesByType(db, {
    accountId: options.accountId,
    entityTypeId: options.entityType.entityId,
    entityTypeVersionId: options.entityType.entityVersionId,
    latestOnly: true,
  });

  async function lookForExisting(
    entityIn: CreateIngestEntity,
  ): Promise<Entity | null> {
    const needToMatch = options.streamConfig.keyProperties.map(
      (prop) => [prop, entityIn.properties[prop]] as const,
    );

    eachEntity: for (const ent of await allEntitiesPromise) {
      for (const [toMatchKey, toMatchValue] of needToMatch) {
        if (!_.isEqual(ent.properties[toMatchKey], toMatchValue)) {
          continue eachEntity;
        }
      }

      // it matched all
      return ent;
    }

    // not found
    return null;
  }
  return {
    async upsertEntity(upsertEntityOptions: {
      properties: Record<string, any>;
    }): Promise<void> {
      const found = await lookForExisting({
        properties: upsertEntityOptions.properties,
      });

      if (found) {
        // check if it's actually different
        const isChanged = !_.isEqual(
          found.properties,
          upsertEntityOptions.properties,
        );

        if (isChanged) {
          const updateEnt = await Entity.updateProperties(db, {
            accountId: options.accountId,
            entityId: found.entityId,
            properties: {
              // hmm...
              // extractionTime: message.extraction_time,
              ...upsertEntityOptions.properties,
            },
            updatedByAccountId: options.accountId,
          });

          logger.debug(`Updated entity: ${stringy(updateEnt)}`);
        }
      } else {
        // create entity

        const createdEnt = await Entity.create(db, {
          accountId: options.accountId,
          createdByAccountId: options.accountId,
          // entityTypeId: entityTypes.issue.entityId,
          entityTypeVersionId: options.entityType.entityVersionId,
          properties: upsertEntityOptions.properties,
          versioned: true,
          // entityId: undefined,
          // entityVersionId: undefined,
        });

        logger.debug(`Created entity: ${stringy(createdEnt)}`);
      }
    },
  };
}
