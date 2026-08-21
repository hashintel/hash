import { createContext, useContext } from "react";

import type { ComponentIdHashBlockMap } from "@local/hash-isomorphic-utils/blocks";
import type { Dispatch, SetStateAction } from "react";

interface UserBlocksContextState {
  value: ComponentIdHashBlockMap;
  setValue: Dispatch<SetStateAction<ComponentIdHashBlockMap>>;
  blockFetchFailed: boolean;
}

export const UserBlocksContext = createContext<UserBlocksContextState | null>(
  null,
);

export const useUserBlocks = () => {
  const state = useContext(UserBlocksContext);

  if (state === null) {
    throw new Error("no value has been provided to UserBlocksContext");
  }

  return state;
};
