import { use } from "react";

import { PetrinautInstanceContext } from "../instance-context";
import { SDCPNContext } from "../state/sdcpn-context";
import { useIsReadOnly } from "../state/use-is-read-only";
import { readControllers, writeControllers } from "./controllers";
import { readConstraints, writeConstraints } from "./constraints";

import type { ModelConstraint } from "./constraints";

/**
 * The net's constraints, a writer that replaces them, and a remover that also
 * drops the deleted constraint from every controller that points at it.
 *
 * Like the controllers writer, it goes through the document handle directly
 * and honours the read-only rule.
 */
export const useConstraints = (): {
  constraints: ModelConstraint[];
  updateConstraints: (
    update: (current: ModelConstraint[]) => ModelConstraint[],
  ) => void;
  removeConstraint: (id: string) => void;
} => {
  const { petriNetDefinition } = use(SDCPNContext);
  const instance = use(PetrinautInstanceContext);
  const isReadOnly = useIsReadOnly();

  const constraints = readConstraints(petriNetDefinition);

  const updateConstraints = (
    update: (current: ModelConstraint[]) => ModelConstraint[],
  ) => {
    if (isReadOnly || !instance || instance.readonly) {
      return;
    }
    instance.handle.change((draft) => {
      writeConstraints(draft, update(readConstraints(draft)));
    });
  };

  const removeConstraint = (id: string) => {
    if (isReadOnly || !instance || instance.readonly) {
      return;
    }
    instance.handle.change((draft) => {
      writeConstraints(
        draft,
        readConstraints(draft).filter((constraint) => constraint.id !== id),
      );
      const controllers = readControllers(draft);
      if (controllers.some((c) => c.constraintIds?.includes(id))) {
        writeControllers(
          draft,
          controllers.map((controller) =>
            controller.constraintIds?.includes(id)
              ? {
                  ...controller,
                  constraintIds: controller.constraintIds.filter(
                    (candidate) => candidate !== id,
                  ),
                }
              : controller,
          ),
        );
      }
    });
  };

  return { constraints, updateConstraints, removeConstraint };
};
