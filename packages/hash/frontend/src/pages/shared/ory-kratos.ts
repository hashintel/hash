import { Configuration, V0alpha2Api } from "@ory/client";

export const oryCratosClient = new V0alpha2Api(
  new Configuration({
    /**
     * Directly connecting to kratos (using "http://127.0.0.1:4433") would prevent the
     * CRSF token from being set as an HTTP-Cookie, because the browser cannot send or
     * receive cookies via the browser `fetch` method.
     *
     * Therefore requests to the ory kratos public endpoing are made on the server in a
     * Next.js API handler.
     */
    basePath: "/api/ory",
  }),
);
