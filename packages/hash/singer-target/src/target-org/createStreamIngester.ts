import { DbClient } from "@hashintel/hash-api/src/db";
import _ from "lodash";
import { Entity } from "@hashintel/hash-api/src/model";
import { stringy } from "../utils/stringy";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { invariant } from "../utils/invariant";

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
    keyProperties: string[];
  },
) {
  const logger = options.logger.child({
    name: "StreamIngester",
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
    const needToMatch = options.keyProperties.map(
      (prop) => [prop, entityIn.properties[prop]] as const,
    );

    eachEntity: for (const ent of await allEntitiesPromise) {
      for (const [toMatchKey, toMatchValue] of needToMatch) {
        if (!_.isEqual(ent.properties[toMatchKey], toMatchValue)) {
          continue eachEntity;
        }
      }

      // it matched all key properties
      return ent;
    }

    // not found
    return null;
  }
  let finished = false;
  const updated = new Map<string, Entity>();
  const inserted = new Map<string, Entity>();
  return {
    /**
     * Take completed results to be used for follow-up linking and the like
     *
     * Progress 1/10:
     *
     * Not entirely sure about storing all this information here as opposed to
     * crafting a postgresql for later linking.
     *
     * With sufficiently large datasets, this approach could quickly fall over.
     * It seems like it would be best to have some way to keep a queue of potentially
     * linkable follow-ups on a stack that can be taken off a stack as insertions/queryies
     * are made. But, this runs a potential risk of when an entity is updated twice in
     * succession (possibly invalidating incoming links).
     *
     * This further re-inforces a goal of mine to have some sort of linking information
     * just stored in PostgreSQL (e.g. a jsonb column for links, example: `{ issues: [{ type: <EntityTypeID>, whereEq: { url: "https://..."} }] }`).
     * Perhaps using a trigger to do book keeping?
     *
     */
    finishAndCollectResults() {
      finished = true;
      return {
        updated,
        inserted,
      };
    },
    async upsertEntity(upsertEntityOptions: {
      record: Record<string, any>;
    }): Promise<StreamIngesterFollowUp[]> {
      invariant(
        !finished,
        "unexpected upsert after finishAndCollectResults() called.",
        { found: upsertEntityOptions },
      );
      const found = await lookForExisting({
        properties: upsertEntityOptions.record,
      });

      if (found) {
        // check if it's actually different
        const isChanged = !_.isEqual(
          found.properties,
          upsertEntityOptions.record,
        );

        if (isChanged) {
          const updateEnt = await Entity.updateProperties(db, {
            accountId: options.accountId,
            entityId: found.entityId,
            properties: {
              // hmm...
              // extractionTime: message.extraction_time,
              ...upsertEntityOptions.record,
            },
            updatedByAccountId: options.accountId,
          });

          logger.debug(`Updated entity: ${stringy(updateEnt)}`);

          return [
            {
              type: "link",
              link: {
                entity: updateEnt,
                record: upsertEntityOptions.record,
              },
            },
          ];
        } else {
          return [];
        }
      } else {
        // create entity

        const createdEnt = await Entity.create(db, {
          accountId: options.accountId,
          createdByAccountId: options.accountId,
          // entityTypeId: entityTypes.issue.entityId,
          entityTypeVersionId: options.entityType.entityVersionId,
          properties: upsertEntityOptions.record,
          versioned: true,
          // entityId: undefined,
          // entityVersionId: undefined,
        });

        logger.debug(`Created entity: ${stringy(createdEnt)}`);
      }
    },
  };
}

export type StreamIngesterFollowUpLink = {
  entity: Entity;
  record: Record<string, any>;
};
export type StreamIngesterFollowUp = {
  type: "link";
  link: StreamIngesterFollowUpLink;
};
