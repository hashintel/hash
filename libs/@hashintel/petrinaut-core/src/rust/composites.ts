import { commandActionInputSchemas } from "../command-schemas";
import { calculateGraphLayout } from "../layout/calculate-graph-layout";
import { layoutNodeDimensions } from "../layout/dimensions";
import { generatePetrinautId, toPetrinautId } from "../petrinaut-id";

import type { CommandHelperFunctions } from "../commands";
import type { createRustDocHandle } from "./rust-doc-handle";

export const createRustCommands = (
  handle: ReturnType<typeof createRustDocHandle>,
): CommandHelperFunctions => {
  const readNet = (targetSubnetId?: string | null) => {
    const document = handle.doc();
    if (!document) {
      throw new Error("Rust Petrinaut instance has been disposed.");
    }
    if (!targetSubnetId) {
      return document;
    }
    const subnet = document.subnets?.find(
      ({ id }) => id === toPetrinautId(targetSubnetId),
    );
    if (!subnet) {
      throw new Error(`Subnet with ID \`${targetSubnetId}\` does not exist.`);
    }
    return subnet;
  };
  return {
    applyClipboardPaste(input) {
      const {
        payload: { data },
        targetSubnetId,
      } = commandActionInputSchemas.applyClipboardPaste.parse(input);
      const count =
        data.places.length +
        data.transitions.length +
        data.types.length +
        data.differentialEquations.length +
        data.parameters.length +
        data.types.reduce((sum, type) => sum + type.elements.length, 0);
      return handle.paste({
        data,
        targetSubnetId,
        freshIds: Array.from({ length: count }, () => generatePetrinautId()),
      });
    },
    async applyAutoLayout(input) {
      const targetSubnetId = input?.targetSubnetId;
      const target = readNet(targetSubnetId);
      if (
        !target.places.length &&
        !target.transitions.length &&
        !target.componentInstances?.length
      ) {
        return { commitCount: 0 };
      }
      const positions = await calculateGraphLayout(
        target,
        layoutNodeDimensions,
      );
      const current = readNet(targetSubnetId);
      const commits = [
        ...current.places.map((node) => ({ node, itemType: "place" as const })),
        ...current.transitions.map((node) => ({
          node,
          itemType: "transition" as const,
        })),
        ...(current.componentInstances ?? []).map((node) => ({
          node,
          itemType: "componentInstance" as const,
        })),
      ].flatMap(({ node, itemType }) => {
        const position = positions[node.id];
        return position && (node.x !== position.x || node.y !== position.y)
          ? [{ id: node.id, itemType, position }]
          : [];
      });
      if (handle.capabilities?.readonly) {
        return { commitCount: 0 };
      }
      handle.execute({
        type: "commitNodePositions",
        input: { targetSubnetId, commits },
      });
      return { commitCount: commits.length };
    },
  };
};
