import { Express } from "express";
import { DBAdapter } from "../db";
import { setupPassport } from "./passport";
import { setupSession } from "./session";

const setupAuth = (app: Express, db: DBAdapter) => {
  // setup session related middleware
  setupSession(app);
  // setup passport related middleware and routes
  setupPassport(app, db);
};

export default setupAuth;
