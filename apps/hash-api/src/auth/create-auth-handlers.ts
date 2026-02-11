import { getRequiredEnv } from "@local/hash-backend-utils/environment";
import { getHashInstance } from "@local/hash-backend-utils/hash-instance";
import type { Logger } from "@local/hash-backend-utils/logger";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import type { Session } from "@ory/kratos-client";
import * as Sentry from "@sentry/node";
import type { AxiosError } from "axios";
import type { Express, Request, RequestHandler } from "express";

import type { ImpureGraphContext } from "../graph/context-types";
import type { User } from "../graph/knowledge/system-types/user";
import { createUser, getUser } from "../graph/knowledge/system-types/user";
import { systemAccountId } from "../graph/system-account";
import { hydraAdmin } from "./ory-hydra";
import type { KratosUserIdentity } from "./ory-kratos";
import {
  isUserEmailVerified,
  kratosFrontendApi,
  sendVerificationEmail,
} from "./ory-kratos";

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

        const primaryEmail = emails[0];
        if (primaryEmail) {
          sendVerificationEmail(primaryEmail).catch((error) => {
            Sentry.captureException(error);
            // Don't block signup completion if email sending fails – users can re-request from frontend.
          });
        }

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
  primaryEmailVerified?: boolean;
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
      if (err.response && err.response.status === 403) {
        logger.debug(
          "Session requires AAL2 but only has AAL1. Treating as unauthenticated.",
        );
        return undefined;
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

    if (!identity) {
      throw new Error("Could not find kratos identity for session");
    }

    const { id: kratosIdentityId, traits } = identity as KratosUserIdentity;

    const primaryEmailAddress = traits.emails[0];

    const primaryEmailVerified =
      identity.verifiable_addresses?.find(
        ({ value }) => value === primaryEmailAddress,
      )?.verified === true;

    const user = await getUser(context, authentication, {
      kratosIdentityId,
      emails: traits.emails,
    });

    if (!user) {
      throw new Error(
        `Could not find user with kratos identity id "${kratosIdentityId}"`,
      );
    }

    return { primaryEmailVerified, session: kratosSession, user };
  }

  return {};
};

export const createAuthMiddleware = (params: {
  logger: Logger;
  context: ImpureGraphContext;
}): RequestHandler => {
  const { logger, context } = params;

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
        const user = await getUser(
          context,
          { actorId: publicUserAccountId },
          {
            kratosIdentityId: introspectionResult.data.sub,
          },
        );
        if (user) {
          req.primaryEmailVerified = await isUserEmailVerified(
            user.kratosIdentityId,
          );
          req.user = user;
          next();
          return;
        }
      }
    }

    const { primaryEmailVerified, session, user } = await getUserAndSession({
      context,
      cookie: req.header("cookie"),
      logger,
      sessionToken: accessOrSessionToken,
    });
    if (session) {
      req.primaryEmailVerified = primaryEmailVerified;
      req.session = session;
      req.user = user;
    }

    next();
  };
};
