import { Express, Request, RequestHandler } from "express";
import { AxiosError } from "axios";
import { Session } from "@ory/client";
import { GraphApi } from "@hashintel/hash-graph-client";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import {
  adminKratosSdk,
  KratosUserIdentity,
  publicKratosSdk,
} from "./ory-kratos";
import { UserModel } from "../model";
import { systemAccountId } from "../model/util";

declare global {
  namespace Express {
    interface Request {
      session: Session | undefined;
      userModel: UserModel | undefined;
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
  (req, res, next) => {
    const { graphApi } = params;

    const {
      body: {
        identity: { id: kratosIdentityId, traits },
      },
    } = req;

    // Authenticate the request originates from the kratos server
    if (!requestHeaderContainsValidKratosApiKey(req)) {
      res
        .status(401)
        .send(
          'Please provide the kratos API key using a "KRATOS_API_KEY" request header',
        )
        .end();

      return;
    }

    void (async () => {
      try {
        const { emails } = traits;

        await UserModel.createUser(graphApi, {
          emails,
          kratosIdentityId,
          actorId: systemAccountId,
        });

        res.status(200).end();
      } catch (error) {
        /**
         * @todo: instead of manually cleaning up after the registration flow,
         * use a "pre-persist" after registration kratos hook when the following
         * PR is merged: https://github.com/ory/kratos/pull/2343
         */
        await adminKratosSdk.adminDeleteIdentity(kratosIdentityId);

        next(error);
      }
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

  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- https://github.com/DefinitelyTyped/DefinitelyTyped/issues/50871
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

      const userModel = await UserModel.getUserByKratosIdentityId(graphApi, {
        kratosIdentityId,
      });

      if (!userModel) {
        throw new Error(
          `Could not find user with kratos identity id "${kratosIdentityId}"`,
        );
      }

      req.userModel = userModel;
    }

    next();
  });
};

export default setupAuth;
