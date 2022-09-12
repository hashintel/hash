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

import { fetchBlock } from "@hashintel/hash-shared/blocks";
import { useCachedDefaultState } from "../components/hooks/useDefaultState";
import { BlocksMap } from "./page/createEditorView";
import { useGetBlockProtocolBlocks } from "../components/hooks/useGetBlockProtocolBlocks";

interface UserBlocksContextState {
  value: BlocksMap;
  setValue: Dispatch<SetStateAction<BlocksMap>>;
  blockFetchFailed: boolean;
}

/** @private enforces use of custom provider */
const UserBlocksContext = createContext<UserBlocksContextState | null>(null);

export const UserBlocksProvider: FunctionComponent<{
  value: BlocksMap;
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
      if (process.env.NEXT_PUBLIC_BLOCK_PROTOCOL_API_KEY && data) {
        const apiProvidedBlocksMap: BlocksMap = {};
        for (const { componentId } of data.getBlockProtocolBlocks) {
          apiProvidedBlocksMap[componentId] = await fetchBlock(componentId);
        }

        setValue((prevValue) => {
          return { ...prevValue, ...apiProvidedBlocksMap };
        });
      }
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
