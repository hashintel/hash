import dotenv from "dotenv";

// Load the environment variables from the .env file
dotenv.config({ path: "../docker/.env" });

// Load the developer environment variables
[
  { name: "PORT", value: "5003" },
  { name: "HASH_PG_HOST", value: "localhost" },
  { name: "HASH_PG_USER", value: "postgres" },
  { name: "HASH_PG_PORT", value: "5432" },
  { name: "HASH_PG_DATABASE", value: "postgres" },
  { name: "HASH_PG_PASSWORD", value: "postgres" },
  { name: "SESSION_SECRET", value: "secret" },
  { name: "FRONTEND_DOMAIN", value: "localhost:3000" },
].map(({ name, value }) => (process.env[name] = value));
