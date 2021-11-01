import { entityStoreFromProsemirror } from "@hashintel/hash-shared/entityStorePlugin";
import { createApolloClient } from "@hashintel/hash-shared/graphql/createApolloClient";
import { json } from "body-parser";
import corsMiddleware from "cors";
import express, { Request, Response } from "express";
import { IncomingMessage } from "http";
import { FRONTEND_URL } from "../lib/config";
import { getInstance, Instance } from "./Instance";
import { InvalidVersionError } from "./InvalidVersionError";
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

const handleError = (resp: Response, err: any) => {
  console.error(err);
  resp
    .status(err instanceof InvalidVersionError ? 400 : 500)
    .send(err.toString());
};

const nonNegInteger = (str: Request["query"][string]) => {
  const num = Number(str);
  if (!Number.isNaN(num) && Math.floor(num) === num && num >= 0) return num;

  throw new InvalidVersionError(str);
};

const jsonEvents = (
  inst: Instance,
  data: Exclude<ReturnType<Instance["getEvents"]>, boolean>
) => ({
  version: inst.version,
  steps: data.steps.map((step) => step.toJSON()),
  clientIDs: data.clientIDs,
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
      doc: inst.state.doc.toJSON(),
      store: entityStoreFromProsemirror(inst.state).store,
      users: inst.userCount,
      version: inst.version,
    });
  })().catch((err) => {
    handleError(resp, err);
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
      const events = inst.getEvents(version);
      if (events === false) {
        resp.status(410).send("History no longer available");
        return;
      }

      wait.send(jsonEvents(inst, events));
    });
    inst.waiting.push(wait);
    resp.on("close", () => wait.abort());
  })().catch((err) => {
    handleError(resp, err);
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

    const result = await inst.addJsonEvents(client)(
      version,
      data.steps,
      data.clientID,
      data.blockIds
    );
    if (!result) {
      resp.status(409).send("Version not current");
    } else {
      resp.json(result);
    }
  })().catch((err) => {
    handleError(resp, err);
  });
});
