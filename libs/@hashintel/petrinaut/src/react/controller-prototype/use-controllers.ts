import { use } from "react";

import { PetrinautInstanceContext } from "../instance-context";
import { SDCPNContext } from "../state/sdcpn-context";
import { useIsReadOnly } from "../state/use-is-read-only";
import { readControllers, writeControllers } from "./controllers";

import type { Controller } from "./controllers";

/**
 * The net's controllers, and a writer that replaces them.
 *
 * Petrinaut has no mutation for the net's own metadata, so the writer goes
 * through the document handle directly. It honours the same read-only rule as
 * the other mutations.
 */
export const useControllers = (): {
  controllers: Controller[];
  updateControllers: (update: (current: Controller[]) => Controller[]) => void;
} => {
  const { petriNetDefinition } = use(SDCPNContext);
  const instance = use(PetrinautInstanceContext);
  const isReadOnly = useIsReadOnly();

  const controllers = readControllers(petriNetDefinition);

  const updateControllers = (
    update: (current: Controller[]) => Controller[],
  ) => {
    if (isReadOnly || !instance || instance.readonly) {
      return;
    }
    instance.handle.change((draft) => {
      writeControllers(draft, update(readControllers(draft)));
    });
  };

  return { controllers, updateControllers };
};
