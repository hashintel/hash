import { CronJob } from "cron";
import { Logger } from "winston";
import { DBAdapter } from "./adapter";

export const setupCronJobs = (db: DBAdapter, logger: Logger) => {
  // Once a day (at 5am) prune expired login codes from the datastore
  new CronJob(
    "0 0 5 * * *",
    () =>
      db
        .pruneLoginCodes()
        .then((numberOfDeleted) =>
          logger.info(
            `Cron Job: pruned ${numberOfDeleted} expired login codes from the datastore.`
          )
        ),
    null,
    true
  );
};
