import {
  createContext,
  Dispatch,
  FC,
  SetStateAction,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { fetchBlockMeta } from "@hashintel/hash-shared/blockMeta";

import { useCachedDefaultState } from "../components/hooks/useDefaultState";
import { BlocksMetaMap } from "./page/createEditorView";

interface UserBlocksContextState {
  value: BlocksMetaMap;
  setValue: Dispatch<SetStateAction<BlocksMetaMap>>;
  blockFetchFailed: boolean;
}

/** @private enforces use of custom provider */
const UserBlocksContext = createContext<UserBlocksContextState | null>(null);

export const UserBlocksProvider: FC<{ value: BlocksMetaMap }> = ({
  value: initialUserBlocks,
  children,
}) => {
  const [value, setValue] = useCachedDefaultState(
    initialUserBlocks,
    "hash-workspace-user-blocks",
    (nextInitialItems, prevInitialItems) => {
      return { ...prevInitialItems, ...nextInitialItems };
    },
  );

  const [blockFetchFailed, setBlockFetchFailed] = useState(false);

  useEffect(() => {
    const setInitialBlocks = () => {
      if (process.env.NEXT_PUBLIC_BLOCK_PROTOCOL_API_KEY) {
        const blocksMetadataHeaders = new Headers();
        blocksMetadataHeaders.set(
          "x-api-key",
          process.env.NEXT_PUBLIC_BLOCK_PROTOCOL_API_KEY,
        );

        const controller = new AbortController();
        const signal = controller.signal;

        fetch("https://blockprotocol.org/api/blocks", {
          headers: blocksMetadataHeaders,
          signal,
        })
          .then((response) => {
            if (!response.ok) {
              throw new Error(`Fetch failed with status: ${response.status}`);
            }
            return response.json();
          })
          .then(async (responseData) => {
            const apiProvidedBlocksMetaMap: BlocksMetaMap = {};
            for (const { componentId } of responseData.results) {
              apiProvidedBlocksMetaMap[componentId] = await fetchBlockMeta(
                componentId,
              );
            }

            setValue((prevValue) => {
              return { ...prevValue, ...apiProvidedBlocksMetaMap };
            });
          })
          .catch((error) => {
            // eslint-disable-next-line no-console -- TODO: consider using logger
            console.error(error);
            setBlockFetchFailed(true);
          });

        return controller;
      }
    };

    const controller = setInitialBlocks();

    return () => {
      if (controller) {
        controller.abort();
      }
    };
  }, [setValue]);

  const state = useMemo(
    () => ({ value, setValue, blockFetchFailed }),
    [value, setValue, blockFetchFailed],
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
