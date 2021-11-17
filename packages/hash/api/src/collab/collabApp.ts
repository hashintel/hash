import { entityStoreFromProsemirror } from "@hashintel/hash-shared/entityStorePlugin";
import { createApolloClient } from "@hashintel/hash-shared/graphql/createApolloClient";
import { json } from "body-parser";
import corsMiddleware from "cors";
import express, { Request, Response } from "express";
import { IncomingMessage } from "http";
// @ts-expect-error -- temp import with no types
// eslint-disable-next-line import/no-extraneous-dependencies
import UAParser from "ua-parser-js";
import { FRONTEND_URL } from "../lib/config";
import { EntityWatcher } from "./EntityWatcher";
import { getInstance, Instance } from "./Instance";
import { InvalidRequestPayloadError, InvalidVersionError } from "./errors";
import { Waiting } from "./Waiting";
import { queuePromise } from "./queue";

export const collabApp = express();

const entityWatcherPromise = (async () => {
  const entityWatcher = new EntityWatcher(await queuePromise);

  /**
   * @todo handle this
   */
  entityWatcher.start().catch((err) => {
    console.error("Error in entity watcher", err);
  });

  return entityWatcher;
})();

collabApp.use(json({ limit: "16mb" }));
collabApp.use(corsMiddleware({ credentials: true, origin: FRONTEND_URL }));

const createCollabApolloClient = (request: IncomingMessage) =>
  createApolloClient({
    name: "collab",
    additionalHeaders: { Cookie: request.headers.cookie },
  });

const handleError = (response: Response, error: unknown) => {
  console.error(error);
  response
    .status(error instanceof InvalidRequestPayloadError ? 400 : 500)
    .send(`${error}`);
};

const nonNegInteger = (rawValue: Request["query"][string]) => {
  const num = Number(rawValue);
  if (!Number.isNaN(num) && Math.floor(num) === num && num >= 0) return num;

  throw new InvalidVersionError(rawValue);
};

const jsonEvents = (
  instance: Instance,
  data: Exclude<ReturnType<Instance["getEvents"]>, boolean>,
) => ({
  version: instance.version,
  steps: data.steps.map((step) => step.toJSON()),
  clientIDs: data.clientIDs,
  users: data.users,
  store: data.store,
});

const extractTempFakeUserId = (request: Request): string | null => {
  const ipAddress = (
    request.headers["x-forwarded-for"]?.toString() ??
    request.socket.remoteAddress
  )?.replace("::ffff:", "");

  const browserName = new UAParser(request.headers["user-agent"]).getBrowser()
    ?.name;

  return `${ipAddress ?? "0.0.0.0"}/${browserName ?? "unknown browser"}`;
};

collabApp.get("/:accountId/:pageEntityId", (request, response) => {
  (async () => {
    const client = createCollabApolloClient(request);

    // TODO: Replace with apollo client → me
    const userId = extractTempFakeUserId(request);

    const instance = await getInstance(client, await entityWatcherPromise)(
      request.params.accountId,
      request.params.pageEntityId,
      userId,
    );

    response.json({
      doc: instance.state.doc.toJSON(),
      store: entityStoreFromProsemirror(instance.state).store,
      users: instance.userCount,
      version: instance.version,
    });
  })().catch((err) => {
    handleError(response, err);
  });
});

collabApp.get("/:accountId/:pageEntityId/events", async (request, response) => {
  try {
    const client = createCollabApolloClient(request);
    const version = nonNegInteger(request.query.version);

    // TODO: Replace with apollo client → me
    const userId = extractTempFakeUserId(request);

    const instance = await getInstance(client, await entityWatcherPromise)(
      request.params.accountId,
      request.params.pageEntityId,
      userId,
    );
    const data = instance.getEvents(version);

    if (data === false) {
      response.status(410).send("History no longer available");
      return;
    }
    // If the server version is greater than the given version,
    // return the data immediately.
    if (data.steps.length) return response.json(jsonEvents(instance, data));
    // If the server version matches the given version,
    // wait until a new version is published to return the event data.
    const wait = new Waiting(response, instance, userId, () => {
      const events = instance.getEvents(version);
      if (events === false) {
        response.status(410).send("History no longer available");
        return;
      }

      wait.send(jsonEvents(instance, events));
    });
    instance.waiting.push(wait);
    response.on("close", () => wait.abort());
  } catch (error) {
    handleError(response, error);
  }
});

collabApp.post(
  "/:accountId/:pageEntityId/events",
  async (request, response) => {
    try {
      const client = createCollabApolloClient(request);

      // TODO: Replace with apollo client → me
      const userId = extractTempFakeUserId(request);

      const instance = await getInstance(client, await entityWatcherPromise)(
        request.params.accountId,
        request.params.pageEntityId,
        userId,
      );

      // @todo type this
      const data: any = request.body;
      const version = nonNegInteger(data.version);

      const result = await instance.addJsonEvents(client)(
        version,
        data.steps,
        data.clientID,
        data.blockIds,
      );
      if (!result) {
        response.status(409).send("Version not current");
      } else {
        response.json(result);
      }
    } catch (error) {
      handleError(response, error);
    }
  },
);

collabApp.get(
  "/:accountId/:pageEntityId/positions",
  async (request, response) => {
    try {
      const client = createCollabApolloClient(request);

      // TODO: Replace with apollo client → me
      const userId = extractTempFakeUserId(request);

      if (!userId) {
        response.status(401).send("Authentication required");
        return;
      }

      const instance = await getInstance(client, await entityWatcherPromise)(
        request.params.accountId,
        request.params.pageEntityId,
        userId,
      );

      const poll = request.query.poll === "true" || request.query.poll === "1";

      if (!poll) {
        response.json(instance.extractPositions(userId));
        return;
      }

      instance.addPositionPoller({
        baselinePositions: instance.extractPositions(userId),
        userIdToExclude: userId,
        response,
      });
    } catch (error) {
      handleError(response, error);
    }
  },
);

collabApp.post(
  "/:accountId/:pageEntityId/report-position",
  async (request, response) => {
    try {
      const client = createCollabApolloClient(request);

      // TODO: Replace with apollo client → me
      const userId = extractTempFakeUserId(request);

      if (!userId) {
        response.status(401).send("Authentication required");
        return;
      }

      const instance = await getInstance(client, await entityWatcherPromise)(
        request.params.accountId,
        request.params.pageEntityId,
        userId,
      );

      const { entityId } = request.body;

      if (typeof entityId !== "string" && entityId !== null) {
        throw new InvalidRequestPayloadError(
          "Expected entityId to be a string or null",
        );
      }

      const userShortname = userId;
      const userPreferredName = userShortname;

      instance.registerPosition({
        userId,
        userShortname,
        userPreferredName,
        entityId,
      });

      response.status(200).send("OK");
    } catch (error) {
      handleError(response, error);
    }
  },
);
