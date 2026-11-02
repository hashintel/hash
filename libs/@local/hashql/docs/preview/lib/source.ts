import { loader } from "fumadocs-core/source";

import { docs } from "../.source/server.js";

export const source = loader({
  baseUrl: "/docs/hashql",
  source: docs.toFumadocsSource(),
});
