import { getRequiredEnv } from "@hashintel/hash-backend-utils/environment";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { Session } from "@ory/client";
import { AxiosError } from "axios";
import { Express, Request, RequestHandler } from "express";

import { ImpureGraphContext } from "../graph";
import { getHashInstance } from "../graph/knowledge/system-types/hash-instance";
import {
  createUser,
  getUserByKratosIdentityId,
  User,
} from "../graph/knowledge/system-types/user";
import { systemUserAccountId } from "../graph/system-user";
import { kratosFrontendApi, KratosUserIdentity } from "./ory-kratos";

declare global {
  namespace Express {
    interface Request {
      session: Session | undefined;
      user: User | undefined;
    }
  }
}

const KRATOS_API_KEY = getRequiredEnv("KRATOS_API_KEY");

const requestHeaderContainsValidKratosApiKey = (req: Request): boolean =>
  req.header("KRATOS_API_KEY") === KRATOS_API_KEY;

const kratosAfterRegistrationHookHandler =
  (
    context: ImpureGraphContext,
  ): RequestHandler<{}, {}, { identity: KratosUserIdentity }> =>
  (req, res) => {
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

        const hashInstance = await getHashInstance(context, {});

        if (!hashInstance.userSelfRegistrationIsEnabled) {
          throw new Error("User registration is disabled.");
        }

        await createUser(context, {
          emails,
          kratosIdentityId,
          actorId: systemUserAccountId,
        });

        res.status(200).end();
      } catch (error) {
        // The kratos hook can interrupt creation on 4xx and 5xx responses.
        // We pass context as an error to not leak any kratos implementation details.

        res.status(400).send(
          JSON.stringify({
            messages: [
              {
                type: "error",
                error: "Error creating user",
                context: error,
              },
            ],
          }),
        );
      }
    })();
  };

const setupAuth = (params: {
  app: Express;
  logger: Logger;
  context: ImpureGraphContext;
}) => {
  const { app, logger, context } = params;

  // Kratos hook handlers
  app.post(
    "/kratos-after-registration",
    kratosAfterRegistrationHookHandler(context),
  );

  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- https://github.com/DefinitelyTyped/DefinitelyTyped/issues/50871
  app.use(async (req, _res, next) => {
    const authHeader = req.header("authorization");
    const hasAuthHeader = authHeader?.startsWith("Bearer ") ?? false;
    const sessionToken =
      hasAuthHeader && typeof authHeader === "string"
        ? authHeader.slice(7, authHeader.length)
        : undefined;

    const kratosSession = await kratosFrontendApi
      .toSession({
        cookie: req.header("cookie"),
        xSessionToken: sessionToken,
      })
      .then(({ data }) => data)
      .catch((err: AxiosError) => {
        // 403 on toSession means that we need to request 2FA
        if (err.response && err.response.status === 403) {
          /** @todo: figure out if this should be handled here, or in the next.js app (when implementing 2FA) */
        }
        logger.debug(
          `Kratos response error: Could not fetch session, got: [${
            err.response?.status
          }] ${JSON.stringify(err.response?.data)}`,
        );
        return undefined;
      });

    if (kratosSession) {
      req.session = kratosSession;

      const { identity } = kratosSession;

      const { id: kratosIdentityId } = identity;

      const user = await getUserByKratosIdentityId(context, {
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
