import "@hashintel/hash-backend-utils/load-dotenv-files";

// Load the test environment variables
Object.assign(process.env, {
  PORT: "5003",
  SESSION_SECRET: "secret",
  FRONTEND_DOMAIN: "localhost:3000",
  AWS_REGION: "us-east-1",
  AWS_S3_UPLOADS_BUCKET: "hash-file-uploads-dev",
});
