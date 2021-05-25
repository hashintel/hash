import express from "express";
import { json } from "body-parser";
import helmet from "helmet";

import { createApolloServer } from "./graphql/createApolloServer";

// Configure the Express server
const app = express();
const PORT = process.env.PORT ?? 5000;

// Set sensible default security headers: https://www.npmjs.com/package/helmet
app.use(helmet());

// Parse request body as JSON - allow higher than the default 100kb limit
app.use(json({ limit: "16mb" }));

const apolloServer = createApolloServer();

app.get("/", (_, res) => res.send("Hello World"));

// Ensure the GraphQL server has started before starting the HTTP server
apolloServer.start().then(() => {
  apolloServer.applyMiddleware({ app });

  app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
});
