import { CronJob } from 'cron';
import { DBAdapter } from './adapter';

export const setupCronJobs = (db: DBAdapter) => {
  // Once a day (at midnight) prune expired login codes from the datastore
  new CronJob(
    '0 0 0 * * *',
    db.pruneLoginCodes,
    null,
    true,
  );
};

