// Load the test environment variables
Object.assign(process.env, {
  PORT: "5003",
  SESSION_SECRET: "secret",
  FRONTEND_DOMAIN: "localhost:3000",
});
