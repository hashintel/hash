import { DbClient } from "@hashintel/hash-api/src/db";
import { EntityType, Org } from "@hashintel/hash-api/src/model";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { createStreamIngester } from "./createStreamIngester";
import _ from "lodash";
import { invariant } from "../utils/invariant";
import { objMapAsync } from "../utils/objMapAsync";

/**
 * Consider making this able to be more adaptive to the kind of data ingested.
 *
 * See [Explore: Support ingestion of arbitrary Taps](https://app.asana.com/0/1200211978612931/1201990271017512/f)
 */
export type AnyStreamsConfig = Record<
  string,
  {
    entityTypeTitle: string;
    keyProperties: string[];
  }
>;

export async function createTargetOrg(
  db: DbClient,
  logger: Logger,
  orgShortname: string,
  streams: AnyStreamsConfig,
) {
  logger = logger.child({ orgName: orgShortname });
  // Get the system org - it's already been created as part of db migration
  const org = await Org.getOrgByShortname(db, {
    shortname: orgShortname,
  });

  invariant(
    org,
    `Expected to find system org with shortname: '${orgShortname}'`,
  );

  const existingTypes = await EntityType.getAccountEntityTypes(db, {
    accountId: org.accountId,
  });

  /** Gets or inserts entity types */
  async function ensureEntityTypeByTitle(
    entityTypeTitle: string,
  ): Promise<{ entityId: string; entityVersionId: string }> {
    invariant(org, "org checked");

    const existingIssueType = existingTypes.find(
      (a) => a.properties.title === entityTypeTitle,
    );
    if (existingIssueType) {
      return {
        entityVersionId: existingIssueType.entityVersionId,
        entityId: existingIssueType.entityId,
      };
    }

    const newEntityType = await EntityType.create(db, {
      schema: {
        // Hmm: Do we need to define some kind of intentional schema for this?
        type: "object",
        additionalProperties: true,
        properties: {},
      },
      accountId: org.accountId,
      createdByAccountId: org.accountId,
      name: entityTypeTitle, // becomes properties.title
    });

    return {
      entityVersionId: newEntityType.entityVersionId,
      entityId: newEntityType.entityId,
    };
  }

  const streamUpdatersByName = await objMapAsync(
    streams,
    async ({ keyProperties, entityTypeTitle }, stream) =>
      createStreamIngester(db, {
        logger,
        stream,
        accountId: org.accountId,
        keyProperties,
        entityType: await ensureEntityTypeByTitle(entityTypeTitle),
      }),
  );

  return {
    getStreamIngester(streamName: string) {
      return streamUpdatersByName[streamName] ?? null;
    },
  };
}
