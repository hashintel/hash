import { Express, Request } from "express";
import expressSession from "express-session";
import pgSessionStore from "connect-pg-simple";
import { urlencoded } from "body-parser";
import { Pool } from "pg";
import { Config as PgConfig } from "../db/postgres";

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

export type SessionConfig = {
  secret: string;
};

export const setupSession = (
  app: Express,
  sessConfig: SessionConfig,
  pgConfig: PgConfig
) => {
  app.use(urlencoded({ extended: true }));

  // `express-session` middleware
  app.use(
    expressSession({
      secret: sessConfig.secret,
      store: new (pgSessionStore(expressSession))({
        pool: new Pool({ ...pgConfig, max: pgConfig.maximumPoolSize }),
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
