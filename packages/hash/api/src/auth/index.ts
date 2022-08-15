import { Express, Request, RequestHandler } from "express";
import { AxiosError } from "axios";
import { Session } from "@ory/client";
import { GraphApi } from "@hashintel/hash-graph-client";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { KratosUserIdentity, publicKratosSdk } from "./ory-kratos";
import { UserModel } from "../model";

declare global {
  namespace Express {
    interface Request {
      session: Session | undefined;
      user: UserModel | undefined;
    }
  }
}

const KRATOS_API_KEY = getRequiredEnv("KRATOS_API_KEY");

const requestHeaderContainsValidKratosApiKey = (req: Request): boolean =>
  req.header("KRATOS_API_KEY") === KRATOS_API_KEY;

const kratosAfterRegistrationHookHandler =
  (params: {
    graphApi: GraphApi;
  }): RequestHandler<{}, {}, { identity: KratosUserIdentity }> =>
  (req, res) => {
    const { graphApi } = params;
    void (async () => {
      const {
        body: { identity },
      } = req;

      if (!requestHeaderContainsValidKratosApiKey(req)) {
        res
          .status(401)
          .send(
            'Please provide the kratos API key using a "KRATOS_API_KEY" request header',
          )
          .end();
      }

      const { id: kratosIdentityId, traits } = identity;
      const { emails } = traits;

      await UserModel.createUser(graphApi, {
        emails,
        kratosIdentityId,
      });

      res.status(200).end();
    })();
  };

const setupAuth = (params: {
  app: Express;
  graphApi: GraphApi;
  logger: Logger;
}) => {
  const { app, graphApi } = params;

  // Kratos hook handlers
  app.post(
    "/kratos-after-registration",
    kratosAfterRegistrationHookHandler({ graphApi }),
  );

  app.use(async (req, _res, next) => {
    const kratosSession = await publicKratosSdk
      .toSession(undefined, req.header("cookie"))
      .then(({ data }) => data)
      .catch((err: AxiosError) => {
        // 403 on toSession means that we need to request 2FA
        if (err.response && err.response.status === 403) {
          /** @todo: figure out if this should be handled here, or in the next.js app (when implementing 2FA) */
        }
        return undefined;
      });

    if (kratosSession) {
      req.session = kratosSession;

      const { identity } = kratosSession;

      const { id: kratosIdentityId } = identity;

      const user = await UserModel.getUserByKratosIdentityId(graphApi, {
        kratosIdentityId,
      });

      if (!user) {
        throw new Error(
          `Could not find user with kratos identity id "${kratosIdentityId}"`,
        );
      }

      req.user = user;
    }

    next();
  });
};

export default setupAuth;
