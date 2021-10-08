import { createApolloClient } from "@hashintel/hash-shared/graphql/createApolloClient";

import { Router } from "./route";

import { getInstance } from "./Instance";
import { Output } from "./Output";
import { Waiting } from "./Waiting";

const router = new Router();

export const handleCollabRequest = function (req, resp) {
  return router.resolve(req, resp);
};

// : (stream.Readable, Function)
// Invoke a callback with a stream's data.
function readStreamAsJSON(stream, callback) {
  let data = "";
  stream.on("data", (chunk) => (data += chunk));
  stream.on("end", () => {
    let result, error;
    try {
      result = JSON.parse(data);
    } catch (err) {
      error = err;
    }
    callback(error, result);
  });
  stream.on("error", (evt) => callback(evt));
}

// : (string, Array, Function)
// Register a server route.
function handle(method, url, fn) {
  router.add(method, ["collab-backend", ...url], (req, resp, ...args) => {
    req.apolloClient = createApolloClient({
      name: "collab",
      additionalHeaders: { Cookie: req.headers.cookie },
    });

    async function finish() {
      let output;
      try {
        output = await fn(...args, req, resp);
      } catch (err) {
        console.log(err.stack);
        output = new Output(err.status || 500, err.toString());
      }
      if (output) output.resp(resp);
    }

    if (method === "PUT" || method === "POST") {
      readStreamAsJSON(req, (err, val) => {
        if (err) new Output(500, err.toString()).resp(resp);
        else {
          args.unshift(val);
          finish();
        }
      });
    } else finish();
  });
}

// Output the current state of a document instance.
handle("GET", [null, null], async (accountId, id, req) => {
  // @todo don't use ip for user registration
  const inst = await getInstance(req.apolloClient)(accountId, id, reqIP(req));
  return Output.json({
    doc: inst.doc.toJSON(),
    users: inst.userCount,
    version: inst.version,
  });
});

function nonNegInteger(str) {
  const num = Number(str);
  if (!isNaN(num) && Math.floor(num) === num && num >= 0) return num;
  const err = new Error("Not a non-negative integer: " + str);
  err.status = 400;
  throw err;
}

function outputEvents(inst, data) {
  return Output.json({
    version: inst.version,
    steps: data.steps.map((step) => step.toJSON()),
    clientIDs: data.steps.map((step) => step.clientID),
    users: data.users,
  });
}

// An endpoint for a collaborative document instance which
// returns all events between a given version and the server's
// current version of the document.
handle("GET", [null, null, "events"], async (accountId, id, req, resp) => {
  const version = nonNegInteger(req.query.version);

  const inst = await getInstance(req.apolloClient)(accountId, id, reqIP(req));
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
});

function reqIP(request) {
  return request.headers["x-forwarded-for"] || request.socket.remoteAddress;
}

// The event submission endpoint, which a client sends an event to.
handle("POST", [null, null, "events"], async (data, accountId, id, req) => {
  const instance = await getInstance(req.apolloClient)(
    accountId,
    id,
    reqIP(req)
  );
  const version = nonNegInteger(data.version);
  const result = instance.addJsonEvents(req.apolloClient)(
    version,
    data.steps,
    data.clientID
  );
  if (!result) return new Output(409, "Version not current");
  else return Output.json(result);
});
