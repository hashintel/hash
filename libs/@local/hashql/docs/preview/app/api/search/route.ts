import { createFromSource } from "fumadocs-core/search/server";

import { source } from "../../../lib/source.js";

export const { GET } = createFromSource(source);
