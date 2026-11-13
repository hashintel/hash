import {
  createRegistry,
  Harness,
  type HarnessOptions,
  type Storage,
} from "@earendil-works/pi-durable";

import { createHostBinding } from "./agent/host-binding";
import { createLedgerExtension } from "./ledger";

import type { Context } from "@earendil-works/chord";

/** Open a Harness over `storage` with Brunch's Ledger extension installed over its host binding. */
export const openHarness = async (
  storage: Storage,
  options: Omit<HarnessOptions, "registry">,
  context: Context,
): Promise<Harness> => {
  const host = createHostBinding();
  const registry = createRegistry();
  registry.install(createLedgerExtension(host));
  const harness = await Harness.open(
    storage,
    { ...options, registry },
    context,
  );
  // Open schedules nothing, so no tool runs unbound.
  host.bind(harness);
  return harness;
};
