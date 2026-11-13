import {
  createRegistry,
  Harness,
  type HarnessOptions,
  type Storage,
} from "@earendil-works/pi-durable";

import { ledgerExtension } from "./ledger";

import type { Context } from "@earendil-works/chord";

/** Open a Harness over `storage` with Brunch's extensions installed. */
export const openHarness = (
  storage: Storage,
  options: Omit<HarnessOptions, "registry">,
  context: Context,
): Promise<Harness> => {
  const registry = createRegistry();
  registry.install(ledgerExtension);
  return Harness.open(storage, { ...options, registry }, context);
};
