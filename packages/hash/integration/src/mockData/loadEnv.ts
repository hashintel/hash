import dotenv from "dotenv";

// Load the environment variables from the .env file
dotenv.config({ path: "../docker/.env" });

// Load the developer environment variables
Object.assign(process.env, {
  PORT: process.env.PORT || "5003",
  HASH_PG_HOST: process.env.HASH_PG_HOST || "localhost",
  HASH_PG_USER: process.env.HASH_PG_USER || "postgres",
  HASH_PG_PASSWORD: process.env.HASH_PG_PASSWORD || "postgres",
  HASH_PG_DATABASE: process.env.HASH_PG_DATABASE || "postgres",
  HASH_PG_PORT: parseInt(process.env.HASH_PG_PORT || "5432", 10),
  SESSION_SECRET: process.env.SESSION_SECRET || "secret",
  FRONTEND_DOMAIN: process.env.FRONTEND_DOMAIN || "localhost:3000",
});
