import express from "express";
import { json } from "body-parser";
import helmet from "helmet";

import { createApolloServer } from "./graphql/createApolloServer";

// Configure the Express server
const app = express();
const PORT = process.env.PORT ?? 5001;

// Set sensible default security headers: https://www.npmjs.com/package/helmet
// Temporarily disable contentSecurityPolicy for the GraphQL playground
// Longer-term we can set rules which allow only the playground to load
// Potentially only in development mode
app.use(helmet({ contentSecurityPolicy: false }));

// Parse request body as JSON - allow higher than the default 100kb limit
app.use(json({ limit: "16mb" }));

const apolloServer = createApolloServer();

app.get("/", (_, res) => res.send("Hello World"));

// Ensure the GraphQL server has started before starting the HTTP server
apolloServer.start().then(() => {
  apolloServer.applyMiddleware({ app });

  app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
});
