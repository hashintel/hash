import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";

import { createPool, sql } from "slonik";

const createDataType = (client: params: {

}) => {

}

const main = async () => {
  const host = getRequiredEnv("HASH_PG_HOST");
  const user = getRequiredEnv("HASH_PG_USER");
  const database = getRequiredEnv("HASH_PG_DATABASE");
  const password = getRequiredEnv("HASH_PG_PASSWORD");
  const port = parseInt(getRequiredEnv("HASH_PG_PORT"), 10);

  const connStr = `postgresql://${user}:${password}@${host}:${port}/${database}`;

  const pool = createPool(connStr);

  await pool.transaction((client) => {
    
  })



};

void (async () => {
  await main();
})();
