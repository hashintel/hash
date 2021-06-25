import { Pool } from "pg";

import { DBAdapter } from "../adapter";

/** Get a required environment variable. Throws an error if it's not set. */
const getRequiredEnv = (name: string) => {
  const value = process.env[name];
  if (value === undefined) {
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value;
};

const parsePort = (s: string) => {
  if (/^\d+$/.test(s)) {
    return parseInt(s);
  }
  throw new Error("PG_PORT must be a positive number");
};

export class PostgresAdapter implements DBAdapter {
  pool: Pool;

  constructor() {
    this.pool = new Pool({
      user: getRequiredEnv("HASH_PG_USER"),
      host: getRequiredEnv("HASH_PG_HOST"),
      port: parsePort(getRequiredEnv("HASH_PG_PORT")),
      database: getRequiredEnv("HASH_PG_DATABASE"),
      password: getRequiredEnv("HASH_PG_PASSWORD"),
    });
  }

  // Execute a query. This is exposed only temporarily. The actual database adapter will
  // export product-specific functions behind an interface (e.g. createUser ...)
  query = (text: string, params?: any) => {
    return this.pool.query(text, params);
  };
}
