import { Logger } from "@hashintel/hash-backend-utils/logger";
import { PostgresAdapter } from "../db";
import { User, Org, OrgInvitationLink } from "../model";

/**
 * DRAFT:
 * Running against production requires:
 * - Being VERY sure about the correctness of the script. It's recommended to test against a local DB first!!
 * - setting the right info in the below PGAdapter
 * - change .env to use the proper system_account (if changed)
 * - Being absolutely certain that the script is correct.
 *
 * Running the script from the `packages/hash/api` directory
 * $ ts-node --require dotenv-flow/config --transpile-only src/scripts/membership-manage.ts
 *
 */

// The below script adds people in the `data` list to the org given by `orgShortname`
const data = [
  { shortname: "shortname", responsibility: "Engineering" },
] as const;

const orgShortname = "hash1";

(async () => {
  const logger = new Logger({
    mode: "dev",
    level: "debug",
    serviceName: "ad-hoc",
  });

  const db: PostgresAdapter = new PostgresAdapter(
    {
      host: "PROD_HOST_URL",
      user: "api",
      port: 5432,
      database: "postgres",
      password: process.env.HASH_SCRIPT_DB_PASSWORD ?? "",
      maxPoolSize: 10,
    },
    logger,
  );

  // Run locally
  // const db: PostgresAdapter = new PostgresAdapter(
  //   {
  //     host: "localhost",
  //     user: "postgres",
  //     port: 5432,
  //     database: "postgres",
  //     password: "postgres",
  //     maxPoolSize: 10,
  //   },
  //   logger,
  // );

  const org = (await Org.getOrgByShortname(db, { shortname: orgShortname }))!;

  for (const { shortname, responsibility } of data) {
    const acc = await User.getUserByShortname(db, {
      shortname,
    });

    await acc?.joinOrg(db, {
      org,
      responsibility,
      updatedByAccountId: acc.entityId,
    });

    console.log("Joined org:", {
      acc: acc?.properties.shortname,
      accId: acc?.entityId,
      org: org.properties.shortname,
    });
  }
})()
  .catch(console.log)
  .finally(() => {
    process.exit(0);
  });
