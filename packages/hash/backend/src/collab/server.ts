import { ApolloClient } from "@apollo/client";
import { createApolloClient } from "@hashintel/hash-shared/graphql/createApolloClient";
import { IncomingMessage, ServerResponse } from "http";

import { getInstance, Instance } from "./Instance";
import { Output } from "./Output";
import { Route, Router } from "./Router";
import { StatusError } from "./StatusError";
import { Waiting } from "./Waiting";

// @todo remove this
interface ParsedQs {
  [key: string]: undefined | string | string[] | ParsedQs | ParsedQs[];
}

const router = new Router();

export const handleCollabRequest = (
  req: IncomingMessage,
  resp: ServerResponse
) => router.resolve(req, resp);

// Invoke a callback with a stream's data.
const readStreamAsJSON = (
  stream: IncomingMessage,
  callback: (err: any, result?: unknown) => void
) => {
  let data = "";
  stream.on("data", (chunk) => {
    data += chunk;
  });
  stream.on("end", () => {
    let result: any;
    let error: any;

    try {
      result = JSON.parse(data);
    } catch (err) {
      error = err;
    }
    callback(error, result);
  });
  stream.on("error", (evt) => callback(evt));
};

type RouteHandlerResult = Output | null | void;
type RouteHandler = (
  client: ApolloClient<unknown>,
  request: IncomingMessage,
  response: ServerResponse,
  ...parts: string[]
) => Promise<RouteHandlerResult>;

// Register a server route.
const handle = (
  method: Route["method"],
  url: Route["url"],
  fn: RouteHandler
) => {
  router.add(method, ["collab-backend", ...url], (req, resp, ...args) => {
    const apolloClient = createApolloClient({
      name: "collab",
      additionalHeaders: { Cookie: req.headers.cookie },
    });

    async function finish() {
      let output: RouteHandlerResult;

      try {
        output = await fn(apolloClient, req, resp, ...args);
      } catch (err) {
        console.log(err.stack);
        output = new Output(err.status || 500, err.toString());
      }
      if (output) output.resp(resp);
    }

    void finish();
  });
};

// @todo reduce duplication
const handlePost = (url: Route["url"], fn: (data: unknown) => RouteHandler) => {
  handle("POST", url, async (client, req, resp, ...args) => {
    let data: unknown;

    try {
      data = await new Promise((resolve, reject) => {
        readStreamAsJSON(req, (err, val) => {
          if (err) {
            reject(err);
          } else {
            resolve(val);
          }
        });
      });
    } catch (err) {
      new Output(500, err.toString()).resp(resp);
      return;
    }
    return await fn(data)(client, req, resp, ...args);
  });
};

const reqIP = (request: IncomingMessage): string | null =>
  request.headers["x-forwarded-for"]?.toString() ??
  request.socket.remoteAddress ??
  null;

// Output the current state of a document instance.
handle("GET", [null, null], async (client, req, response, accountId, id) => {
  // @todo don't use ip for user registration
  const inst = await getInstance(client)(accountId, id, reqIP(req));
  return Output.json({
    doc: inst.doc.toJSON(),
    users: inst.userCount,
    version: inst.version,
  });
});

const nonNegInteger = (str: ParsedQs[string]) => {
  const num = Number(str);
  if (!Number.isNaN(num) && Math.floor(num) === num && num >= 0) return num;

  throw new StatusError(400, `Not a non-negative integer: ${str}`);
};

const outputEvents = (
  inst: Instance,
  data: Exclude<ReturnType<Instance["getEvents"]>, boolean>
) =>
  Output.json({
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

// An endpoint for a collaborative document instance which
// returns all events between a given version and the server's
// current version of the document.
handle(
  "GET",
  [null, null, "events"],
  async (client, req, resp, accountId, id) => {
    const version = nonNegInteger(
      // @todo type this
      // @ts-ignore-error
      req.query.version
    );

    const inst = await getInstance(client)(accountId, id, reqIP(req));
    const data = inst.getEvents(version);
    if (data === false) return new Output(410, "History no longer available");
    // If the server version is greater than the given version,
    // return the data immediately.
    if (data.steps.length) return outputEvents(inst, data);
    // If the server version matches the given version,
    // wait until a new version is published to return the event data.
    const wait = new Waiting(resp, inst, reqIP(req), () => {
      wait.send(outputEvents(inst, inst.getEvents(version)));
    });
    inst.waiting.push(wait);
    resp.on("close", () => wait.abort());
  }
);

// The event submission endpoint, which a client sends an event to.
handlePost(
  [null, null, "events"],
  // @todo type data
  (data: any) => async (client, request, response, accountId, id) => {
    const instance = await getInstance(client)(accountId, id, reqIP(request));
    const version = nonNegInteger(data.version);
    const result = instance.addJsonEvents(client)(
      version,
      data.steps,
      data.clientID
    );
    if (!result) return new Output(409, "Version not current");
    else return Output.json(result);
  }
);
