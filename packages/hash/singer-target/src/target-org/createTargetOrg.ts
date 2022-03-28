import { DbClient } from "@hashintel/hash-api/src/db";
import { EntityType, Org } from "@hashintel/hash-api/src/model";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { createStreamIngester } from "./createStreamIngester";
import _ from "lodash";
import { invariant } from "../utils/invariant";
import { objMapAsync } from "../utils/objMapAsync";

/**
 * Some definition for filtering over JSONB column `properties` value for `entity_version`.
 *
 * Progress 1/10:
 *
 * Is this good enough for most use-cases?
 *  * Should we support nested fields?
 *    * Consider if it's good enough to have dot delimited properties for ids?
 *      e.g. `whereEq: { "repo.id": value? }`
 *      Here's how postgres works for first level `SELECT * FROM users WHERE metadata @> '{"country": "Peru"}';`
 *
 * Consider if there are any cases where we _need_ OR filtering or likewise.
 * Currently, it seems like most joining logics will be sufficed with
 * a simple AND eq chain, and maybe if that's not enough, perhaps it's
 * easier in the long-run anyway to change the stream/schema to make this
 * eq more easily supportable.
 *
 * e.g. `<oauth-provider>:<resource-id>:<domain>` where the schema is a mismash of
 * anyOfs of google, twitter, github key values.
 */
export type JSONFilterDefinition = {
  whereEq: Record<string, any>;
};

export type StreamConfig = {
  entityTypeTitle: string;
  keyProperties: string[];
  links: Record<
    /** e.g. `issue` */
    string,
    {
      /** e.g. `GithubIssue` */
      destinationTypeTitle: string;
      /** e.g. `issueComments` to become `$.issueComments` on `link_version` model */
      destinationInverseOfPath?: string;
      /** Map the record into a list of JSONB filter definitions */
      extract(record: any): Array<JSONFilterDefinition>;
    }
  >;
};

/**
 * Consider making this able to be more adaptive to the kind of data ingested.
 *
 * See [Explore: Support ingestion of arbitrary Taps](https://app.asana.com/0/1200211978612931/1201990271017512/f)
 */
export type AnyStreamsConfig = Record<string, StreamConfig>;

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
    createWithSchema: () => { properties: Record<string, any> },
  ): Promise<{ entityId: string; entityVersionId: string }> {
    invariant(org, "org checked");

    const existingTypeForTitle = existingTypes.find(
      (a) => a.properties.title === entityTypeTitle,
    );
    if (existingTypeForTitle) {
      return {
        entityVersionId: existingTypeForTitle.entityVersionId,
        entityId: existingTypeForTitle.entityId,
      };
    }

    const schema = createWithSchema();
    const newEntityType = await EntityType.create(db, {
      schema: {
        // Hmm: Do we need to define some kind of intentional schema for this?
        type: "object",
        additionalProperties: true,
        properties: schema.properties,
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
    async (config, stream) =>
      createStreamIngester(db, {
        logger,
        stream,
        streamConfig: config,
        accountId: org.accountId,
        entityType: await ensureEntityTypeByTitle(
          config.entityTypeTitle,
          () => ({
            // hmm... base on config?
            properties: {},
          }),
        ),
      }),
  );

  return {
    getStreamIngester(streamName: string) {
      return streamUpdatersByName[streamName] ?? null;
    },
  };
}
