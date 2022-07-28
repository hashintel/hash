import { EmbedderGraphMessageCallbacks } from "@blockprotocol/graph";

import { useCallback } from "react";

export const useBlockProtocolUpdateLink = (): {
  updateLink: EmbedderGraphMessageCallbacks["updateLink"];
} => {
  const updateLink: EmbedderGraphMessageCallbacks["updateLink"] = useCallback(
    async (_actions) => {
      throw new Error("Updating single links via linkId not yet implemented.");
    },
    [],
  );

  return {
    updateLink,
  };
};
