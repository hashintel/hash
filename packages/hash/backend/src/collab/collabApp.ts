import { createApolloClient } from "@hashintel/hash-shared/graphql/createApolloClient";
import { json } from "body-parser";
import corsMiddleware from "cors";
import express from "express";
import { IncomingMessage } from "http";
import { FRONTEND_URL } from "../lib/config";
import { getInstance, Instance } from "./Instance";
import { StatusError } from "./StatusError";
import { Waiting } from "./Waiting";

export const collabApp = express();

collabApp.use(json({ limit: "16mb" }));
collabApp.use(corsMiddleware({ credentials: true, origin: FRONTEND_URL }));

const createCollabApolloClient = (req: IncomingMessage) =>
  createApolloClient({
    name: "collab",
    additionalHeaders: { Cookie: req.headers.cookie },
  });

const reqIP = (request: IncomingMessage): string | null =>
  request.headers["x-forwarded-for"]?.toString() ??
  request.socket.remoteAddress ??
  null;

// @todo remove this
interface ParsedQs {
  [key: string]: undefined | string | string[] | ParsedQs | ParsedQs[];
}

const nonNegInteger = (str: ParsedQs[string]) => {
  const num = Number(str);
  if (!Number.isNaN(num) && Math.floor(num) === num && num >= 0) return num;

  throw new StatusError(400, `Not a non-negative integer: ${str}`);
};

const jsonEvents = (
  inst: Instance,
  data: Exclude<ReturnType<Instance["getEvents"]>, boolean>
) => ({
  version: inst.version,
  steps: data.steps.map((step) => step.toJSON()),
  clientIDs: data.steps.map(
    (step) =>
      // @todo fix this
      // @ts-ignore-error
      step.clientID
  ),
  users: data.users,
});

collabApp.get("/:accountId/:pageId", (req, resp) => {
  (async () => {
    const client = createCollabApolloClient(req);

    const inst = await getInstance(client)(
      req.params.accountId,
      req.params.pageId,
      reqIP(req)
    );

    resp.json({
      doc: inst.doc.toJSON(),
      users: inst.userCount,
      version: inst.version,
    });
  })().catch((err) => {
    resp.status(500).send(err.toString());
  });
});

collabApp.get("/:accountId/:pageId/events", (req, resp) => {
  (async () => {
    const client = createCollabApolloClient(req);
    const version = nonNegInteger(req.query.version);

    const inst = await getInstance(client)(
      req.params.accountId,
      req.params.pageId,
      reqIP(req)
    );
    const data = inst.getEvents(version);

    if (data === false) {
      resp.status(410).send("History no longer available");
      return;
    }
    // If the server version is greater than the given version,
    // return the data immediately.
    if (data.steps.length) return resp.json(jsonEvents(inst, data));
    // If the server version matches the given version,
    // wait until a new version is published to return the event data.
    const wait = new Waiting(resp, inst, reqIP(req), () => {
      wait.send(jsonEvents(inst, inst.getEvents(version)));
    });
    inst.waiting.push(wait);
    resp.on("close", () => wait.abort());
  })().catch((err) => {
    resp.status(500).send(err.toString());
  });
});

collabApp.post("/:accountId/:pageId/events", (req, resp) => {
  (async () => {
    const client = createCollabApolloClient(req);
    const inst = await getInstance(client)(
      req.params.accountId,
      req.params.pageId,
      reqIP(req)
    );

    // @todo type this
    const data: any = req.body;
    const version = nonNegInteger(data.version);

    const result = inst.addJsonEvents(client)(
      version,
      data.steps,
      data.clientID
    );
    if (!result) {
      resp.status(409).send("Version not current");
    } else {
      resp.json(result);
    }
  })().catch((err) => {
    resp.status(500).send(err.toString());
  });
});
