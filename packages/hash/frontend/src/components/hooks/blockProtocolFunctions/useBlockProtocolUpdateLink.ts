import { BlockProtocolUpdateLinksFunction } from "blockprotocol";

import { useCallback } from "react";

export const useBlockProtocolUpdateLink = (): {
  updateLink: BlockProtocolUpdateLinksFunction;
} => {
  const updateLink: BlockProtocolUpdateLinksFunction = useCallback(
    async (_actions) => {
      throw new Error("Updating single links via linkId not yet implemented.");
    },
    [],
  );

  return {
    updateLink,
  };
};
