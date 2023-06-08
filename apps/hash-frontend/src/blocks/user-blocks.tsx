import {
  ComponentIdHashBlockMap,
  fetchBlock,
} from "@local/hash-isomorphic-utils/blocks";
import {
  createContext,
  Dispatch,
  FunctionComponent,
  ReactNode,
  SetStateAction,
  useContext,
  useEffect,
  useMemo,
} from "react";

import { useCachedDefaultState } from "../components/hooks/use-default-state";
import { useGetBlockProtocolBlocks } from "../components/hooks/use-get-block-protocol-blocks";

interface UserBlocksContextState {
  value: ComponentIdHashBlockMap;
  setValue: Dispatch<SetStateAction<ComponentIdHashBlockMap>>;
  blockFetchFailed: boolean;
}

/** @private enforces use of custom provider */
const UserBlocksContext = createContext<UserBlocksContextState | null>(null);

export const UserBlocksProvider: FunctionComponent<{
  value: ComponentIdHashBlockMap;
  children?: ReactNode;
}> = ({ value: initialUserBlocks, children }) => {
  const [value, setValue] = useCachedDefaultState(
    initialUserBlocks,
    "hash-workspace-user-blocks-v2",
    (nextInitialItems, prevInitialItems) => {
      return { ...prevInitialItems, ...nextInitialItems };
    },
  );

  const { data, error } = useGetBlockProtocolBlocks();

  useEffect(() => {
    const setInitialBlocks = async () => {
      if (!data) {
        return;
      }

      const apiProvidedBlocksMap: ComponentIdHashBlockMap = {};
      for (const { componentId } of data.getBlockProtocolBlocks) {
        apiProvidedBlocksMap[componentId] = await fetchBlock(componentId);
      }

      setValue((prevValue) => {
        return { ...prevValue, ...apiProvidedBlocksMap };
      });
    };

    void setInitialBlocks();
  }, [setValue, data]);

  const state = useMemo(
    () => ({ value, setValue, blockFetchFailed: !!error }),
    [value, setValue, error],
  );

  return (
    <UserBlocksContext.Provider value={state}>
      {children}
    </UserBlocksContext.Provider>
  );
};

export const useUserBlocks = () => {
  const state = useContext(UserBlocksContext);

  if (state === null) {
    throw new Error("no value has been provided to UserBlocksContext");
  }

  return state;
};
