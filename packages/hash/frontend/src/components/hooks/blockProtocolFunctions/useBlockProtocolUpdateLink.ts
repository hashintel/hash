import { BlockProtocolUpdateLinksFunction } from "blockprotocol";

import { useCallback } from "react";

export const useBlockProtocolUpdateLink = (): {
  updateLinks: BlockProtocolUpdateLinksFunction;
} => {
  const updateLinks: BlockProtocolUpdateLinksFunction = useCallback(
    async (_actions) => {
      throw new Error("Updating single links via linkId not yet implemented.");
    },
    [],
  );

  return {
    updateLinks,
  };
};
