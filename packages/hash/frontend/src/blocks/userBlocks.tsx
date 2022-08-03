import {
  createContext,
  Dispatch,
  FunctionComponent,
  ReactNode,
  SetStateAction,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { fetchBlock } from "@hashintel/hash-shared/blocks";

import { useCachedDefaultState } from "../components/hooks/useDefaultState";
import { BlocksMap } from "./page/createEditorView";

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
            const apiProvidedBlocksMap: BlocksMap = {};
            for (const { componentId } of responseData.results) {
              apiProvidedBlocksMap[componentId] = await fetchBlock(componentId);
            }

            console.log("got here ==> ");
            console.log({ data: responseData });

            setValue((prevValue) => {
              return { ...prevValue, ...apiProvidedBlocksMap };
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

    console.log("got hereee");

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
