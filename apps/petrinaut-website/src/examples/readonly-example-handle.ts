import {
  createJsonDocHandle,
  type PetrinautDocHandle,
} from "@hashintel/petrinaut-core";

import type { LoadedExample } from "./catalog";

const handlesByExample = new Map<string, PetrinautDocHandle>();

/**
 * Return the one in-memory document handle for an example.
 *
 * Retaining one handle per example keeps the full editor stable across
 * search-only navigations. Read-only capability enforcement happens at the
 * document boundary and history is omitted.
 */
export const getReadonlyExampleHandle = ({
  catalog,
  definition,
}: LoadedExample): PetrinautDocHandle => {
  const key = catalog.slug;
  const existing = handlesByExample.get(key);
  if (existing) {
    return existing;
  }

  const handle = createJsonDocHandle({
    id: `example:${key}`,
    initial: definition,
    capabilities: { readonly: true },
    historyLimit: 0,
  });
  handlesByExample.set(key, handle);
  return handle;
};
