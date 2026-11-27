import type { getHASHInternalAPI } from "./api.gen.js";

export * from "./api.gen.js";

export type InternalApi = ReturnType<typeof getHASHInternalAPI>;
