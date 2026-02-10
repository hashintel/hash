import http from "node:http";
import { promisify } from "node:util";

import type { ProvidedEntityEditionProvenance } from "@blockprotocol/type-system";
import KeyvRedis from "@keyv/redis";
import { JsonDecoder, JsonEncoder } from "@local/harpc-client/codec";
import { Client as RpcClient, Transport } from "@local/harpc-client/net";
import { RequestIdProducer } from "@local/harpc-client/wire-protocol";
import { createGraphClient } from "@local/hash-backend-utils/create-graph-client";
import {
  getRequiredEnv,
  realtimeSyncEnabled,
  waitOnResource,
} from "@local/hash-backend-utils/environment";
import { createRedisClient } from "@local/hash-backend-utils/redis";
import { GracefulShutdown } from "@local/hash-backend-utils/shutdown";
import { createTemporalClient } from "@local/hash-backend-utils/temporal";
import { createVaultClient } from "@local/hash-backend-utils/vault";
import { EchoSubsystem } from "@local/hash-graph-sdk/harpc";
import {
  getHashClientTypeFromRequest,
  hashClientHeaderKey,
} from "@local/hash-isomorphic-utils/http-requests";
import { isSelfHostedInstance } from "@local/hash-isomorphic-utils/instance";
import * as Sentry from "@sentry/node";
import bodyParser from "body-parser";
import cors from "cors";
import { Effect, Exit, Layer, Logger, LogLevel, ManagedRuntime } from "effect";
import { RuntimeException } from "effect/Cause";
import type { ErrorRequestHandler, Request, Response } from "express";
import express, { raw } from "express";
import { create as handlebarsCreate } from "express-handlebars";
import type { Options as RateLimitOptions } from "express-rate-limit";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { StatsD } from "hot-shots";
import {
  createProxyMiddleware,
  fixRequestBody,
  responseInterceptor,
} from "http-proxy-middleware";
import httpTerminator from "http-terminator";
import Keyv from "keyv";
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
import { createEmailTransporter } from "./email/create-email-transporter";
import { ensureSystemGraphIsInitialized } from "./graph/ensure-system-graph-is-initialized";
import { ensureHashSystemAccountExists } from "./graph/system-account";
import { createApolloServer } from "./graphql/create-apollo-server";
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
  GRAPHQL_PATH,
  LOCAL_FILE_UPLOAD_PATH,
} from "./lib/config";
import { isDevEnv, isProdEnv, isStatsDEnabled, port } from "./lib/env-config";
import { logger } from "./logger";
import { seedOrgsAndUsers } from "./seed-data";
import {
  setupFileDownloadProxyHandler,
  setupStorageProviders,
} from "./storage";
import { setupTelemetry } from "./telemetry/snowplow-setup";

const app = express();

const httpServer = http.createServer(app);

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
    if (req.body?.identifier) {
      /**
       * 'identifier' is the field which identifies the user on a signin attempt.
       * We use this as a rate limiting key if present to mitigate brute force signin attempts spread across multiple IPs.
       */
      return req.body.identifier as string;
    }
    return ipKeyGenerator(req.ip!);
  },
});

const hydraProxy = createProxyMiddleware<Request, Response>({
  target: hydraPublicUrl ?? "",
  pathRewrite: (_, req) => req.originalUrl,
});

const kratosProxy = createProxyMiddleware<Request, Response>({
  target: kratosPublicUrl,
  pathRewrite: {
    /**
     * Remove the `/auth` prefix from the request path, so the path is
     * formatted correctly for the Ory Kratos API.
     */
    "^/auth": "",
  },
  /**
   * Avoid proxy-level URL logging here as `/auth/*` requests can contain
   * sensitive query parameters used by Ory self-service flows.
   */
  selfHandleResponse: true,
  on: {
    proxyReq: fixRequestBody,
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
    proxyRes: (proxyRes, req, res) => {
      const expectedAccessControlAllowOriginHeader = res.getHeader(
        "access-control-allow-origin",
      );

      return responseInterceptor((responseBuffer, _, __, inflightRes) => {
        if (typeof expectedAccessControlAllowOriginHeader === "string") {
          inflightRes.setHeader(
            "access-control-allow-origin",
            expectedAccessControlAllowOriginHeader,
          );
        }

        return Promise.resolve(responseBuffer);
      })(proxyRes, req, res);
    },
  },
});

const main = async () => {
  logger.info("Type System initialized");

  if (process.env.HASH_TELEMETRY_ENABLED === "true") {
    logger.info("Starting [Snowplow] telemetry");

    const snowplowTracker = await setupTelemetry();

    shutdown.addCleanup("Snowplow Telemetry", async () => {
      logger.info("Flushing [Snowplow] telemetry");
      await snowplowTracker.flush();
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
      const statsdPort = Number.parseInt(process.env.STATSD_PORT || "8125", 10);
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

  app.use(cors(CORS_CONFIG));

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

  app.get("/my-ip", (req, res) => {
    res.send(req.ip);
  });

  // Add logging of requests
  app.use((req, res, next) => {
    const requestId = nanoid();
    res.set("x-hash-request-id", requestId);
    logger.info(
      JSON.stringify({
        requestId,
        method: req.method,
        origin: req.headers.origin,
        ip: req.ip,
        path: req.path,
        userAgent: req.headers["user-agent"],
        graphqlClient:
          req.headers[hashClientHeaderKey] ??
          req.headers["apollographql-client-name"],
      }),
    );

    next();
  });

  const redisHost = getRequiredEnv("HASH_REDIS_HOST");
  const redisPort = Number.parseInt(getRequiredEnv("HASH_REDIS_PORT"), 10);
  const redisEncryptedTransit =
    process.env.HASH_REDIS_ENCRYPTED_TRANSIT === "true";
  const redisUrl = `redis${redisEncryptedTransit ? "s" : ""}://${redisHost}:${redisPort}`;

  const graphApiHost = getRequiredEnv("HASH_GRAPH_HTTP_HOST");
  const graphApiPort = Number.parseInt(
    getRequiredEnv("HASH_GRAPH_HTTP_PORT"),
    10,
  );

  await Promise.all([
    waitOnResource(`tcp:${redisHost}:${redisPort}`, logger),
    waitOnResource(`tcp:${graphApiHost}:${graphApiPort}`, logger),
  ]);

  // Connect to Redis
  const redis = await createRedisClient({ url: redisUrl, logger }).connect();
  const keyv = new Keyv({ store: new KeyvRedis(redis) });
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

  const vaultClient = await createVaultClient({ logger });

  if (!vaultClient && !isSelfHostedInstance) {
    throw new Error("Failed to create Vault client, check preceding logs.");
  }

  const machineProvenance: ProvidedEntityEditionProvenance = {
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
      seedSystemPolicies: false,
    });
  } else {
    // Globally sets `systemAccountId`
    await ensureHashSystemAccountExists({
      logger,
      context: machineActorContext,
    });
  }

  const userProvenance: ProvidedEntityEditionProvenance = {
    actorType: "user",
    origin: {
      type: "api",
    },
  };

  const userActorContext = {
    graphApi,
    provenance: userProvenance,
    uploadProvider,
    temporalClient,
  };

  // This will seed users, an org and pages.
  // Configurable through environment variables.
  await seedOrgsAndUsers({ logger, context: userActorContext });

  // Set sensible default security headers: https://www.npmjs.com/package/helmet
  // Hardening directives that helmet sets by default but are lost when providing
  // a custom contentSecurityPolicy (which replaces rather than merges directives).
  const cspHardeningDirectives = {
    baseUri: ["'self'"],
    objectSrc: ["'none'"],
    scriptSrcAttr: ["'none'"],
    frameAncestors: ["'self'"],
  } as const;

  const defaultHelmet = helmet();

  const graphqlExplorerHelmet = helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://embeddable-sandbox.cdn.apollographql.com",
          "https://apollo-server-landing-page.cdn.apollographql.com",
        ],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: [
          "'self'",
          "data:",
          "https://apollo-server-landing-page.cdn.apollographql.com",
        ],
        connectSrc: [
          "'self'",
          "https://apollo-server-landing-page.cdn.apollographql.com",
          "https://embeddable-sandbox.cdn.apollographql.com",
        ],
        frameSrc: ["'self'", "https://sandbox.embed.apollographql.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        manifestSrc: [
          "'self'",
          "https://apollo-server-landing-page.cdn.apollographql.com",
        ],
        ...cspHardeningDirectives,
      },
    },
  });

  // The OAuth consent page (views/consent.hbs) loads normalize.css from cdnjs
  // and consent.js from the local public directory.
  const oauthConsentHelmet = helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "https://cdnjs.cloudflare.com"],
        ...cspHardeningDirectives,
      },
    },
  });

  app.use((req, res, next) => {
    if (req.path === GRAPHQL_PATH && req.method === "GET") {
      return graphqlExplorerHelmet(req, res, next);
    }
    if (req.path === "/oauth2/consent") {
      return oauthConsentHelmet(req, res, next);
    }
    return defaultHelmet(req, res, next);
  });

  app.use(express.static("public"));

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
    "/auth",
    authRouteRateLimiter,
    userIdentifierRateLimiter,
    cors(CORS_CONFIG),
    kratosProxy,
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

    if (req.ip) {
      /**
       * Sentry has its own logic to attach an IP to requests, which will favour X-Forwarded-For headers.
       * We additionally attach our req.ip as context (which comes from cf-connecting-ip in production).
       * Both can be spoofed, but X-Forwarded-For is a bit easier to spoof, as it just involves adding an entry to that header with whatever.
       */
      scope.setContext("request", { ip: req.ip });
    }

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

  const emailTransporter = createEmailTransporter();

  const [apolloServer, apolloMiddleware] = await createApolloServer({
    graphApi,
    uploadProvider,
    temporalClient,
    vaultClient,
    cache: keyv,
    emailTransporter,
    logger,
    statsd,
    httpServer,
  });

  // Make the data sources/clients available to REST controllers
  // @todo figure out sharing of context between REST and GraphQL without repeating this
  app.use((req, _res, next) => {
    const provenance: ProvidedEntityEditionProvenance = {
      actorType: "user",
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

  setupFileDownloadProxyHandler(app, keyv);

  setupBlockProtocolExternalServiceMethodProxy(app);

  app.get("/", (_req, res) => {
    res.send("Hello World");
  });

  /** RPC */
  if (process.env.HASH_RPC_ENABLED === "true") {
    const rpcClient = RpcClient.layer();

    const runtime = ManagedRuntime.make(
      Layer.mergeAll(
        rpcClient,
        RequestIdProducer.layer,
        JsonDecoder.layer,
        JsonEncoder.layer,
        Logger.pretty,
      ),
    );

    shutdown.addCleanup("ManagedRuntime", () => runtime.dispose());

    const rpcHost = getRequiredEnv("HASH_GRAPH_RPC_HOST");
    const rpcPort = Number.parseInt(
      process.env.HASH_GRAPH_RPC_PORT ?? "4002",
      10,
    );

    // print out (temporary) DNS diagnostics
    // see: https://linear.app/hash/issue/H-3813/remove-dns-logging-durring-hash-api-start
    void (async () => {
      const { default: dns } = await import("node:dns/promises");
      const { default: fs } = await import("node:fs/promises");

      const servers = dns.getServers();
      logger.info(`DNS servers: ${servers}`);

      try {
        const resolveAny = await dns.resolveAny(rpcHost);
        logger.info(`DNS resolution for ${rpcHost}`, { resolveAny });
      } catch (error) {
        logger.error(`DNS resolution for ${rpcHost} failed`, { error });
      }

      // log out /etc/hosts, if it exists
      try {
        const hosts = await fs.readFile("/etc/hosts", "utf8");
        logger.info(`Contents of /etc/hosts`, { hosts });
      } catch (error) {
        logger.error(`Could not read /etc/hosts`, { error });
      }
    })();

    app.get("/rpc/echo", (req, res) => {
      // eslint-disable-next-line func-names
      const effect = Effect.gen(function* () {
        const textQueryParam = req.query.text;
        if (typeof textQueryParam !== "string") {
          return yield* new RuntimeException(
            "text query parameter is required",
          );
        }

        const response = yield* EchoSubsystem.echo(textQueryParam);
        res.status(200).send(response);
      }).pipe(
        Effect.provide(
          RpcClient.connectLayer(
            Transport.multiaddr(`/dns/${rpcHost}/tcp/${rpcPort}`),
          ),
        ),
        Logger.withMinimumLogLevel(LogLevel.Trace),
      );

      runtime.runCallback(effect, {
        onExit: (exit) => {
          if (Exit.isFailure(exit)) {
            res.status(500).send(exit.cause.toString());
          }
        },
      });
    });
  }

  // Used by AWS Application Load Balancer (ALB) for health checks
  app.get("/health-check", (_, res) => res.status(200).send("Hello World!"));

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
  Sentry.setupExpressErrorHandler(app, {
    shouldHandleError(_error) {
      /**
       * Capture all errors for now – we can selectively filter out errors based on code if needed.
       */
      return true;
    },
  });

  // Fallback error handler for errors that haven't been caught and sent as a response already
  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    Sentry.captureException(err);

    res.status(500).send(err.message);
  };
  app.use(errorHandler);

  // Note: calling `close` on a `http.Server` stops new connections, but it does not
  // close active connections. This can result in the server hanging indefinitely. We
  // use the `http-terminator` library to shut down the server properly.
  const terminator = httpTerminator.createHttpTerminator({
    server: httpServer,
  });
  shutdown.addCleanup("HTTP Server", async () => terminator.terminate());

  openInferEntitiesWebSocket({
    context: machineActorContext,
    httpServer,
    logger,
    storageProvider: uploadProvider,
    temporalClient,
  });

  // Start the Apollo GraphQL server.
  shutdown.addCleanup("ApolloServer", async () => apolloServer.stop());
  app.use(
    GRAPHQL_PATH,
    cors<cors.CorsRequest>(CORS_CONFIG),
    express.json(),
    apolloMiddleware,
  );

  // Start the HTTP server before setting up the integration listener
  // This is done because the Redis client blocks when instantiated
  // and we must ensure that the health checks are available ASAP.
  await new Promise<void>((resolve) => {
    httpServer.listen({ host: "0.0.0.0", port }, () => {
      logger.info(`Listening on port ${port}`);
      logger.info(`GraphQL path: ${GRAPHQL_PATH}`);
      resolve();
    });
  });

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (realtimeSyncEnabled && enabledIntegrations.linear) {
    if (!vaultClient) {
      throw new Error(
        "Vault client is required for realtime sync and was not created (check preceding logs)",
      );
    }

    const integrationSyncBackWatcher = await createIntegrationSyncBackWatcher({
      graphApi,
      redis,
      logger,
      vaultClient,
    });

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
