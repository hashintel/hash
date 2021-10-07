import dotenv from "dotenv";

// Load the environment variables from the .env file
dotenv.config({ path: "../docker/.env" });

// Load the developer environment variables
Object.assign(process.env, {
  PORT: "5003",
  HASH_PG_HOST: "localhost",
  HASH_PG_USER: "postgres",
  HASH_PG_PORT: "5432",
  HASH_PG_DATABASE: "postgres",
  HASH_PG_PASSWORD: "postgres",
  SESSION_SECRET: "secret",
  FRONTEND_DOMAIN: "localhost:3000",
});
