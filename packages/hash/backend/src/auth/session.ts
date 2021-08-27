import { Express, Request } from "express";
import expressSession from "express-session";
import pgSessionStore from "connect-pg-simple";
import { urlencoded } from "body-parser";
import { Pool } from "pg";

import { getRequiredEnv } from "../util";

const createPool = () => {
  const user = getRequiredEnv("HASH_PG_USER");
  const host = getRequiredEnv("HASH_PG_HOST");
  const port = getRequiredEnv("HASH_PG_PORT");
  const database = getRequiredEnv("HASH_PG_DATABASE");
  const password = getRequiredEnv("HASH_PG_PASSWORD");

  return new Pool({
    user,
    host,
    port: parseInt(port),
    database,
    password,
  });
};

// cookie maximum age (365 days)
const COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 365;

type AdditionalSessionData = {
  userAgent?: string;
};

declare module "express-session" {
  interface Session {
    additionalData?: AdditionalSessionData;
  }
}

const parseAdditionalSessionData = (req: Request): AdditionalSessionData => ({
  userAgent: req.get("User-Agent"),
});

export const setupSession = (app: Express) => {
  app.use(urlencoded({ extended: true }));

  // `express-session` middleware
  app.use(
    expressSession({
      secret: getRequiredEnv("SESSION_SECRET"),
      store: new (pgSessionStore(expressSession))({
        pool: createPool(),
        // prevents expired db sessions from being removed from the db
        pruneSessionInterval: false,
      }),
      cookie: {
        maxAge: COOKIE_MAX_AGE_MS,
        httpOnly: true,
        sameSite: "lax",
      },
      resave: false,
      saveUninitialized: false,
    })
  );

  // parse additional session data middleware
  app.use((req, _, next) => {
    req.session.additionalData = parseAdditionalSessionData(req);
    next();
  });
};
