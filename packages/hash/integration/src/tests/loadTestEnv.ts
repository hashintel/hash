// Load the test environment variables
[
  { name: "PORT", value: "5003" },
  { name: "SESSION_SECRET", value: "secret" },
  { name: "FRONTEND_DOMAIN", value: "localhost:3000" },
].map(({ name, value }) => (process.env[name] = value));
