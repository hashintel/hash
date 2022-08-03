import { Express } from "express";
import { AxiosError } from "axios";
import { Session } from "@ory/client";
import { kratosSdk } from "./ory-kratos";
import { User } from "../model";

declare global {
  namespace Express {
    interface Request {
      session: Session | undefined;
      user: User | undefined;
    }
  }
}

const setupAuth = (app: Express) => {
  app.use(async (req, _res, next) => {
    const kratosSession = await kratosSdk
      .toSession(undefined, req.header("cookie"))
      .then(({ data }) => data)
      .catch((err: AxiosError) => {
        // 403 on toSession means that we need to request 2FA
        if (err.response && err.response.status === 403) {
          /** @todo: figure out if this shoulds be handled here, or in the next.js app (when implementing 2FA) */
        }
        return undefined;
      });

    if (kratosSession) {
      req.session = kratosSession;
      /** @todo: attach User model class instance to the `req` object */
    }

    next();
  });
};

export default setupAuth;
