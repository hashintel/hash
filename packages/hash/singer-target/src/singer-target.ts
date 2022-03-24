import { createReadlineInterface } from "./createReadlineInterface";
import { PostgresAdapter } from "@hashintel/hash-api/src/db";
import { Entity, EntityType, Org } from "@hashintel/hash-api/src/model";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { inspect } from "util";
import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "hash-singer-target",
  useStream: process.stderr,
});

const db = new PostgresAdapter(
  {
    host: process.env.HASH_PG_HOST ?? "localhost",
    user: "postgres",
    port: 5432,
    database: process.env.HASH_PG_DATABASE ?? "hash_singer_target",
    password: "postgres",
    maxPoolSize: 10,
  },
  logger,
);

const waitingTasks: Promise<void>[] = [];
go()
  .then(() => Promise.all(waitingTasks))
  .catch((err) => {
    logger.error(err);
    process.exit(1);
  });

const ISSUES_TYPE_NAME = "GithubIssue";
// const ISSUES_TYPE_NAME = "IngestGithubStreamIssue$Jhesd";
// const ISSUES_TYPE_NAME_1 = `IngestAirtableBase$${TARGET_DATASET}`;

async function go() {
  // Get the system org - it's already been created as part of db migration
  const systemOrg = await Org.getOrgByShortname(db, {
    shortname: getRequiredEnv("SYSTEM_ACCOUNT_SHORTNAME"),
  });

  invariant(
    systemOrg,
    `Expected to find system org with shortname: '${getRequiredEnv(
      "SYSTEM_ACCOUNT_SHORTNAME",
    )}'`,
  );

  const entityTypes = await iif(async () => {
    const existingTypes = await EntityType.getAccountEntityTypes(db, {
      accountId: systemOrg.accountId,
    });

    const existingIssueType = existingTypes.find(
      (a) => a.properties.title === ISSUES_TYPE_NAME,
    );
    if (existingIssueType) {
      return {
        issue: {
          version: existingIssueType.entityVersionId,
          entityId: existingIssueType.id,
        },
      };
    }

    const newEntityType = await EntityType.create(db, {
      schema: {
        // $id: generateSchema$id(),
        type: "object",
        additionalProperties: true,
        properties: {},
      },
      accountId: systemOrg.accountId,
      createdByAccountId: systemOrg.accountId,
      name: ISSUES_TYPE_NAME, // becomes properties.title
    });

    return {
      issue: {
        version: newEntityType.entityVersionId,
        entityId: newEntityType.entityId,
      },
    };
  });

  // User.getUserByShortname(db, {
  //   shortname: getRequiredEnv("SYSTEM_ACCOUNT_SHORTNAME"),
  // })

  // console.error(systemOrg)
  logger.debug(`issue: ${stringy(entityTypes)}`);
  // logger.debug(
  //   `systemOrg ${stringy(systemOrg)}, issue: ${stringy(entityTypes)}`,
  // );

  await createReadlineInterface((line) => {
    invariant(systemOrg, `non null`);

    try {
      const message = JSON.parse(line);
      if (message.stream === "issues") {
        console.error(message);

        if (message.type === "RECORD") {
          // issuesQueue.push(message.record)

          waitingTasks.push(
            Entity.create(db, {
              accountId: systemOrg.accountId,
              createdByAccountId: systemOrg.accountId,
              // entityTypeId: entityTypes.issue.entityId,
              entityTypeVersionId: entityTypes.issue.version,
              properties: message.record,
              versioned: true,
              // entityId: undefined,
              // entityVersionId: undefined,
            }).then((a) => {
              console.error("Look at my entity!", a);
            }),
          );
        }
      }
    } catch (err) {
      // logger.error(err);
      process.exit(1);
    }
  });
}

function stringy(object: any): string {
  return inspect(object, {
    colors: true,
    compact: true,
    showHidden: true,
    depth: 5,
    maxArrayLength: 3,
  });
}

function iif<R>(fn: () => R): R {
  return fn();
}

function invariant(
  x: any,
  message: string,
  options: InvariantOptions = {},
): asserts x {
  if (!x) {
    throw new InvariantError(message, options);
  }
}

type InvariantOptions = {
  found?: any;
};

class InvariantError extends Error {
  constructor(message: string, options: InvariantOptions) {
    if ("found" in options) {
      super(`${message}; found: ${stringy(options.found)}`);
    } else {
      super(message);
    }
    this.name = "Invariant";
    this.stack = this.stack
      ?.split(/\n\r?/g)
      .filter((a) => !a.includes("nvariant"))
      .join("\n");
  }
}
