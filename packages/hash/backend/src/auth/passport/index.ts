import passport, { AuthenticateOptions } from "passport";
import { Express } from "express";
import { ExpressContext } from "apollo-server-express";
import { DBAdapter } from "src/db";
import UserModel from "../../model/user.model";

declare global {
  namespace Express {
    interface User extends UserModel {}
  }
}

type SerializedPassportUser = {
  id: string;
};

export const setupPassport = (app: Express, db: DBAdapter) => {
  passport.serializeUser<SerializedPassportUser>((user, done) =>
    done(null, { id: user.entityId })
  );

  passport.deserializeUser<SerializedPassportUser>(({ id }, done) =>
    UserModel.getUserById(db)({ id }).then((user) => {
      done(null, user); // TODO: pass error instead of null when user isn't found
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());
};

export type PassportGraphQLMethods = {
  login: (user: Express.User, options: AuthenticateOptions) => Promise<void>;
  logout: () => void;
  authenticate: (
    strategyName: string,
    options: AuthenticateOptions
  ) => Promise<Express.User>;
};

/** attaches passport related functions to the express context */
export const buildPassportGraphQLMethods = (
  contextParams: ExpressContext
): PassportGraphQLMethods => {
  const {
    req, // set for queries and mutations
    res, // set for queries and mutations
  } = contextParams;

  return {
    ...contextParams,
    // promisified passport login function
    login: (user, options) =>
      new Promise<void>((resolve, reject) => {
        const done = (err: Error | undefined) => {
          if (err) reject(err);
          else resolve();
        };

        req.login(user, options, done);
      }),
    logout: () => req.logout(),
    // promisified passport authenticate function
    authenticate: (name, options) =>
      new Promise<Express.User>((resolve, reject) => {
        const done = (err: Error | undefined, user: Express.User) => {
          if (err) reject(err);
          else resolve(user);
        };

        return passport.authenticate(name, options, done)(req, res);
      }),
  };
};
