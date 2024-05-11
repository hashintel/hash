import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { getHashInstance } from "@local/hash-backend-utils/hash-instance";
import type { Logger } from "@local/hash-backend-utils/logger";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import type { Session } from "@ory/client";
import type { AxiosError } from "axios";
import type { Express, Request, RequestHandler } from "express";

import type { ImpureGraphContext } from "../graph/context-types";
import type { User } from "../graph/knowledge/system-types/user";
import {
  createUser,
  getUserByKratosIdentityId,
} from "../graph/knowledge/system-types/user";
import { systemAccountId } from "../graph/system-account";
import { hydraAdmin } from "./ory-hydra";
import type { KratosUserIdentity } from "./ory-kratos";
import { kratosFrontendApi } from "./ory-kratos";

const KRATOS_API_KEY = getRequiredEnv("KRATOS_API_KEY");

const requestHeaderContainsValidKratosApiKey = (req: Request): boolean =>
  req.header("KRATOS_API_KEY") === KRATOS_API_KEY;

const kratosAfterRegistrationHookHandler =
  (
    context: ImpureGraphContext,
  ): RequestHandler<
    Record<string, never>,
    string,
    { identity: KratosUserIdentity }
  > =>
  (req, res) => {
    const {
      body: {
        identity: { id: kratosIdentityId, traits },
      },
    } = req;
    const authentication = { actorId: systemAccountId };

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

        const hashInstance = await getHashInstance(context, authentication);

        if (!hashInstance.userSelfRegistrationIsEnabled) {
          throw new Error("User registration is disabled.");
        }

        await createUser(context, authentication, {
          emails,
          kratosIdentityId,
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

export const addKratosAfterRegistrationHandler = ({
  app,
  context,
}: {
  app: Express;
  context: ImpureGraphContext;
}) => {
  app.post(
    "/kratos-after-registration",
    kratosAfterRegistrationHookHandler(context),
  );
};

export const getUserAndSession = async ({
  context,
  cookie,
  logger,
  sessionToken,
}: {
  context: ImpureGraphContext;
  cookie?: string;
  logger: Logger;
  sessionToken?: string;
}): Promise<{
  session?: Session;
  user?: User;
}> => {
  const authentication = { actorId: systemAccountId };

  const kratosSession = await kratosFrontendApi
    .toSession({
      cookie,
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
    const { identity } = kratosSession;

    const { id: kratosIdentityId } = identity;

    const user = await getUserByKratosIdentityId(context, authentication, {
      kratosIdentityId,
    });

    if (!user) {
      throw new Error(
        `Could not find user with kratos identity id "${kratosIdentityId}"`,
      );
    }

    return { session: kratosSession, user };
  }

  return {};
};

export const createAuthMiddleware = (params: {
  logger: Logger;
  context: ImpureGraphContext;
}): RequestHandler => {
  const { logger, context } = params;

  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- https://github.com/DefinitelyTyped/DefinitelyTyped/issues/50871
  return async (req, _res, next) => {
    const authHeader = req.header("authorization");
    const hasAuthHeader = authHeader?.startsWith("Bearer ") ?? false;

    const accessOrSessionToken =
      hasAuthHeader && typeof authHeader === "string"
        ? authHeader.slice(7, authHeader.length)
        : undefined;

    /** Check if the Bearer token is a valid OAuth2 token */
    if (accessOrSessionToken) {
      const introspectionResult = await hydraAdmin.introspectOAuth2Token({
        token: accessOrSessionToken,
      });
      if (introspectionResult.data.active && introspectionResult.data.sub) {
        const user = await getUserByKratosIdentityId(
          context,
          { actorId: publicUserAccountId },
          {
            kratosIdentityId: introspectionResult.data.sub,
          },
        );
        if (user) {
          req.user = user;
          next();
          return;
        }
      }
    }

    const { session, user } = await getUserAndSession({
      context,
      cookie: req.header("cookie"),
      logger,
      sessionToken: accessOrSessionToken,
    });

    const kratosSession = await kratosFrontendApi
      .toSession({
        cookie: req.header("cookie"),
        xSessionToken: accessOrSessionToken,
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
      req.session = session;

      req.user = user;
    }

    next();
  };
};
