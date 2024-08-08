/* eslint-disable import/first */

import {
  getRequiredEnv,
  monorepoRootDir,
  realtimeSyncEnabled,
  waitOnResource,
} from "@local/hash-backend-utils/environment";
import type { ErrorRequestHandler } from "express";
import express, { raw } from "express";
import { create as handlebarsCreate } from "express-handlebars";

// eslint-disable-next-line import/order
import { initSentry } from "./sentry";

const app = express();

initSentry(app);

import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";

import { getAwsRegion } from "@local/hash-backend-utils/aws-config";
import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import { OpenSearch } from "@local/hash-backend-utils/search/opensearch";
import { GracefulShutdown } from "@local/hash-backend-utils/shutdown";
import { createTemporalClient } from "@local/hash-backend-utils/temporal";
import { createVaultClient } from "@local/hash-backend-utils/vault";
import type { EnforcedEntityEditionProvenance } from "@local/hash-graph-sdk/entity";
import { getHashClientTypeFromRequest } from "@local/hash-isomorphic-utils/http-requests";
import { isSelfHostedInstance } from "@local/hash-isomorphic-utils/instance";
import * as Sentry from "@sentry/node";
import bodyParser from "body-parser";
import cors from "cors";
import proxy from "express-http-proxy";
import type { Options as RateLimitOptions } from "express-rate-limit";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { StatsD } from "hot-shots";
import httpTerminator from "http-terminator";
import { customAlphabet } from "nanoid";

import { gptGetUserWebs } from "./ai/gpt/gpt-get-user-webs";
import { gptQueryEntities } from "./ai/gpt/gpt-query-entities";
import { gptQueryTypes } from "./ai/gpt/gpt-query-types";
import { upsertGptOauthClient } from "./ai/gpt/upsert-gpt-oauth-client";
import { openInferEntitiesWebSocket } from "./ai/infer-entities-websocket";
import {
  addKratosAfterRegistrationHandler,
  createAuthMiddleware,
} from "./auth/create-auth-handlers";
import { getActorIdFromRequest } from "./auth/get-actor-id";
import {
  oauthConsentRequestHandler,
  oauthConsentSubmissionHandler,
} from "./auth/oauth-consent-handlers";
import { hydraPublicUrl } from "./auth/ory-hydra";
import { kratosPublicUrl } from "./auth/ory-kratos";
import { setupBlockProtocolExternalServiceMethodProxy } from "./block-protocol-external-service-method-proxy";
import { RedisCache } from "./cache";
import type { EmailTransporter } from "./email/transporters";
import {
  AwsSesEmailTransporter,
  DummyEmailTransporter,
} from "./email/transporters";
import { ensureSystemGraphIsInitialized } from "./graph/ensure-system-graph-is-initialized";
import { ensureHashSystemAccountExists } from "./graph/system-account";
import { createApolloServer } from "./graphql/create-apollo-server";
import { registerOpenTelemetryTracing } from "./graphql/opentelemetry";
import { enabledIntegrations } from "./integrations/enabled-integrations";
import { checkGoogleAccessToken } from "./integrations/google/check-access-token";
import { getGoogleAccessToken } from "./integrations/google/get-access-token";
import { googleOAuthCallback } from "./integrations/google/oauth-callback";
import { oAuthLinear, oAuthLinearCallback } from "./integrations/linear/oauth";
import { linearWebhook } from "./integrations/linear/webhook";
import { createIntegrationSyncBackWatcher } from "./integrations/sync-back-watcher";
import {
  CORS_CONFIG,
  getEnvStorageType,
  LOCAL_FILE_UPLOAD_PATH,
} from "./lib/config";
import {
  isDevEnv,
  isProdEnv,
  isStatsDEnabled,
  isTestEnv,
  port,
} from "./lib/env-config";
import { logger } from "./logger";
import { seedOrgsAndUsers } from "./seed-data";
import {
  setupFileDownloadProxyHandler,
  setupStorageProviders,
} from "./storage";
import { setupTelemetry } from "./telemetry/snowplow-setup";

const shutdown = new GracefulShutdown(logger, "SIGINT", "SIGTERM");

const baseRateLimitOptions: Partial<RateLimitOptions> = {
  windowMs: process.env.NODE_ENV === "test" ? 10 : 1000 * 30, // 30 seconds
  limit: 10, // Limit each IP to 10 requests every 30 seconds
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
};

/**
 * A rate limiter for routes which grant authentication or authorization credentials
 */
const authRouteRateLimiter = rateLimit(baseRateLimitOptions);

/**
 * A rate limit which throttles requests based on the user identifier rather than the IP address.
 */
const userIdentifierRateLimiter = rateLimit({
  ...baseRateLimitOptions,
  keyGenerator: (req) => {
    if (req.body.identifier) {
      /**
       * 'identifier' is the field which identifies the user on a signin attempt.
       * We use this as a rate limiting key if present to mitigate brute force signin attempts spread across multiple IPs.
       */
      return req.body.identifier;
    }
    return req.ip;
  },
});

const hydraProxy = proxy(hydraPublicUrl ?? "", {
  proxyReqPathResolver: (req) => req.originalUrl,
});

const main = async () => {
  logger.info("Type System initialized");

  registerOpenTelemetryTracing(process.env.HASH_OTLP_ENDPOINT ?? null);

  if (process.env.HASH_TELEMETRY_ENABLED === "true") {
    logger.info("Starting [Snowplow] telemetry");

    const [spEmitter] = setupTelemetry();

    shutdown.addCleanup("Snowplow Telemetry", async () => {
      logger.info("Flushing [Snowplow] telemetry");
      spEmitter.flush();
    });
  }

  // Request ID generator
  const nanoid = customAlphabet(
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
    14,
  );

  // Configure the StatsD client for reporting metrics
  let statsd: StatsD | undefined;
  try {
    if (isStatsDEnabled) {
      const statsdHost = process.env.STATSD_HOST;
      const statsdPort = parseInt(process.env.STATSD_PORT || "8125", 10);
      await waitOnResource(`tcp:${statsdHost}:${statsdPort}`, logger);

      statsd = new StatsD({
        host: statsdHost,
        port: statsdPort,
      });
      shutdown.addCleanup("StatsD", async () => {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        await promisify((statsd as StatsD).close).bind(statsd)();
      });
    }
  } catch (err) {
    logger.error(`Could not start StatsD client: ${err}`);
  }

  // Configure Sentry error / trace handling
  app.use(
    Sentry.Handlers.requestHandler({
      ip: true,
    }),
  );
  app.use(Sentry.Handlers.tracingHandler());

  app.use(cors(CORS_CONFIG));

  // Add logging of requests
  app.use((req, res, next) => {
    const requestId = nanoid();
    res.set("x-hash-request-id", requestId);
    logger.info(
      JSON.stringify({
        requestId,
        method: req.method,
        ip: req.ip,
        path: req.path,
        userAgent: req.headers["user-agent"],
        graphqlClient: req.headers["apollographql-client-name"],
      }),
    );

    next();
  });

  const redisHost = getRequiredEnv("HASH_REDIS_HOST");
  const redisPort = parseInt(getRequiredEnv("HASH_REDIS_PORT"), 10);
  const redisEncryptedTransit =
    process.env.HASH_REDIS_ENCRYPTED_TRANSIT === "true";

  const graphApiHost = getRequiredEnv("HASH_GRAPH_API_HOST");
  const graphApiPort = parseInt(getRequiredEnv("HASH_GRAPH_API_PORT"), 10);

  await Promise.all([
    waitOnResource(`tcp:${redisHost}:${redisPort}`, logger),
    waitOnResource(`tcp:${graphApiHost}:${graphApiPort}`, logger),
  ]);

  // Connect to Redis
  const redis = new RedisCache(logger, {
    host: redisHost,
    port: redisPort,
    tls: redisEncryptedTransit,
  });
  shutdown.addCleanup("Redis", async () => redis.close());

  // Connect to the Graph API
  const graphApi = createGraphClient(logger, {
    host: graphApiHost,
    port: graphApiPort,
  });

  const FILE_UPLOAD_PROVIDER = getEnvStorageType();
  // Setup upload storage provider and express routes for local file uploads
  const uploadProvider = setupStorageProviders(app, FILE_UPLOAD_PROVIDER);

  const temporalClient = await createTemporalClient(logger);

  const vaultClient = createVaultClient();

  const machineProvenance: EnforcedEntityEditionProvenance = {
    actorType: "machine",
    origin: {
      type: "api",
    },
  };

  const machineActorContext = {
    graphApi,
    provenance: machineProvenance,
    uploadProvider,
    temporalClient,
  };

  if (isDevEnv) {
    await ensureSystemGraphIsInitialized({
      logger,
      context: machineActorContext,
    });
  } else {
    // Globally sets `systemAccountId`
    await ensureHashSystemAccountExists({
      logger,
      context: machineActorContext,
    });
  }

  // This will seed users, an org and pages.
  // Configurable through environment variables.
  await seedOrgsAndUsers({ logger, context: machineActorContext });

  // Set sensible default security headers: https://www.npmjs.com/package/helmet
  // Temporarily disable contentSecurityPolicy for the GraphQL playground
  // Longer-term we can set rules which allow only the playground to load
  // Potentially only in development mode
  app.use(helmet({ contentSecurityPolicy: false }));

  app.use(express.static("public"));

  if (isProdEnv && !isSelfHostedInstance) {
    /**
     * In production, hosted HASH, take the client IP from the Cloudflare-set header.
     */
    Object.defineProperty(app.request, "ip", {
      configurable: true,
      enumerable: true,
      get() {
        return this.get("cf-connecting-ip");
      },
    });
  }

  const jsonParser = bodyParser.json({
    // default is 100kb
    limit: "16mb",
  });
  const rawParser = raw({ type: "application/json" });

  /**
   * PROXIES – these should come BEFORE bodyParser so that the body is proxied without being consumed and parsed
   * @see https://www.npmjs.com/package/express-http-proxy#middleware-mixing
   *
   * Kratos is given an exception as we check the body for rate limiting purposes and parsing it out doesn't break it.
   */

  /**
   * Proxy to Ory Hydra's OAuth2 authorization and token endpoints, for OAuth2 clients (e.g. HashGPT)
   */
  app.use("/oauth2/auth", authRouteRateLimiter, hydraProxy);
  app.use("/oauth2/token", authRouteRateLimiter, hydraProxy);
  app.use("/oauth2/fallbacks", authRouteRateLimiter, hydraProxy);

  /** END PROXIES */

  /** Body parsing middleware */
  app.use((req, res, next) => {
    if (
      req.path.startsWith("/webhooks/") ||
      req.path === LOCAL_FILE_UPLOAD_PATH
    ) {
      // webhooks typically need the raw body for signature verification
      return rawParser(req, res, next);
    }
    return jsonParser(req, res, next);
  });

  /**
   * Proxy for requests to the Ory Kratos public API, to be consumed by the frontend.
   *
   * Although the proxy would ideally come before the body parser, so that we're passing it through untouched,
   * we check the body in this process in order to rate limit requests based on the user attempting to log in.
   */
  app.use(
    "/auth/*",
    authRouteRateLimiter,
    userIdentifierRateLimiter,
    cors(CORS_CONFIG),
    (req, res, next) => {
      const expectedAccessControlAllowOriginHeader = res.getHeader(
        "Access-Control-Allow-Origin",
      );

      if (!kratosPublicUrl) {
        throw new Error("No kratosPublicUrl provided");
      }

      return proxy(kratosPublicUrl, {
        /**
         * Remove the `/auth` prefix from the request path, so the path is
         * formatted correctly for the Ory Kratos API.
         */
        proxyReqPathResolver: ({ originalUrl }) =>
          originalUrl.replace("/auth", ""),
        /**
         * Ory Kratos includes the wildcard `*` in the `Access-Control-Allow-Origin`
         * by default, which is not permitted by browsers when including credentials
         * in requests.
         *
         * When setting the value of the `Access-Control-Allow-Origin` header in
         * the Ory Kratos configuration, the frontend URL is included twice in the
         * header for some reason (e.g. ["https://localhost:3000", "https://localhost:3000"]),
         * which is also not permitted by browsers when including credentials in requests.
         *
         * Therefore we manually set the `Access-Control-Allow-Origin` header to the
         * expected value here before returning the response, to prevent CORS errors
         * in modern browsers.
         */
        userResDecorator: (_proxyRes, proxyResData, _userReq, userRes) => {
          if (typeof expectedAccessControlAllowOriginHeader === "string") {
            userRes.set(
              "Access-Control-Allow-Origin",
              expectedAccessControlAllowOriginHeader,
            );
          }
          return proxyResData;
        },
      })(req, res, next);
    },
  );

  // Set up authentication related middleware and routes
  addKratosAfterRegistrationHandler({ app, context: machineActorContext });
  const authMiddleware = createAuthMiddleware({
    logger,
    context: machineActorContext,
  });
  app.use(authMiddleware);

  /**
   * Add scope to Sentry, now the user has been checked.
   * We could set some of this scope earlier, but it doesn't get picked up for GraphQL requests for some reason
   * if the middleware comes earlier.
   */
  app.use((req, _res, next) => {
    const scope = Sentry.getCurrentScope();

    // Clear the scope and breadcrumbs – requests seem to bleed into each other otherwise
    scope.clear();
    scope.clearBreadcrumbs();

    /**
     * Sentry automatically populates a 'Headers' object, but for some reason it doesn't do this for GraphQL requests.
     * This might be something to do with how Sentry hooks into fetch that doesn't play nicely with ApolloServer,
     * or how we're loading it.
     */
    const userAgent = req.header("user-agent");
    const origin = req.header("origin");
    const ip = req.ip;

    scope.setContext("request", { ip, origin, userAgent });

    const user = req.user;
    scope.setUser({
      id: getActorIdFromRequest(req),
      email: user?.emails[0],
      username: user?.shortname ?? "public",
    });

    next();
  });

  /** OAuth2 consent flow */
  app.get("/oauth2/consent", authRouteRateLimiter, oauthConsentRequestHandler);
  app.post(
    "/oauth2/consent",
    authRouteRateLimiter,
    oauthConsentSubmissionHandler,
  );

  const hbs = handlebarsCreate({ defaultLayout: "main", extname: ".hbs" });
  app.engine(
    "hbs",
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    hbs.engine,
  );
  app.set("view engine", "hbs");
  app.set("views", "./views");

  // Create an email transporter
  const emailTransporter =
    isTestEnv || isDevEnv || process.env.HASH_EMAIL_TRANSPORTER === "dummy"
      ? new DummyEmailTransporter({
          copyCodesOrLinksToClipboard:
            process.env.DUMMY_EMAIL_TRANSPORTER_USE_CLIPBOARD === "true",
          displayCodesOrLinksInStdout: true,
          filePath: process.env.DUMMY_EMAIL_TRANSPORTER_FILE_PATH
            ? path.resolve(
                monorepoRootDir,
                process.env.DUMMY_EMAIL_TRANSPORTER_FILE_PATH,
              )
            : undefined,
        })
      : process.env.AWS_REGION
        ? new AwsSesEmailTransporter({
            from: `${getRequiredEnv(
              "SYSTEM_EMAIL_SENDER_NAME",
            )} <${getRequiredEnv("SYSTEM_EMAIL_ADDRESS")}>`,
            region: getAwsRegion(),
            subjectPrefix: isProdEnv ? undefined : "[DEV SITE] ",
          })
        : ({
            sendMail: (mail) => {
              logger.info(`Tried to send mail to ${mail.to}:\n${mail.html}`);
            },
          } as EmailTransporter);

  let search: OpenSearch | undefined;
  if (process.env.HASH_OPENSEARCH_ENABLED === "true") {
    const searchAuth =
      process.env.HASH_OPENSEARCH_USERNAME === undefined
        ? undefined
        : {
            username: process.env.HASH_OPENSEARCH_USERNAME,
            password: process.env.HASH_OPENSEARCH_PASSWORD || "",
          };
    search = await OpenSearch.connect(logger, {
      host: getRequiredEnv("HASH_OPENSEARCH_HOST"),
      port: parseInt(process.env.HASH_OPENSEARCH_PORT || "9200", 10),
      auth: searchAuth,
      httpsEnabled: !!process.env.HASH_OPENSEARCH_HTTPS_ENABLED,
    });
    shutdown.addCleanup("OpenSearch", async () => search!.close());
  }

  const apolloServer = createApolloServer({
    graphApi,
    search,
    uploadProvider,
    temporalClient,
    vaultClient,
    cache: redis,
    emailTransporter,
    logger,
    statsd,
  });

  // Make the data sources/clients available to REST controllers
  // @todo figure out sharing of context between REST and GraphQL without repeating this
  app.use((req, _res, next) => {
    const provenance: EnforcedEntityEditionProvenance = {
      actorType: "human",
      origin: {
        type: getHashClientTypeFromRequest(req) ?? "api",
        userAgent: req.headers["user-agent"],
      },
    };

    req.context = {
      graphApi,
      provenance,
      temporalClient,
      uploadProvider,
      vaultClient,
    };
    next();
  });

  setupFileDownloadProxyHandler(app, redis);

  setupBlockProtocolExternalServiceMethodProxy(app);

  app.get("/", (_req, res) => {
    res.send("Hello World");
  });

  // Used by AWS Application Load Balancer (ALB) for health checks
  app.get("/health-check", (_, res) => res.status(200).send("Hello World!"));

  app.use((req, res, next) => {
    const requestId = nanoid();
    res.set("x-hash-request-id", requestId);
    if (isProdEnv) {
      logger.info(
        JSON.stringify({
          requestId,
          method: req.method,
          origin: req.headers.origin,
          ip: req.ip,
          path: req.path,
          message: "request",
          userAgent: req.headers["user-agent"],
          graphqlClient: req.headers["apollographql-client-name"],
        }),
      );
    }
    next();
  });

  app.use((req, _res, next) => {
    if (req.path !== "/graphql") {
      if (!req.user?.isAccountSignupComplete) {
        /**
         * Only GraphQL requests need to be provided with incomplete users, to allow them to complete signup
         *   – otherwise they should be treated as anonymous requests.
         */
        delete req.user;
      }
    }
    next();
  });

  // Integrations
  app.get("/oauth/linear", authRouteRateLimiter, oAuthLinear);
  app.get("/oauth/linear/callback", authRouteRateLimiter, oAuthLinearCallback);
  app.post("/webhooks/linear", linearWebhook);

  app.post("/oauth/google/callback", authRouteRateLimiter, googleOAuthCallback);
  app.post("/oauth/google/token", authRouteRateLimiter, getGoogleAccessToken);
  app.post(
    "/oauth/google/check-token",
    authRouteRateLimiter,
    checkGoogleAccessToken,
  );

  // Endpoints used by HashGPT or in support of it
  app.post("/gpt/entities/query", gptQueryEntities);
  app.post("/gpt/entities/query-types", gptQueryTypes);
  app.get("/gpt/user-webs", gptGetUserWebs);
  app.post("/gpt/upsert-gpt-oauth-client", upsertGptOauthClient);

  /**
   * This middleware MUST:
   * 1. Come AFTER all non-error controllers
   * 2. Come BEFORE all error controllers/middleware
   */
  app.use(
    Sentry.Handlers.errorHandler({
      shouldHandleError(_error) {
        /**
         * Capture all errors for now – we can selectively filter out errors based on code if needed.
         */
        return true;
      },
    }),
  );

  // Fallback error handler for errors that haven't been caught and sent as a response already
  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    Sentry.captureException(err);

    res.status(500).send(err.message);
  };
  app.use(errorHandler);

  // Create the HTTP server.
  // Note: calling `close` on a `http.Server` stops new connections, but it does not
  // close active connections. This can result in the server hanging indefinitely. We
  // use the `http-terminator` library to shut down the server properly.
  const httpServer = http.createServer(app);
  const terminator = httpTerminator.createHttpTerminator({
    server: httpServer,
  });
  shutdown.addCleanup("HTTP Server", async () => terminator.terminate());

  openInferEntitiesWebSocket({
    context: machineActorContext,
    httpServer,
    logger,
    temporalClient,
  });

  // Start the Apollo GraphQL server.
  // Note: the server must be started before the middleware can be applied
  await apolloServer.start();
  shutdown.addCleanup("ApolloServer", async () => apolloServer.stop());
  apolloServer.applyMiddleware({
    app,
    cors: CORS_CONFIG,
  });

  // Start the HTTP server before setting up the integration listener
  // This is done because the Redis client blocks when instantiated
  // and we must ensure that the health checks are available ASAP.
  await new Promise<void>((resolve) => {
    httpServer.listen({ port }, () => {
      logger.info(`Listening on port ${port}`);
      logger.info(`GraphQL path: ${apolloServer.graphqlPath}`);
      resolve();
    });
  });

  if (realtimeSyncEnabled && enabledIntegrations.linear) {
    const integrationSyncBackWatcher =
      await createIntegrationSyncBackWatcher(graphApi);

    void integrationSyncBackWatcher.start();

    shutdown.addCleanup(
      "Integration sync back watcher",
      integrationSyncBackWatcher.stop,
    );
  }
};

void main().catch(async (err) => {
  logger.error(err);
  await shutdown.trigger();
});
