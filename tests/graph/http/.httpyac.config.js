// The Graph only honors `X-Authenticated-User-Actor-Id` next to the service secret. A request
// file overrides the injected header by setting it explicitly. The marker value `<omit>` removes
// the header from the request entirely.
module.exports = {
  configureHooks: (api) => {
    api.hooks.onRequest.addHook("serviceSecret", (request) => {
      if (!String(request.url).includes("127.0.0.1:4000")) {
        return;
      }
      request.headers = {
        "X-HASH-Service-Secret":
          process.env.HASH_GRAPH_SERVICE_SECRET ?? "hash-svc-local-dev-secret",
        ...request.headers,
      };
      if (request.headers["X-HASH-Service-Secret"] === "<omit>") {
        delete request.headers["X-HASH-Service-Secret"];
      }
    });
  },
};
