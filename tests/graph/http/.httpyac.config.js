// The Graph only honors `X-Authenticated-User-Actor-Id` next to the service credential. A request
// file overrides the injected header by setting it explicitly. The marker value `<omit>` removes
// the header from the request entirely.
module.exports = {
  configureHooks: (api) => {
    api.hooks.onRequest.addHook("serviceSecret", (request) => {
      const url = String(request.url);
      if (!url.includes("127.0.0.1:4000") && !url.includes("127.0.0.1:4001")) {
        return;
      }
      request.headers = {
        Authorization: `HASH-Service ${
          process.env.HASH_GRAPH_SERVICE_SECRET ?? "hash-svc-local-dev-secret"
        }`,
        ...request.headers,
      };
      if (request.headers.Authorization === "<omit>") {
        delete request.headers.Authorization;
      }
    });
  },
};
